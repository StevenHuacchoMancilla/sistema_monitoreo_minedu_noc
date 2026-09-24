<?php

namespace App\Domain\Incidents\Services;

use App\Domain\Tracking\Services\TrackingPrtgHookService;
use App\Enums\FollowupStatus;
use App\Enums\MonitoringStatus;
use App\Enums\RecoveryReviewStatus;
use App\Models\FieldDispatch;
use App\Models\Incident;
use App\Models\IncidentUpdate;
use App\Models\NetworkAssignment;
use App\Models\PrtgSensor;
use App\Support\OperationalTime;
use Carbon\CarbonInterface;
use Closure;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Log;

class IncidentService
{
    public function __construct(
        private readonly TrackingPrtgHookService $trackingHooks,
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
        if ($current === MonitoringStatus::Caido) {
            $this->ensureOpen($assignment, $sensor, $stateSince, $onAnomaly);

            return;
        }

        if ($previous === MonitoringStatus::Caido && $current === MonitoringStatus::Operativo) {
            $this->recover($assignment, $sensor, $stateSince, $onAnomaly);
        }
    }

    /**
     * started_at es inmutable al crear. Re-caída dentro de flap_reopen_seconds reabre la misma fila
     * (agrupa inestabilidad Ping en una sola incidencia operativa).
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
            $payload = [
                'current_status' => $sensor->normalized_status?->value,
            ];
            if ($downSince !== null) {
                $payload['prtg_down_started_at'] = OperationalTime::toStorage($downSince);
                // Igual Apps Script: si PRTG dice que cayó antes, corregir started_at
                // (cubre sync apagado en madrugada / primera detección tardía).
                $this->alignOpenStartedAt($active, $downSince, $payload, $onAnomaly);
            }
            $active->update($payload);

            return $active->fresh() ?? $active;
        }

        $reopened = $this->reopenRecentFlap($assignment, $sensor, $downSince);
        if ($reopened !== null) {
            $this->trackingHooks->onIncidentTechnicallyDown($reopened);

            return $reopened;
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
            'observation' => 'Incidencia creada por transición a CAÍDO (Ping). Clasificación: NUEVA CAÍDA. '.$clockNote,
            'created_at' => now(),
        ]);

        // Re-caída / nueva caída con Tracking abierto: avisar y vincular, sin cerrar Tracking.
        $this->trackingHooks->onIncidentTechnicallyDown($incident);

        return $incident;
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
        $hasActiveDispatch = FieldDispatch::query()
            ->where('incident_id', $incident->id)
            ->active()
            ->exists();
        $hadFieldTech = $before === FollowupStatus::TecnicoEnCampo->value || $hasActiveDispatch;
        $needsReview = $wasManaging || $hadFieldTech;

        $observationSuffix = '';
        if ($hasActiveDispatch) {
            $observationSuffix = ' Alerta: hay personal movilizado (desplazamiento activo). No se cancela automáticamente.';
        } elseif ($wasManaging) {
            $observationSuffix = ' Requiere revisión operativa (estaba en gestión).';
        }

        $payload = [
            'recovered_at' => $recoveredAt,
            'current_status' => MonitoringStatus::Operativo->value,
            'followup_status' => FollowupStatus::Recuperado,
            'recovered_while_managing' => $needsReview,
            'recovery_review_status' => $needsReview
                ? RecoveryReviewStatus::PendingReview->value
                : null,
            'recovery_reviewed_at' => null,
        ];
        if ($prtgEvidence !== null) {
            $payload['prtg_up_at'] = OperationalTime::toStorage($prtgEvidence);
        }
        $incident->update($payload);

        $clockNote = (bool) config('incidents.use_system_clock', false)
            ? ' Hora de cierre = reloj del sistema al detectar OPERATIVO.'
            : ' Hora de cierre = lastcheck − uptimesince PRTG.';

        IncidentUpdate::query()->create([
            'incident_id' => $incident->id,
            'type' => 'SYSTEM_RECOVERY',
            'status_before' => $before,
            'status_after' => FollowupStatus::Recuperado->value,
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
     * Reabre la última recuperación reciente del mismo Ping (flaps).
     * Conserva started_at original; limpia recovered_at.
     */
    private function reopenRecentFlap(
        NetworkAssignment $assignment,
        PrtgSensor $sensor,
        ?CarbonInterface $downSince,
    ): ?Incident {
        $window = max(0, (int) config('incidents.flap_reopen_seconds', 900));
        if ($window <= 0) {
            return null;
        }

        $recent = Incident::query()
            ->where('network_assignment_id', $assignment->id)
            ->where('prtg_sensor_id', $sensor->id)
            ->whereNotNull('recovered_at')
            ->where('recovered_at', '>=', now()->subSeconds($window))
            ->orderByDesc('recovered_at')
            ->first();

        if ($recent === null) {
            return null;
        }

        $before = $recent->followup_status?->value;
        $payload = [
            'recovered_at' => null,
            'prtg_up_at' => null,
            'current_status' => $sensor->normalized_status?->value ?? MonitoringStatus::Caido->value,
            'followup_status' => FollowupStatus::PendienteContacto,
            'recovered_while_managing' => false,
            'recovery_review_status' => null,
            'recovery_reviewed_at' => null,
        ];
        if ($downSince !== null) {
            $payload['prtg_down_started_at'] = OperationalTime::toStorage($downSince);
        }
        $recent->update($payload);

        IncidentUpdate::query()->create([
            'incident_id' => $recent->id,
            'type' => 'SYSTEM',
            'status_before' => $before,
            'status_after' => FollowupStatus::PendienteContacto->value,
            'observation' => sprintf(
                'Reabierta por re-caída dentro de %ds (coalesce de flaps). Misma incidencia; started_at original conservado.',
                $window
            ),
            'created_at' => now(),
        ]);

        return $recent->fresh() ?? $recent;
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
     */
    public function closeOperativeIncidents(): int
    {
        $open = Incident::query()
            ->active()
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
}
