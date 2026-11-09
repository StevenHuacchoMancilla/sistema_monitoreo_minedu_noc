<?php

namespace App\Domain\Incidents\Services;

use App\Domain\Ticketera\Services\ServiceTicketService;
use App\Domain\Tracking\Services\TrackingPrtgHookService;
use App\Enums\AffectedWanNode;
use App\Enums\FollowupStatus;
use App\Enums\ManagementClassification;
use App\Enums\MonitoringStatus;
use App\Enums\RecoveryReviewStatus;
use App\Models\Incident;
use App\Models\IncidentUpdate;
use App\Models\NetworkAssignment;
use App\Models\PrtgSensor;
use App\Support\OperationalTime;
use Carbon\CarbonInterface;
use Closure;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Log;
use InvalidArgumentException;

class IncidentService
{
    public function __construct(
        private readonly TrackingPrtgHookService $trackingHooks,
        private readonly ServiceTicketService $serviceTickets,
    ) {}
    /**
     * @param  ?CarbonInterface  $stateSince  Inicio del estado actual según PRTG (caída o recuperación).
     * @param  ?Closure(string, string, array<string, mixed>): void  $onAnomaly
     */
    public function applyPingTransition(
        NetworkAssignment $assignment,
        PrtgSensor $sensor,
        ?MonitoringStatus $previous,
        ?MonitoringStatus $current,
        ?CarbonInterface $stateSince = null,
        ?Closure $onAnomaly = null,
    ): void {
        // Solo CAÍDO (rojo) abre ticket. Intermitentes/parciales (amarillo) no cuentan como caída.
        if ($current === MonitoringStatus::Caido) {
            $this->ensureOpen($assignment, $sensor, $stateSince, $onAnomaly);

            return;
        }

        // Si ya había caída abierta y pasa a parcial, solo actualiza estado (no crea ticket nuevo).
        if ($current === MonitoringStatus::Parcial) {
            $active = Incident::query()
                ->where('network_assignment_id', $assignment->id)
                ->where('prtg_sensor_id', $sensor->id)
                ->whereNull('recovered_at')
                ->first();
            if ($active !== null && ! $active->isManualPartial()) {
                $beforeStatus = (string) ($active->current_status instanceof MonitoringStatus
                    ? $active->current_status->value
                    : ($active->current_status ?? ''));
                $active->update([
                    'current_status' => MonitoringStatus::Parcial->value,
                    'prtg_down_started_at' => $stateSince !== null
                        ? OperationalTime::toStorage($stateSince)
                        : $active->prtg_down_started_at,
                ]);
                // Sin notePartialToDown: es el camino inverso (caído → parcial).
                if ($beforeStatus !== MonitoringStatus::Parcial->value) {
                    IncidentUpdate::query()->create([
                        'incident_id' => $active->id,
                        'type' => 'SYSTEM',
                        'status_before' => $active->followup_status?->value,
                        'status_after' => $active->followup_status?->value,
                        'observation' => 'Ping pasó a Advertencia (parcial / intermitente). La caída sigue abierta hasta OPERATIVO.',
                        'created_at' => now(),
                    ]);
                }
            }

            return;
        }

        // Se recupera al volver a OPERATIVO desde caído o parcial (si había ticket abierto).
        if ($previous?->isOutage() && $current === MonitoringStatus::Operativo) {
            $this->recover($assignment, $sensor, $stateSince, $onAnomaly);
        }
    }

