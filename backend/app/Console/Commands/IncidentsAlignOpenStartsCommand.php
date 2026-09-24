<?php

namespace App\Console\Commands;

use App\Models\Incident;
use App\Models\IncidentUpdate;
use App\Support\OperationalTime;
use Illuminate\Console\Command;

/**
 * Alinea started_at / recovered_at a evidencia PRTG (downtimesince / uptimesince)
 * para TODAS las incidencias (activas y recuperadas), sin gestiones humanas.
 * Misma lógica que Apps Script LLEE: sync − duración.
 */
class IncidentsAlignOpenStartsCommand extends Command
{
    protected $signature = 'incidents:align-open-starts
        {--all : Incluye recuperadas (default: solo abiertas)}
        {--apply : Persiste (sin esto es dry-run)}
        {--min-delta=30 : Delta mínimo en segundos para corregir}
        {--report= : JSON de reporte}';

    protected $description = 'Alinea started_at/recovered_at a prtg_down/prtg_up en todas las incidencias sin gestión.';

    public function handle(): int
    {
        $apply = (bool) $this->option('apply');
        $all = (bool) $this->option('all');
        $minDelta = max(0, (int) $this->option('min-delta'));
        $tz = OperationalTime::tz();

        $query = Incident::query()
            ->withCount('managements')
            ->orderBy('id');

        if (! $all) {
            $query->whereNull('recovered_at');
        }

        $rows = [];
        $fixedStart = 0;
        $fixedRecovery = 0;
        $skipped = 0;

        foreach ($query->cursor() as $incident) {
            if ((int) $incident->managements_count > 0) {
                $skipped++;
                continue;
            }

            $payload = [];
            $notes = [];

            $prtgDown = $incident->prtg_down_started_at;
            $start = $incident->started_at;
            if ($prtgDown && $start) {
                $delta = $start->getTimestamp() - $prtgDown->getTimestamp();
                // Adelantar started_at cuando detección fue tardía (PRTG más temprano).
                if ($delta >= $minDelta) {
                    $payload['started_at'] = OperationalTime::toStorage($prtgDown);
                    $notes[] = sprintf(
                        'started_at %s → %s (Δ%ds)',
                        $start->copy()->timezone($tz)->format('Y-m-d H:i:s'),
                        $prtgDown->copy()->timezone($tz)->format('Y-m-d H:i:s'),
                        $delta
                    );
                    $fixedStart++;
                }
            }

            $prtgUp = $incident->prtg_up_at;
            $recovered = $incident->recovered_at;
            if ($prtgUp && $recovered) {
                $endDelta = abs($recovered->getTimestamp() - $prtgUp->getTimestamp());
                if ($endDelta >= $minDelta) {
                    $newEnd = OperationalTime::toStorage($prtgUp);
                    $newStart = isset($payload['started_at'])
                        ? $payload['started_at']
                        : ($start ? OperationalTime::toStorage($start) : null);
                    if ($newStart === null || $newEnd->greaterThanOrEqualTo($newStart)) {
                        $payload['recovered_at'] = $newEnd;
                        $notes[] = sprintf(
                            'recovered_at %s → %s (Δ%ds)',
                            $recovered->copy()->timezone($tz)->format('Y-m-d H:i:s'),
                            $prtgUp->copy()->timezone($tz)->format('Y-m-d H:i:s'),
                            $endDelta
                        );
                        $fixedRecovery++;
                    }
                }
            }

            if ($payload === []) {
                $skipped++;
                continue;
            }

            $entry = [
                'id' => $incident->id,
                'school_id' => $incident->school_id,
                'open' => $incident->recovered_at === null,
                'changes' => $notes,
            ];
            $rows[] = $entry;

            if ($apply) {
                $incident->update($payload);
                IncidentUpdate::query()->create([
                    'incident_id' => $incident->id,
                    'type' => 'SYSTEM',
                    'status_before' => null,
                    'status_after' => $incident->followup_status?->value,
                    'observation' => 'Timestamps alineados a evidencia PRTG (downtimesince/uptimesince), lógica global Apps Script. '.implode('; ', $notes),
                    'created_at' => now(),
                ]);
            }
        }

        $this->info(sprintf(
            '%s scope=%s start_fixes=%d recovery_fixes=%d skipped=%d rows=%d',
            $apply ? 'APPLY' : 'DRY-RUN',
            $all ? 'all' : 'open-only',
            $fixedStart,
            $fixedRecovery,
            $skipped,
            count($rows)
        ));

        foreach (array_slice($rows, 0, 40) as $r) {
            $this->line(sprintf(
                '#%d school=%s %s | %s',
                $r['id'],
                $r['school_id'],
                $r['open'] ? 'OPEN' : 'closed',
                implode('; ', $r['changes'])
            ));
        }
        if (count($rows) > 40) {
            $this->line('... +'.(count($rows) - 40).' más');
        }

        $report = trim((string) $this->option('report'));
        if ($report !== '') {
            file_put_contents($report, json_encode([
                'mode' => $apply ? 'apply' : 'dry-run',
                'scope' => $all ? 'all' : 'open-only',
                'fixed_start' => $fixedStart,
                'fixed_recovery' => $fixedRecovery,
                'skipped' => $skipped,
                'rows' => $rows,
            ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
            $this->line('Report: '.$report);
        }

        return self::SUCCESS;
    }
}
