<?php

namespace App\Domain\Incidents\Services;

use App\Enums\FollowupStatus;
use App\Enums\MonitoringStatus;
use App\Models\Incident;
use App\Models\IncidentUpdate;
use App\Support\OperationalTime;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Fusiona micro-caídas (flaps) consecutivas del mismo Ping en una sola incidencia.
 * Conserva started_at del primero y recovered_at del último.
 * No toca incidencias con gestión, tracking o desplazamiento.
 */
class IncidentFlapCoalesceService
{
    /**
     * @return array{
     *   summary: array{sensors: int, chains: int, absorbed: int, kept: int, skipped_protected: int},
     *   chains: array<int, array<string, mixed>>
     * }
     */
    public function coalesce(
        ?int $schoolId = null,
        ?string $cid = null,
        ?int $windowSeconds = null,
        bool $dryRun = true,
    ): array {
        $window = $windowSeconds ?? (int) config('incidents.history_coalesce_seconds', 1800);
        $window = max(0, $window);

        $query = Incident::query()
            ->withCount(['managements', 'trackingRecords', 'fieldDispatches'])
            ->orderBy('prtg_sensor_id')
            ->orderBy('started_at')
            ->orderBy('id');

        if ($schoolId !== null) {
            $query->where('school_id', $schoolId);
        }
        if ($cid !== null && $cid !== '') {
            $query->whereHas('networkAssignment', fn ($q) => $q->where('cid', $cid));
        }

        /** @var Collection<int, Collection<int, Incident>> $bySensor */
        $bySensor = $query->get()->groupBy(fn (Incident $i) => (string) ($i->prtg_sensor_id ?? 'na-'.$i->network_assignment_id));

        $chainsOut = [];
        $summary = [
            'sensors' => $bySensor->count(),
            'chains' => 0,
            'absorbed' => 0,
            'kept' => 0,
            'skipped_protected' => 0,
        ];

        foreach ($bySensor as $sensorKey => $rows) {
            $chains = $this->buildChains($rows->values(), $window);
            foreach ($chains as $chain) {
                if (count($chain) < 2) {
                    continue;
                }

                $protected = collect($chain)->first(fn (Incident $i) => $this->isProtected($i));
                if ($protected !== null) {
                    $summary['skipped_protected']++;
                    $chainsOut[] = $this->describeChain($chain, $window, 'SKIP_PROTECTED', $dryRun);
                    continue;
                }

                $summary['chains']++;
                $summary['absorbed'] += count($chain) - 1;
                $summary['kept']++;

                $desc = $this->describeChain($chain, $window, $dryRun ? 'WOULD_MERGE' : 'MERGED', $dryRun);
                $chainsOut[] = $desc;

                if (! $dryRun) {
                    $this->applyMerge($chain);
                }
            }
        }

        return ['summary' => $summary, 'chains' => $chainsOut];
    }

    /**
     * @param  Collection<int, Incident>  $rows
     * @return array<int, array<int, Incident>>
     */
    private function buildChains(Collection $rows, int $window): array
    {
        if ($rows->isEmpty()) {
            return [];
        }

        $chains = [];
        $current = [$rows[0]];

        for ($i = 1; $i < $rows->count(); $i++) {
            /** @var Incident $prev */
            $prev = $current[array_key_last($current)];
            /** @var Incident $next */
            $next = $rows[$i];

            if ($prev->recovered_at === null) {
                $chains[] = $current;
                $current = [$next];
                continue;
            }

            $gap = $next->started_at->getTimestamp() - $prev->recovered_at->getTimestamp();
            if ($gap >= 0 && $gap <= $window) {
                $current[] = $next;
                continue;
            }

            $chains[] = $current;
            $current = [$next];
        }

        $chains[] = $current;

        return $chains;
    }

    private function isProtected(Incident $incident): bool
    {
        return ((int) ($incident->managements_count ?? 0)) > 0
            || ((int) ($incident->tracking_records_count ?? 0)) > 0
            || ((int) ($incident->field_dispatches_count ?? 0)) > 0;
    }

    /**
     * @param  array<int, Incident>  $chain
     * @return array<string, mixed>
     */
    private function describeChain(array $chain, int $window, string $action, bool $dryRun): array
    {
        $first = $chain[0];
        $last = $chain[array_key_last($chain)];
        $tz = OperationalTime::tz();

        return [
            'action' => $action,
            'dry_run' => $dryRun,
            'window_seconds' => $window,
            'school_id' => $first->school_id,
            'sensor_id' => $first->prtg_sensor_id,
            'keep_id' => $first->id,
            'absorb_ids' => collect($chain)->slice(1)->pluck('id')->values()->all(),
            'count' => count($chain),
            'started_at' => $first->started_at?->timezone($tz)->format('Y-m-d H:i:s'),
            'recovered_at' => $last->recovered_at?->timezone($tz)->format('Y-m-d H:i:s'),
            'segments' => collect($chain)->map(fn (Incident $i) => [
                'id' => $i->id,
                'from' => $i->started_at?->timezone($tz)->format('Y-m-d H:i:s'),
                'to' => $i->recovered_at?->timezone($tz)->format('Y-m-d H:i:s') ?? 'OPEN',
            ])->all(),
        ];
    }

    /**
     * @param  array<int, Incident>  $chain
     */
    private function applyMerge(array $chain): void
    {
        $keep = $chain[0];
        $last = $chain[array_key_last($chain)];
        $absorbIds = collect($chain)->slice(1)->pluck('id')->all();

        DB::transaction(function () use ($keep, $last, $absorbIds, $chain) {
            // Borrar primero: evita violar unique de una activa por assignment+sensor
            // cuando el merge termina OPEN y la keep aún estaba recuperada.
            Incident::query()->whereIn('id', $absorbIds)->delete();

            $payload = [
                'recovered_at' => $last->recovered_at,
                'prtg_up_at' => $last->prtg_up_at,
                'current_status' => $last->recovered_at === null
                    ? MonitoringStatus::Caido->value
                    : MonitoringStatus::Operativo->value,
                'followup_status' => $last->recovered_at === null
                    ? FollowupStatus::PendienteContacto->value
                    : FollowupStatus::Recuperado->value,
            ];
            if ($keep->prtg_down_started_at === null && $keep->started_at !== null) {
                $payload['prtg_down_started_at'] = $keep->started_at;
            }
            $keep->refresh();
            $keep->update($payload);

            IncidentUpdate::query()->create([
                'incident_id' => $keep->id,
                'type' => 'SYSTEM',
                'status_before' => null,
                'status_after' => $keep->fresh()->followup_status?->value,
                'observation' => sprintf(
                    'Historial coalescido: se fusionaron %d micro-caídas (flaps) en una sola incidencia (#%s). Absorbidas: %s.',
                    count($chain),
                    $keep->id,
                    implode(', ', array_map(fn ($id) => '#'.$id, $absorbIds))
                ),
                'created_at' => now(),
            ]);
        });
    }
}
