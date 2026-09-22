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

class IncidentService
{
    public function __construct(
        private readonly TrackingPrtgHookService $trackingHooks,
    ) {}
    public function applyPingTransition(
        NetworkAssignment $assignment,
        PrtgSensor $sensor,
        ?MonitoringStatus $previous,
        ?MonitoringStatus $current
    ): void {
        if ($current === MonitoringStatus::Caido) {
            $this->ensureOpen($assignment, $sensor);

            return;
        }

        if ($previous === MonitoringStatus::Caido && $current === MonitoringStatus::Operativo) {
            $this->recover($assignment, $sensor);
        }
    }

    public function ensureOpen(NetworkAssignment $assignment, PrtgSensor $sensor): Incident
    {
        $active = Incident::query()
            ->where('network_assignment_id', $assignment->id)
            ->where('prtg_sensor_id', $sensor->id)
            ->whereNull('recovered_at')
            ->first();

        if ($active) {
            $active->update([
                'current_status' => $sensor->normalized_status?->value,
            ]);

            return $active;
        }

        $school = $assignment->school()->first();
        $incident = Incident::query()->create([
            'school_id' => $assignment->school_id,
            'network_assignment_id' => $assignment->id,
            'prtg_sensor_id' => $sensor->id,
            'started_at' => now(),
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

        IncidentUpdate::query()->create([
            'incident_id' => $incident->id,
            'type' => 'SYSTEM',
            'status_before' => null,
            'status_after' => FollowupStatus::PendienteContacto->value,
            'observation' => 'Incidencia creada por transición a CAÍDO (Ping). Clasificación: NUEVA CAÍDA.',
            'created_at' => now(),
        ]);

        // Re-caída / nueva caída con Tracking abierto: avisar y vincular, sin cerrar Tracking.
        $this->trackingHooks->onIncidentTechnicallyDown($incident);

        return $incident;
    }

    public function recover(NetworkAssignment $assignment, PrtgSensor $sensor): void
    {
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
            'PRTG reportó recuperación (Ping OPERATIVO).'
        );
    }

    /**
     * Cierre técnico por recuperación. No cancela gestión ni desplazamientos.
     */
    public function applyTechnicalRecovery(Incident $incident, string $observation): Incident
    {
        if ($incident->recovered_at !== null) {
            return $incident;
        }

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

        $incident->update([
            'recovered_at' => now(),
            'current_status' => MonitoringStatus::Operativo->value,
            'followup_status' => FollowupStatus::Recuperado,
            'recovered_while_managing' => $needsReview,
            'recovery_review_status' => $needsReview
                ? RecoveryReviewStatus::PendingReview->value
                : null,
            'recovery_reviewed_at' => null,
        ]);

        IncidentUpdate::query()->create([
            'incident_id' => $incident->id,
            'type' => 'SYSTEM_RECOVERY',
            'status_before' => $before,
            'status_after' => FollowupStatus::Recuperado->value,
            'observation' => $observation.$observationSuffix,
            'created_at' => now(),
        ]);

        $fresh = $incident->fresh() ?? $incident;

        // Tracking abierto → TECHNICAL_RECOVERY; NUNCA cierra el Tracking.
        $this->trackingHooks->onIncidentTechnicallyRecovered($fresh);

        return $fresh;
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