    /**
     * started_at queda fijo al crear. Si el colegio ya se recuperó y vuelve a caer,
     * se abre otra incidencia: la anterior conserva su hora de caída y su hora de recuperación,
     * aunque siga en gestión o con Tracking abierto.
     *
     * @param  ?Closure(string, string, array<string, mixed>): void  $onAnomaly
     */
    public function ensureOpen(
        NetworkAssignment $assignment,
        PrtgSensor $sensor,
        ?CarbonInterface $downSince = null,
        ?Closure $onAnomaly = null,
    ): Incident {
        $active = Incident::query()
            ->where('network_assignment_id', $assignment->id)
            ->where('prtg_sensor_id', $sensor->id)
            ->whereNull('recovered_at')
            ->first();

        if ($active) {
            // Caída parcial manual + Ping total CAÍDO → escalar a caída total (ya no es solo un enlace).
            if ($active->isManualPartial()) {
                $beforeFollowup = $active->followup_status?->value;
                $active->update([
                    'detection_source' => 'REALTIME_SYNC',
                    'affected_wan_node' => null,
                    'current_status' => $sensor->normalized_status?->value ?? MonitoringStatus::Caido->value,
                    'prtg_down_started_at' => $downSince !== null
                        ? OperationalTime::toStorage($downSince)
                        : $active->prtg_down_started_at,
                ]);
                IncidentUpdate::query()->create([
                    'incident_id' => $active->id,
                    'type' => 'SYSTEM',
                    'status_before' => $beforeFollowup,
                    'status_after' => $beforeFollowup,
                    'observation' => 'Escalada: Ping total CAÍDO. La caída parcial de enlace pasa a incidencia PRTG completa.',
                    'created_at' => now(),
                ]);
                $fresh = $active->fresh() ?? $active;
                $this->trackingHooks->onIncidentTechnicallyDown($fresh);

                return $fresh;
            }

            $beforeStatus = (string) ($active->current_status instanceof MonitoringStatus
                ? $active->current_status->value
                : ($active->current_status ?? ''));
            $nextStatus = $sensor->normalized_status?->value;
            $payload = [
                'current_status' => $nextStatus,
            ];
            if ($downSince !== null) {
                $payload['prtg_down_started_at'] = OperationalTime::toStorage($downSince);
                // Igual Apps Script: si PRTG dice que cayó antes, corregir started_at
                // (cubre sync apagado en madrugada / primera detección tardía).
                $this->alignOpenStartedAt($active, $downSince, $payload, $onAnomaly);
            }
            $active->update($payload);
            $this->notePartialToDown($active, $beforeStatus, $nextStatus);

            return $active->fresh() ?? $active;
        }

        // Incidencia grave abierta (recuperó en PRTG pero no se cerró): re-cae sin ticket nuevo.
        $openGrave = Incident::query()
            ->where('network_assignment_id', $assignment->id)
            ->where('is_grave_incident', true)
            ->whereNull('grave_closed_at')
            ->whereNotNull('recovered_at')
            ->orderByDesc('id')
            ->first();

        if ($openGrave !== null) {
            return $this->reopenOpenGrave($openGrave, $sensor, $downSince, $onAnomaly);
        }

        $startedAt = $this->resolveStartedAt($assignment, $downSince, $onAnomaly);

        $school = $assignment->school()->first();
        $incident = Incident::query()->create([
            'school_id' => $assignment->school_id,
            'network_assignment_id' => $assignment->id,
            'prtg_sensor_id' => $sensor->id,
            'detection_source' => 'REALTIME_SYNC',
            'prtg_down_started_at' => $downSince !== null ? OperationalTime::toStorage($downSince) : null,
            'started_at' => $startedAt,
            'current_status' => $sensor->normalized_status?->value ?? MonitoringStatus::Caido->value,
            'followup_status' => FollowupStatus::PendienteContacto,
            'management_classification' => \App\Enums\ManagementClassification::NewOutage,
            'evidence_observations' => null,
            'school_snapshot' => $school?->only([
                'id', 'current_sequence', 'legacy_reference', 'codigo_local', 'codigo_modular',
                'local_educativo', 'departamento', 'provincia', 'distrito', 'centro_poblado', 'clasificacion',
            ]),
            'network_snapshot' => $assignment->only([
                'id', 'cid', 'cid_status', 'prtg_device_name', 'capacidad_mbps', 'tecnologia_acceso',
                'nodo_pop', 'ip_publica', 'ip_loopback', 'ip_wan_principal', 'ip_lan',
            ]),
        ]);

        $clockNote = (bool) config('incidents.use_system_clock', false)
            ? 'Hora de apertura = reloj del sistema al detectar.'
            : 'Hora de apertura = lastcheck − downtimesince PRTG (igual Apps Script).';

        IncidentUpdate::query()->create([
            'incident_id' => $incident->id,
            'type' => 'SYSTEM',
            'status_before' => null,
            'status_after' => FollowupStatus::PendienteContacto->value,
            'observation' => ($sensor->normalized_status === MonitoringStatus::Parcial
                ? 'Incidencia creada por Ping en ADVERTENCIA (parcial / intermitente).'
                : 'Incidencia creada por transición a CAÍDO (Ping).')
                .' Clasificación: NUEVA CAÍDA. '.$clockNote,
            'created_at' => now(),
        ]);

        // El ticket TGS nace solo al gestionar (IncidentManagementService), no al detectar la caída.
        // Re-caída / nueva caída con Tracking abierto: avisar y vincular, sin cerrar Tracking.
        $this->trackingHooks->onIncidentTechnicallyDown($incident);

        return $incident;
    }

