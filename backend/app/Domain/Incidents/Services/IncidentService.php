<?php

namespace App\Domain\Incidents\Services;

use App\Enums\FollowupStatus;
use App\Enums\MonitoringStatus;
use App\Models\Incident;
use App\Models\IncidentUpdate;
use App\Models\NetworkAssignment;
use App\Models\PrtgSensor;

class IncidentService
{
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
            'observation' => 'Incidencia creada por transición a CAÍDO (Ping).',
            'created_at' => now(),
        ]);

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

        $before = $active->followup_status?->value;
        $active->update([
            'recovered_at' => now(),
            'current_status' => MonitoringStatus::Operativo->value,
            'followup_status' => FollowupStatus::Recuperado,
        ]);

        IncidentUpdate::query()->create([
            'incident_id' => $active->id,
            'type' => 'SYSTEM',
            'status_before' => $before,
            'status_after' => FollowupStatus::Recuperado->value,
            'observation' => 'Incidencia cerrada por recuperación Ping (OPERATIVO).',
            'created_at' => now(),
        ]);
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
