<?php

namespace App\Domain\Incidents\Services;

use App\Enums\MineduReason;
use App\Models\Incident;
use App\Support\OperationalTime;
use Illuminate\Support\Str;
use InvalidArgumentException;

/**
 * Caídas abiertas con hora parecida. Cada colegio conserva su ticket;
 * el operador les pone el mismo motivo MINEDU.
 */
class SameHourOutageService
{
    /**
     * @return list<array<string, mixed>>
     */
    public function clusters(int $windowMinutes = 15): array
    {
        $windowMinutes = max(5, min($windowMinutes, 60));
        $open = Incident::query()
            ->with(['school:id,local_educativo,codigo_local,current_sequence,provincia,distrito', 'networkAssignment:id,cid'])
            ->whereNull('recovered_at')
            ->orderBy('started_at')
            ->get();

        $clusters = [];
        $current = [];
        $anchor = null;
        foreach ($open as $incident) {
            if ($incident->started_at === null) {
                continue;
            }
            if ($anchor === null) {
                $current = [$incident];
                $anchor = $incident->started_at;
                continue;
            }
            $delta = abs($incident->started_at->getTimestamp() - $anchor->getTimestamp());
            if ($delta <= $windowMinutes * 60) {
                $current[] = $incident;
                continue;
            }
            if (count($current) >= 2) {
                $clusters[] = $current;
            }
            $current = [$incident];
            $anchor = $incident->started_at;
        }
        if (count($current) >= 2) {
            $clusters[] = $current;
        }

        return array_map(fn (array $rows) => $this->present($rows), $clusters);
    }

    /**
     * @param  list<int>  $incidentIds
     */
    public function applyReason(array $incidentIds, MineduReason $reason, ?string $detail): int
    {
        $ids = array_values(array_unique(array_map('intval', $incidentIds)));
        if (count($ids) < 2) {
            throw new InvalidArgumentException('Selecciona al menos dos colegios.');
        }

        $incidents = Incident::query()->whereIn('id', $ids)->whereNull('recovered_at')->get();
        if ($incidents->count() < 2) {
            throw new InvalidArgumentException('Esas caídas ya no están activas.');
        }

        $groupId = (string) Str::uuid();
        foreach ($incidents as $incident) {
            $incident->minedu_reason = $reason;
            $incident->outage_group_id = $groupId;
            if (filled($detail)) {
                $incident->detail_text = $detail;
            }
            $incident->save();
        }

        return $incidents->count();
    }

    /**
     * @param  list<Incident>  $rows
     * @return array<string, mixed>
     */
    private function present(array $rows): array
    {
        $first = $rows[0]->started_at;
        $last = $rows[array_key_last($rows)]->started_at;

        return [
            'started_from' => $first?->toIso8601String(),
            'started_to' => $last?->toIso8601String(),
            'label' => OperationalTime::format($first, 'd/m/Y H:i'),
            'count' => count($rows),
            'incidents' => array_map(fn (Incident $incident) => [
                'incident_id' => $incident->id,
                'cid' => $incident->networkAssignment?->cid,
                'tss' => $incident->school?->current_sequence,
                'local_educativo' => $incident->school?->local_educativo,
                'codigo_local' => $incident->school?->codigo_local,
                'provincia' => $incident->school?->provincia,
                'distrito' => $incident->school?->distrito,
                'started_at' => OperationalTime::format($incident->started_at, 'd/m/Y H:i'),
                'minedu_reason' => $incident->minedu_reason instanceof MineduReason
                    ? $incident->minedu_reason->value
                    : $incident->minedu_reason,
                'minedu_reason_label' => $incident->minedu_reason instanceof MineduReason
                    ? $incident->minedu_reason->label()
                    : null,
                'outage_group_id' => $incident->outage_group_id,
            ], $rows),
        ];
    }
}