    /**
     * Reabre una incidencia grave que había recuperado en PRTG: mismo caso y mismo ticket TGS.
     *
     * @param  ?Closure(string, string, array<string, mixed>): void  $onAnomaly
     */
    public function reopenOpenGrave(
        Incident $incident,
        PrtgSensor $sensor,
        ?CarbonInterface $downSince = null,
        ?Closure $onAnomaly = null,
    ): Incident {
        $before = $incident->followup_status?->value;
        $incident->loadMissing('networkAssignment');
        $assignment = $incident->networkAssignment;
        $downAt = $downSince !== null
            ? OperationalTime::toStorage($downSince)
            : ($assignment
                ? $this->resolveStartedAt($assignment, $downSince, $onAnomaly)
                : now());

        $keepFollowup = $incident->followup_status instanceof FollowupStatus
            && in_array($incident->followup_status->value, FollowupStatus::managingValues(), true);
        $followup = $keepFollowup ? $incident->followup_status : FollowupStatus::EnGestion;

        $incident->forceFill([
            'recovered_at' => null,
            'prtg_up_at' => null,
            'current_status' => $sensor->normalized_status?->value ?? MonitoringStatus::Caido->value,
            'prtg_sensor_id' => $sensor->id,
            'prtg_down_started_at' => $downAt,
            'followup_status' => $followup,
            'recovered_while_managing' => false,
            'recovery_review_status' => null,
            'recovery_reviewed_at' => null,
        ])->save();

        IncidentUpdate::query()->create([
            'incident_id' => $incident->id,
            'type' => 'SYSTEM',
            'status_before' => $before,
            'status_after' => $followup->value,
            'observation' => 'Re-caída con incidencia abierta: se reutiliza el mismo caso y ticket (etiqueta En incidencia).',
            'created_at' => now(),
        ]);

        $fresh = $incident->fresh() ?? $incident;
        $this->serviceTickets->markDownAgain($fresh);
        $this->trackingHooks->onIncidentTechnicallyDown($fresh);

        return $fresh;
    }

    /** Solo parcial → caído. Una recuperación desde amarillo no marca nada. */
    public function notePartialToDown(Incident $incident, ?string $before, ?string $next): void
    {
        if ($before !== MonitoringStatus::Parcial->value || $next !== MonitoringStatus::Caido->value) {
            return;
        }
        if ($incident->escalated_from_partial) {
            return;
        }

        $incident->forceFill(['escalated_from_partial' => true])->save();
        IncidentUpdate::query()->create([
            'incident_id' => $incident->id,
            'type' => 'SYSTEM',
            'status_before' => $incident->followup_status?->value,
            'status_after' => $incident->followup_status?->value,
            'observation' => 'Ping pasó de Advertencia (parcial) a Caído en PRTG.',
            'created_at' => now(),
        ]);
    }

    /**
     * @param  ?Closure(string, string, array<string, mixed>): void  $onAnomaly
     */
    public function recover(
        NetworkAssignment $assignment,
        PrtgSensor $sensor,
        ?CarbonInterface $upSince = null,
        ?Closure $onAnomaly = null,
    ): void {
        $active = Incident::query()
            ->where('network_assignment_id', $assignment->id)
            ->where('prtg_sensor_id', $sensor->id)
            ->whereNull('recovered_at')
            ->first();

        if (! $active) {
            return;
        }

        // Caída parcial de un enlace: el Ping suele seguir OPERATIVO; no auto-cerrar.
        if ($active->isManualPartial()) {
            return;
        }

        $this->applyTechnicalRecovery(
            $active,
            'PRTG reportó recuperación (Ping OPERATIVO).',
            $upSince,
            $onAnomaly,
        );
    }

