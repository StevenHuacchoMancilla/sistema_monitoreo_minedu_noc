<?php

namespace App\Domain\Ticketera\Services;

use App\Domain\Incidents\Support\RootCauseLegend;
use App\Enums\FollowupStatus;
use App\Enums\ManagementClassification;
use App\Enums\ManagementScope;
use App\Enums\MineduReason;
use App\Enums\MonitoringStatus;
use App\Models\Incident;
use App\Models\IncidentManagement;
use App\Models\NetworkAssignment;
use App\Models\ServiceTicket;

/**
 * Pasa cada fila de la ticketera a una gestión del ticket:
 * código de causa, detalle y, si venía, la razón MINEDU.
 */
class TicketeraGestionWriter
{
    /**
     * @return array{created: int, updated: int, skipped: int, unmatched: int}
     */
    public function applyImported(): array
    {
        $counts = ['created' => 0, 'updated' => 0, 'skipped' => 0, 'unmatched' => 0];
        $assignments = $this->assignmentsByCid();

        ServiceTicket::query()
            ->where('source', ServiceTicket::SOURCE_IMPORT)
            ->orderBy('id')
            ->chunkById(200, function ($tickets) use (&$counts, $assignments) {
                foreach ($tickets as $ticket) {
                    $result = $this->apply($ticket, $assignments);
                    $counts[$result]++;
                }
            });

        return $counts;
    }

    /**
     * @param  array<string, NetworkAssignment>  $assignments
     */
    private function apply(ServiceTicket $ticket, array $assignments): string
    {
        if ($ticket->incident_id) {
            $incident = Incident::query()->find($ticket->incident_id);
            if ($incident === null) {
                return 'unmatched';
            }
            if (filled($incident->root_cause_code) && $incident->detection_source !== Incident::DETECTION_HISTORICAL) {
                return 'skipped';
            }
            $this->fill($incident, $ticket);

            return 'updated';
        }

        $assignment = $assignments[$ticket->cid] ?? null;
        if ($assignment === null || $ticket->opened_at === null) {
            return 'unmatched';
        }

        if ($ticket->status === ServiceTicket::STATUS_OPEN) {
            $live = Incident::query()
                ->falls()
                ->where('network_assignment_id', $assignment->id)
                ->whereNull('recovered_at')
                ->whereDoesntHave('serviceTicket')
                ->orderByDesc('id')
                ->first();
            if ($live !== null && blank($live->root_cause_code)) {
                $ticket->incident_id = $live->id;
                $ticket->school_id = $ticket->school_id ?: $live->school_id;
                $ticket->save();
                $this->fill($live, $ticket);

                return 'updated';
            }
        }

        $closed = $ticket->status === ServiceTicket::STATUS_CLOSED;
        $school = $assignment->school;
        $incident = Incident::query()->create([
            'school_id' => $assignment->school_id,
            'network_assignment_id' => $assignment->id,
            'prtg_sensor_id' => null,
            'detection_source' => Incident::DETECTION_HISTORICAL,
            'started_at' => $ticket->opened_at,
            'recovered_at' => $closed ? ($ticket->closed_at ?? $ticket->opened_at) : null,
            'current_status' => MonitoringStatus::Operativo->value,
            'followup_status' => $closed ? FollowupStatus::Cerrado : FollowupStatus::EnGestion,
            'management_classification' => ManagementClassification::Unclassified,
            'school_snapshot' => $school?->only([
                'id', 'current_sequence', 'codigo_local', 'local_educativo', 'provincia', 'distrito', 'clasificacion',
            ]),
            'network_snapshot' => $assignment->only(['id', 'cid']),
        ]);
        $ticket->incident_id = $incident->id;
        $ticket->school_id = $ticket->school_id ?: $assignment->school_id;
        $ticket->save();
        $this->fill($incident, $ticket);

        return 'created';
    }

    private function fill(Incident $incident, ServiceTicket $ticket): void
    {
        $code = strtoupper(trim((string) $ticket->cause_code));
        $legend = $code !== '' ? RootCauseLegend::findByCode($code) : null;
        $cause = $legend['cause'] ?? (trim((string) $ticket->cause) ?: null);
        $attention = $legend['attention'] ?? null;

        $incident->fill([
            'root_cause_group_code' => $legend['group_code'] ?? $incident->root_cause_group_code,
            'root_cause_code' => $code !== '' ? $code : $incident->root_cause_code,
            'cause' => $cause ?: $incident->cause,
            'detail_text' => trim((string) $ticket->detail) ?: $incident->detail_text,
            'minedu_reason' => $this->minedu($ticket->minedu) ?? $incident->minedu_reason,
            'management_scope' => in_array($attention, ['PEXT', 'PINT'], true)
                ? ManagementScope::from($attention)
                : $incident->management_scope,
        ])->save();

        $already = IncidentManagement::query()
            ->where('incident_id', $incident->id)
            ->where('observation', 'like', 'Gestión cargada desde la ticketera%')
            ->exists();
        if ($already) {
            return;
        }

        $noc = trim((string) ($ticket->opened_by_name ?? ''));
        IncidentManagement::query()->create([
            'incident_id' => $incident->id,
            'classification' => $incident->management_classification instanceof ManagementClassification
                ? $incident->management_classification->value
                : (string) ($incident->management_classification ?: ManagementClassification::Unclassified->value),
            'scope' => $incident->management_scope instanceof ManagementScope
                ? $incident->management_scope->value
                : $incident->management_scope,
            'detail' => $incident->detail_text,
            'observation' => 'Gestión cargada desde la ticketera'
                .($noc !== '' ? '. NOC de apertura: '.$noc : '')
                .($code !== '' ? '. '.$code : ''),
            'created_by' => null,
        ]);
    }

    private function minedu(?string $value): ?MineduReason
    {
        $text = mb_strtoupper(trim((string) $value));
        if ($text === '') {
            return null;
        }
        if (str_contains($text, 'ENLACE')) {
            return MineduReason::CaidaEnlace;
        }
        if (str_contains($text, 'ENERG')) {
            return MineduReason::CaidaEnergia;
        }
        if (str_contains($text, 'REQUER')) {
            return MineduReason::Requerimiento;
        }

        return null;
    }

    /**
     * @return array<string, NetworkAssignment>
     */
    private function assignmentsByCid(): array
    {
        $map = [];
        $rows = NetworkAssignment::query()->with('school')->whereNotNull('cid')->get();
        foreach ($rows as $assignment) {
            $cid = preg_replace('/\D+/', '', (string) $assignment->cid) ?? '';
            if ($cid === '') {
                continue;
            }
            if (! isset($map[$cid]) || $assignment->is_active) {
                $map[$cid] = $assignment;
            }
        }

        return $map;
    }
}