    /**
     * Cierre técnico por recuperación. No cancela gestión ni desplazamientos.
     * recovered_at es inmutable una vez fijado.
     *
     * @param  ?Closure(string, string, array<string, mixed>): void  $onAnomaly
     */
    public function applyTechnicalRecovery(
        Incident $incident,
        string $observation,
        ?CarbonInterface $upSince = null,
        ?Closure $onAnomaly = null,
    ): Incident {
        if ($incident->recovered_at !== null) {
            return $incident;
        }

        $prtgEvidence = $upSince;
        $recoveredAt = $this->resolveRecoveredAt($incident, $upSince, $onAnomaly);

        $before = $incident->followup_status?->value;
        $wasManaging = $before !== null && in_array($before, FollowupStatus::managingValues(), true);
        $hadFieldTech = $before === FollowupStatus::TecnicoEnCampo->value;
        $needsReview = $wasManaging || $hadFieldTech;
        // Sábado/domingo (hora Lima): no encolar Pendiente de cierre.
        $weekendRecovery = OperationalTime::isWeekend($recoveredAt);

        $observationSuffix = $wasManaging
            ? ' Requiere cierre operativo (estaba en gestión).'
            : '';

        // Incidencias graves abiertas: PRTG UP no cierra ni quita el flag; solo marca recuperación técnica.
        $isOpenGrave = (bool) $incident->is_grave_incident && $incident->grave_closed_at === null;

        // Grave: sigue en gestión hasta cierre manual.
        // Lun–vie: toda recuperación desde Caídas totales → Pendiente de cierre (no perder seguimiento).
        // Sáb–dom: no pasa a Pendiente de cierre; cierre automático (sin cola operativa).
        if ($isOpenGrave) {
            $afterStatus = $incident->followup_status ?? FollowupStatus::EnGestion;
            $observationSuffix .= ' Incidencia grave permanece abierta (cierre manual).';
        } elseif ($weekendRecovery) {
            $afterStatus = FollowupStatus::Cerrado;
            $observationSuffix .= ' Fin de semana (sáb/dom): recuperación sin Pendiente de cierre.';
        } else {
            $afterStatus = FollowupStatus::PendienteCierre;
            $observationSuffix .= $needsReview
                ? ' Recuperado en gestión: pasa a Pendiente de cierre.'
                : ' Recuperado desde Caídas totales: pasa a Pendiente de cierre.';
        }

        $queueClose = ! $isOpenGrave && ! $weekendRecovery;
        $payload = [
            'recovered_at' => $recoveredAt,
            'current_status' => MonitoringStatus::Operativo->value,
            'followup_status' => $afterStatus,
            'recovered_while_managing' => $isOpenGrave || $weekendRecovery ? false : $needsReview,
            'recovery_review_status' => ($queueClose && $needsReview)
                ? RecoveryReviewStatus::PendingReview->value
                : null,
            'recovery_reviewed_at' => null,
        ];
        if ($prtgEvidence !== null) {
            $payload['prtg_up_at'] = OperationalTime::toStorage($prtgEvidence);
        }
        $incident->update($payload);
        $freshForTicket = $incident->fresh() ?? $incident;
        $this->serviceTickets->markRestored($freshForTicket, $recoveredAt);
        if ($afterStatus === FollowupStatus::Cerrado && ! $isOpenGrave) {
            $this->serviceTickets->close($freshForTicket, 'sistema', $recoveredAt);
        }

        $clockNote = (bool) config('incidents.use_system_clock', false)
            ? ' Hora de cierre = reloj del sistema al detectar OPERATIVO.'
            : ' Hora de cierre = lastcheck − uptimesince PRTG.';

        IncidentUpdate::query()->create([
            'incident_id' => $incident->id,
            'type' => 'SYSTEM_RECOVERY',
            'status_before' => $before,
            'status_after' => $afterStatus->value,
            'observation' => $observation.$observationSuffix.$clockNote,
            'created_at' => now(),
        ]);

        $fresh = $incident->fresh() ?? $incident;

        // Tracking abierto → TECHNICAL_RECOVERY; NUNCA cierra el Tracking.
        $this->trackingHooks->onIncidentTechnicallyRecovered($fresh);

        return $fresh;
    }

    /**
     * Si la incidencia activa tiene started_at posterior al inicio PRTG
     * (lastcheck − downtimesince), adelanta started_at. No toca gestiones humanas.
     *
     * @param  array<string, mixed>  $payload
     * @param  ?Closure(string, string, array<string, mixed>): void  $onAnomaly
     */
    private function alignOpenStartedAt(
        Incident $active,
        CarbonInterface $downSince,
        array &$payload,
        ?Closure $onAnomaly,
    ): void {
        if ((bool) config('incidents.use_system_clock', false)) {
            return;
        }
        if ((int) $active->managements()->count() > 0) {
            return;
        }

        $prtgStart = OperationalTime::toStorage($downSince);
        $currentStart = $active->started_at;
        if ($currentStart === null) {
            $payload['started_at'] = $prtgStart;

            return;
        }

        // Solo adelantar (caída real antes de la detección).
        if ($prtgStart->lessThan($currentStart->copy()->subSeconds(30))) {
            $this->report($onAnomaly, 'PRTG_ALIGN_STARTED_AT', 'started_at adelantado a downtimesince PRTG (sync tardío).', [
                'incident_id' => $active->id,
                'from' => $currentStart->toIso8601String(),
                'to' => $prtgStart->toIso8601String(),
            ]);
            $payload['started_at'] = $prtgStart;
        }
    }

    /**
     * @param  ?Closure(string, string, array<string, mixed>): void  $onAnomaly
     */
    private function resolveStartedAt(
        NetworkAssignment $assignment,
        ?CarbonInterface $downSince,
        ?Closure $onAnomaly,
    ): Carbon {
        $now = now();

        if ((bool) config('incidents.use_system_clock', false)) {
            return $now->copy();
        }

        $candidate = $downSince !== null ? OperationalTime::toStorage($downSince) : $now->copy();

        if ($candidate->greaterThan($now)) {
            $this->report($onAnomaly, 'PRTG_FUTURE_TIMESTAMP', 'Inicio de caída PRTG en el futuro; se usa la hora de detección.', [
                'parsed' => $candidate->toIso8601String(),
                'now' => $now->toIso8601String(),
            ]);
            $candidate = $now->copy();
        }

        $lastRecoveredAt = Incident::query()
            ->where('network_assignment_id', $assignment->id)
            ->whereNotNull('recovered_at')
            ->max('recovered_at');

        if ($lastRecoveredAt !== null) {
            $last = Carbon::parse($lastRecoveredAt, OperationalTime::storageTz());
            if ($candidate->lessThan($last)) {
                $this->report($onAnomaly, 'PRTG_START_BEFORE_LAST_RECOVERY', 'Inicio de caída PRTG anterior a la última recuperación; se usa esa recuperación como inicio.', [
                    'parsed' => $candidate->toIso8601String(),
                    'last_recovered_at' => $last->toIso8601String(),
                ]);
                $candidate = $last;
            }
        }

        return $candidate;
    }

    /**
     * @param  ?Closure(string, string, array<string, mixed>): void  $onAnomaly
     */
    private function resolveRecoveredAt(Incident $incident, ?CarbonInterface $upSince, ?Closure $onAnomaly): Carbon
    {
        $now = now();

        if ((bool) config('incidents.use_system_clock', false)) {
            $startedAt = $incident->started_at;
            if ($startedAt !== null && $now->lessThan($startedAt)) {
                return Carbon::instance($startedAt);
            }

            return $now->copy();
        }

        $candidate = $upSince !== null ? OperationalTime::toStorage($upSince) : $now->copy();
        $startedAt = $incident->started_at;

        $invalid = $candidate->greaterThan($now)
            || ($startedAt !== null && $candidate->lessThan($startedAt));

        if (! $invalid) {
            return $candidate;
        }

        $fallback = $startedAt !== null && $now->lessThan($startedAt) ? Carbon::instance($startedAt) : $now->copy();
        $this->report($onAnomaly, 'INVALID_RECOVERY_TIMESTAMP', 'Hora de recuperación PRTG inválida (futura o anterior al inicio); se usa la hora de detección.', [
            'incident_id' => $incident->id,
            'parsed' => $candidate->toIso8601String(),
            'started_at' => $startedAt?->toIso8601String(),
            'now' => $now->toIso8601String(),
            'fallback' => $fallback->toIso8601String(),
        ]);

        return $fallback;
    }

    /**
     * @param  ?Closure(string, string, array<string, mixed>): void  $onAnomaly
     * @param  array<string, mixed>  $context
     */
    private function report(?Closure $onAnomaly, string $code, string $message, array $context): void
    {
        $context['timezone'] = OperationalTime::storageTz();
        Log::warning("[TIME] {$code}: {$message}", $context);
        if ($onAnomaly !== null) {
            $onAnomaly($code, $message, $context);
        }
    }

    /**
     * Cierra incidencias abiertas cuyo Ping ya volvió a OPERATIVO.
     * No toca MANUAL_PARTIAL (colegio online con un enlace caído).
     */
    public function closeOperativeIncidents(): int
    {
        $open = Incident::query()
            ->active()
            ->where(function ($q) {
                $q->whereNull('detection_source')
                    ->orWhere('detection_source', '!=', Incident::DETECTION_MANUAL_PARTIAL);
            })
            ->with(['sensor', 'networkAssignment'])
            ->get();

        $closed = 0;
        foreach ($open as $incident) {
            $status = $incident->sensor?->normalized_status;
            if ($status !== MonitoringStatus::Operativo) {
                continue;
            }
            if ($incident->networkAssignment && $incident->sensor) {
                $this->recover($incident->networkAssignment, $incident->sensor);
                $closed++;
            }
        }

        return $closed;
    }

    /**
     * Registra caída de un solo enlace (doble WAN / P2P) mientras el Ping puede seguir OPERATIVO.
     * No se auto-cierra por PRTG; se cierra al cerrar Tracking o al escalar a CAÍDO total.
     */
    public function openManualPartial(
        NetworkAssignment $assignment,
        AffectedWanNode $node,
        int $userId,
        ?string $detail = null,
    ): Incident {
        if ($userId < 1) {
            throw new InvalidArgumentException('Se requiere un usuario autenticado.');
        }

        $assignment->loadMissing(['school', 'sensors']);

        $sensor = $assignment->sensors
            ->first(fn (PrtgSensor $s) => strcasecmp((string) $s->name, 'Ping') === 0)
            ?? $assignment->sensors->first();

        if ($sensor === null) {
            throw new InvalidArgumentException('El colegio no tiene sensor Ping en PRTG para asociar la incidencia.');
        }

        if ($sensor->normalized_status === MonitoringStatus::Caido) {
            throw new InvalidArgumentException(
                'El Ping ya está CAÍDO en PRTG. Usa la cola de caídas activas (no hace falta caída parcial).'
            );
        }

        $existing = Incident::query()
            ->falls()
            ->where('network_assignment_id', $assignment->id)
            ->whereNull('recovered_at')
            ->first();

        if ($existing) {
            throw new InvalidArgumentException(
                $existing->isManualPartial()
                    ? 'Ya hay una caída de enlace abierta para este colegio.'
                    : 'Ya hay una incidencia activa (caída total). Continúa la gestión desde caídas activas.'
            );
        }

        $school = $assignment->school;
        $nodeLabel = $node->label();
        $nodoName = $node === AffectedWanNode::Principal
            ? ($assignment->nodo_acceso_a ?: 'N/A')
            : ($assignment->nodo_acceso_b ?: 'N/A');
        $wanIp = $node === AffectedWanNode::Principal
            ? ($assignment->ip_wan_principal ?: null)
            : ($assignment->ip_wan_secundaria ?: null);

        $detailText = trim((string) ($detail ?: ''));
        if ($detailText === '') {
            $detailText = "Caída parcial · {$nodeLabel} · {$nodoName}"
                .($wanIp ? " · {$wanIp}" : '');
        }

        $incident = Incident::query()->create([
            'school_id' => $assignment->school_id,
            'network_assignment_id' => $assignment->id,
            'prtg_sensor_id' => $sensor->id,
            'detection_source' => Incident::DETECTION_MANUAL_PARTIAL,
            'affected_wan_node' => $node,
            'started_at' => now(),
            'current_status' => MonitoringStatus::Parcial->value,
            'followup_status' => FollowupStatus::PendienteContacto,
            'management_classification' => ManagementClassification::NewOutage,
            'outage_text' => "Parcial {$node->value}",
            'detail_text' => $detailText,
            'school_snapshot' => $school?->only([
                'id', 'current_sequence', 'legacy_reference', 'codigo_local', 'codigo_modular',
                'local_educativo', 'departamento', 'provincia', 'distrito', 'centro_poblado', 'clasificacion',
            ]),
            'network_snapshot' => $assignment->only([
                'id', 'cid', 'cid_status', 'prtg_device_name', 'capacidad_mbps', 'tecnologia_acceso',
                'nodo_pop', 'ip_publica', 'ip_loopback', 'ip_wan_principal', 'ip_lan',
                'nodo_acceso_a', 'nodo_acceso_b', 'ip_wan_secundaria',
            ]),
        ]);

        IncidentUpdate::query()->create([
            'incident_id' => $incident->id,
            'type' => 'SYSTEM',
            'status_before' => null,
            'status_after' => FollowupStatus::PendienteContacto->value,
            'observation' => "Incidencia manual: caída de enlace ({$nodeLabel}). Colegio puede seguir OPERATIVO en Ping. Cierre vía Tracking o al caer ambos enlaces.",
            'user_id' => $userId,
            'created_at' => now(),
        ]);

        $this->serviceTickets->ensureForIncident($incident);

        return $incident->fresh() ?? $incident;
    }

    /**
     * Ticket abierto a mano (CID o TSS) cuando la caída no llega por PRTG.
     * Si el colegio ya tiene una caída abierta, se devuelve esa.
     */
    public function openManualReported(
        NetworkAssignment $assignment,
        int $userId,
        ?string $detail = null,
        ?CarbonInterface $startedAt = null,
    ): Incident {
        if ($userId < 1) {
            throw new InvalidArgumentException('Se requiere un usuario autenticado.');
        }

        $assignment->loadMissing(['school', 'sensors']);
        $existing = Incident::query()
            ->falls()
            ->where('network_assignment_id', $assignment->id)
            ->whereNull('recovered_at')
            ->orderByDesc('id')
            ->first();
        if ($existing) {
            $this->serviceTickets->ensureForIncident($existing);

            return $existing->fresh() ?? $existing;
        }

        $sensor = $assignment->sensors
            ->first(fn (PrtgSensor $s) => strcasecmp((string) $s->name, 'Ping') === 0)
            ?? $assignment->sensors->first();
        if ($sensor === null) {
            throw new InvalidArgumentException('Ese colegio no tiene sensor en PRTG para abrir el ticket.');
        }

        $school = $assignment->school;
        $incident = Incident::query()->create([
            'school_id' => $assignment->school_id,
            'network_assignment_id' => $assignment->id,
            'prtg_sensor_id' => $sensor->id,
            'detection_source' => 'MANUAL',
            'started_at' => $startedAt ? OperationalTime::toStorage($startedAt) : now(),
            'current_status' => MonitoringStatus::Caido->value,
            'followup_status' => FollowupStatus::PendienteContacto,
            'management_classification' => ManagementClassification::NewOutage,
            'detail_text' => $detail,
            'school_snapshot' => $school?->only([
                'id', 'current_sequence', 'legacy_reference', 'codigo_local', 'codigo_modular',
                'local_educativo', 'departamento', 'provincia', 'distrito', 'centro_poblado', 'clasificacion',
            ]),
            'network_snapshot' => $assignment->only([
                'id', 'cid', 'cid_status', 'prtg_device_name', 'capacidad_mbps', 'tecnologia_acceso',
                'nodo_pop', 'ip_publica', 'ip_loopback', 'ip_wan_principal', 'ip_lan',
            ]),
        ]);

        IncidentUpdate::query()->create([
            'incident_id' => $incident->id,
            'type' => 'SYSTEM',
            'status_before' => null,
            'status_after' => FollowupStatus::PendienteContacto->value,
            'observation' => 'Ticket manual. La caída se registró fuera de PRTG.',
            'user_id' => $userId,
            'created_at' => now(),
        ]);

        $this->serviceTickets->ensureForIncident($incident);

        return $incident->fresh() ?? $incident;
    }
}
