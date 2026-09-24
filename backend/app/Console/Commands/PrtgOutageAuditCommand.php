<?php

namespace App\Console\Commands;

use App\Domain\Monitoring\PRTG\Services\PrtgService;
use App\Domain\Monitoring\PRTG\Support\PrtgOutageIntervalBuilder;
use App\Domain\Monitoring\PRTG\Support\PrtgTimestamps;
use App\Models\Incident;
use App\Models\NetworkAssignment;
use App\Models\PrtgSensor;
use App\Support\OperationalTime;
use Carbon\CarbonImmutable;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Http;
use Throwable;

/**
 * Auditoría READ-ONLY: reconstruye intervalos DOWN/UP desde messages PRTG
 * y los compara con incidents locales. No escribe en BD.
 */
class PrtgOutageAuditCommand extends Command
{
    protected $signature = 'prtg:outage-audit
        {--sensor= : PRTG sensor objid (ej. 9053)}
        {--cid= : CID (alternativa a --sensor; resuelve Ping canónico)}
        {--from= : Fecha local inclusive YYYY-MM-DD}
        {--to= : Fecha local inclusive YYYY-MM-DD}';

    protected $description = 'Auditoría READ-ONLY de intervalos DOWN/UP PRTG vs Incident DB.';

    public function handle(PrtgService $prtg): int
    {
        $fromDay = (string) ($this->option('from') ?: OperationalTime::localDate()->toDateString());
        $toDay = (string) ($this->option('to') ?: $fromDay);
        $displayTz = OperationalTime::tz();

        [$sensorId, $cid, $assignmentId, $localSensorId] = $this->resolveSensor();
        if ($sensorId <= 0) {
            $this->error('Indica --sensor= o --cid= válido.');

            return self::FAILURE;
        }

        $fromUtc = CarbonImmutable::instance(OperationalTime::dayStart($fromDay));
        $toUtc = CarbonImmutable::instance(OperationalTime::dayEnd($toDay));

        $this->line('========================================================');
        $this->line('PRTG OUTAGE AUDIT');
        $this->line('========================================================');
        $this->kv('Sensor', (string) $sensorId);
        $this->kv('CID', $cid ?? '(desconocido)');
        $this->kv('Timezone aplicación', $displayTz.' (display) / '.config('app.timezone').' (storage)');
        $this->kv('Periodo', "{$fromDay} → {$toDay} ({$displayTz})");
        $this->newLine();

        try {
            $messages = $this->fetchMessages($sensorId);
            $events = $this->messagesToEvents($messages, $fromUtc, $toUtc);
            $outages = PrtgOutageIntervalBuilder::build($events);
        } catch (Throwable $e) {
            $this->error('PRTG messages falló: '.$e->getMessage());

            return self::FAILURE;
        }

        $this->line('--------------------------------------------------------');
        $this->line('RAW STATE EVENTS (messages → Fallo/OK)');
        $this->line('--------------------------------------------------------');
        if ($events === []) {
            $this->warn('Sin mensajes Fallo/OK en el periodo.');
        }
        foreach ($events as $e) {
            $this->line(sprintf(
                '%s  %-4s  (%s) %s',
                $e['at']->timezone($displayTz)->format('Y-m-d H:i:s'),
                $e['kind'],
                $e['status'],
                $e['message'] ?? ''
            ));
        }
        $this->newLine();

        $this->line('--------------------------------------------------------');
        $this->line('RECONSTRUCTED OUTAGES');
        $this->line('--------------------------------------------------------');
        foreach ($outages as $i => $o) {
            $n = $i + 1;
            $start = $o['started_at']->timezone($displayTz);
            $end = $o['recovered_at']?->timezone($displayTz);
            $secs = $o['recovered_at']
                ? max(0, $o['recovered_at']->getTimestamp() - $o['started_at']->getTimestamp())
                : null;
            $this->line("#{$n}");
            $this->kv('  DOWN', $start->format('Y-m-d H:i:s'));
            $this->kv('  UP', $end?->format('Y-m-d H:i:s') ?? 'OPEN');
            $this->kv('  Duration', $secs === null ? '—' : $this->human($secs));
        }
        if ($outages === []) {
            $this->warn('Ningún intervalo reconstruido.');
        }
        $this->newLine();

        $dbRows = $this->databaseIncidents($assignmentId, $localSensorId, $fromUtc, $toUtc);
        $this->line('--------------------------------------------------------');
        $this->line('DATABASE INCIDENTS');
        $this->line('--------------------------------------------------------');
        foreach ($dbRows as $row) {
            $this->line(sprintf(
                '#%d  %s → %s  (%s)',
                $row['id'],
                $row['started_lima'],
                $row['recovered_lima'] ?? 'OPEN',
                $row['duration']
            ));
        }
        if ($dbRows === []) {
            $this->warn('Sin incidents en DB para el periodo.');
        }
        $this->newLine();

        $diff = $this->diff($outages, $dbRows, $displayTz);
        $this->line('--------------------------------------------------------');
        $this->line('DIFFERENCES');
        $this->line('--------------------------------------------------------');
        foreach (['MISSING_IN_DATABASE', 'EXTRA_IN_DATABASE', 'START_TIME_MISMATCH', 'RECOVERY_TIME_MISMATCH', 'DURATION_MISMATCH'] as $key) {
            $items = $diff[$key];
            $this->line($key.': '.(count($items) === 0 ? 'ninguno' : count($items)));
            foreach ($items as $item) {
                $this->line('  - '.$item);
            }
        }
        $this->newLine();

        $this->line('--------------------------------------------------------');
        $this->line('HOURLY VALIDATION (sanity check, no es fuente exacta)');
        $this->line('--------------------------------------------------------');
        try {
            $this->hourlyValidation($sensorId, $fromDay, $toDay, $outages, $displayTz);
        } catch (Throwable $e) {
            $this->warn('Hourly validation omitida: '.$e->getMessage());
        }

        $this->newLine();
        $this->line('READ-ONLY: no se modificó la base de datos.');
        $this->line('========================================================');

        return self::SUCCESS;
    }

    /**
     * @return array{0: int, 1: ?string, 2: ?int, 3: ?int}
     */
    private function resolveSensor(): array
    {
        $sensorOpt = (int) $this->option('sensor');
        $cid = trim((string) $this->option('cid'));

        if ($sensorOpt > 0) {
            $local = PrtgSensor::query()->where('prtg_sensor_id', (string) $sensorOpt)->first();
            $assignment = $local?->network_assignment_id
                ? NetworkAssignment::query()->find($local->network_assignment_id)
                : null;

            return [$sensorOpt, $assignment?->cid, $assignment?->id, $local?->id];
        }

        if ($cid === '') {
            return [0, null, null, null];
        }

        $assignment = NetworkAssignment::query()->where('cid', $cid)->first();
        if (! $assignment) {
            return [0, $cid, null, null];
        }

        $local = PrtgSensor::query()
            ->where('network_assignment_id', $assignment->id)
            ->whereRaw('LOWER(name) = ?', ['ping'])
            ->orderBy('id')
            ->first();

        return [(int) ($local?->prtg_sensor_id ?? 0), $cid, $assignment->id, $local?->id];
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function fetchMessages(int $sensorId): array
    {
        $base = rtrim((string) config('prtg.base_url'), '/');
        $token = (string) config('prtg.api_token');
        $response = Http::withoutVerifying()->timeout(120)->get("{$base}/api/table.json", [
            'content' => 'messages',
            'columns' => 'objid,datetime,parent,type,name,status,message',
            'id' => $sensorId,
            'count' => 2000,
            'apitoken' => $token,
        ]);

        if (! $response->successful()) {
            throw new \RuntimeException("HTTP {$response->status()} messages");
        }

        return $response->json()['messages'] ?? [];
    }

    /**
     * @param  array<int, array<string, mixed>>  $messages
     * @return array<int, array{at: CarbonImmutable, kind: string, status: string, message: string}>
     */
    private function messagesToEvents(array $messages, CarbonImmutable $fromUtc, CarbonImmutable $toUtc): array
    {
        $events = [];
        foreach ($messages as $row) {
            $at = PrtgTimestamps::fromOle($row['datetime_raw'] ?? null);
            if ($at === null) {
                continue;
            }
            if ($at->lt($fromUtc) || $at->gt($toUtc)) {
                continue;
            }

            $status = strip_tags((string) ($row['status'] ?? ''));
            $kind = PrtgOutageIntervalBuilder::classifyStatus($status);
            $events[] = [
                'at' => $at,
                'kind' => $kind,
                'status' => $status,
                'message' => strip_tags((string) ($row['message_raw'] ?? $row['message'] ?? '')),
            ];
        }

        usort($events, fn (array $a, array $b): int => $a['at']->getTimestamp() <=> $b['at']->getTimestamp());

        return $events;
    }

    /**
     * @return array<int, array{id: int, started_at: CarbonImmutable, recovered_at: ?CarbonImmutable, started_lima: string, recovered_lima: ?string, duration: string}>
     */
    private function databaseIncidents(?int $assignmentId, ?int $localSensorId, CarbonImmutable $fromUtc, CarbonImmutable $toUtc): array
    {
        if (! $assignmentId) {
            return [];
        }

        $query = Incident::query()
            ->where('network_assignment_id', $assignmentId)
            ->where('started_at', '<=', $toUtc)
            ->where(function ($q) use ($fromUtc) {
                $q->whereNull('recovered_at')->orWhere('recovered_at', '>=', $fromUtc);
            })
            ->orderBy('started_at');

        if ($localSensorId) {
            $query->where('prtg_sensor_id', $localSensorId);
        }

        $tz = OperationalTime::tz();

        return $query->get()->map(function (Incident $i) use ($tz) {
            $start = CarbonImmutable::instance($i->started_at);
            $end = $i->recovered_at ? CarbonImmutable::instance($i->recovered_at) : null;
            $secs = $end ? max(0, $end->getTimestamp() - $start->getTimestamp()) : null;

            return [
                'id' => $i->id,
                'started_at' => $start,
                'recovered_at' => $end,
                'started_lima' => $start->timezone($tz)->format('Y-m-d H:i:s'),
                'recovered_lima' => $end?->timezone($tz)->format('Y-m-d H:i:s'),
                'duration' => $secs === null ? 'OPEN' : $this->human($secs),
            ];
        })->all();
    }

    /**
     * @param  array<int, array{started_at: CarbonImmutable, recovered_at: ?CarbonImmutable}>  $prtg
     * @param  array<int, array{id: int, started_at: CarbonImmutable, recovered_at: ?CarbonImmutable, started_lima: string, recovered_lima: ?string, duration: string}>  $db
     * @return array<string, array<int, string>>
     */
    private function diff(array $prtg, array $db, string $tz): array
    {
        $tolerance = 120; // ±2 intervalos de 60s
        $usedDb = [];
        $out = [
            'MISSING_IN_DATABASE' => [],
            'EXTRA_IN_DATABASE' => [],
            'START_TIME_MISMATCH' => [],
            'RECOVERY_TIME_MISMATCH' => [],
            'DURATION_MISMATCH' => [],
        ];

        foreach ($prtg as $i => $o) {
            $matchIdx = null;
            $best = PHP_INT_MAX;
            foreach ($db as $j => $row) {
                if (isset($usedDb[$j])) {
                    continue;
                }
                $delta = abs($row['started_at']->getTimestamp() - $o['started_at']->getTimestamp());
                // Also allow matching by recovered_at proximity if start drifted.
                $deltaEnd = ($o['recovered_at'] && $row['recovered_at'])
                    ? abs($row['recovered_at']->getTimestamp() - $o['recovered_at']->getTimestamp())
                    : PHP_INT_MAX;
                $score = min($delta, $deltaEnd);
                if ($score < $best) {
                    $best = $score;
                    $matchIdx = $j;
                }
            }

            $label = sprintf(
                'PRTG %s → %s',
                $o['started_at']->timezone($tz)->format('Y-m-d H:i:s'),
                $o['recovered_at']?->timezone($tz)->format('Y-m-d H:i:s') ?? 'OPEN'
            );

            if ($matchIdx === null || $best > 6 * 3600) {
                $out['MISSING_IN_DATABASE'][] = $label;
                continue;
            }

            $usedDb[$matchIdx] = true;
            $row = $db[$matchIdx];
            $startDelta = abs($row['started_at']->getTimestamp() - $o['started_at']->getTimestamp());
            if ($startDelta > $tolerance) {
                $out['START_TIME_MISMATCH'][] = sprintf(
                    '%s | DB #%d started %s (Δ %ds)',
                    $label,
                    $row['id'],
                    $row['started_lima'],
                    $startDelta
                );
            }

            if ($o['recovered_at'] && $row['recovered_at']) {
                $endDelta = abs($row['recovered_at']->getTimestamp() - $o['recovered_at']->getTimestamp());
                if ($endDelta > $tolerance) {
                    $out['RECOVERY_TIME_MISMATCH'][] = sprintf(
                        '%s | DB #%d recovered %s (Δ %ds)',
                        $label,
                        $row['id'],
                        $row['recovered_lima'],
                        $endDelta
                    );
                }
                $prtgDur = $o['recovered_at']->getTimestamp() - $o['started_at']->getTimestamp();
                $dbDur = $row['recovered_at']->getTimestamp() - $row['started_at']->getTimestamp();
                if (abs($prtgDur - $dbDur) > $tolerance) {
                    $out['DURATION_MISMATCH'][] = sprintf(
                        'DB #%d PRTG %s vs DB %s',
                        $row['id'],
                        $this->human($prtgDur),
                        $this->human($dbDur)
                    );
                }
            } elseif ($o['recovered_at'] && ! $row['recovered_at']) {
                $out['RECOVERY_TIME_MISMATCH'][] = "{$label} | DB #{$row['id']} sigue OPEN";
            }
        }

        foreach ($db as $j => $row) {
            if (! isset($usedDb[$j])) {
                $out['EXTRA_IN_DATABASE'][] = sprintf(
                    'DB #%d %s → %s',
                    $row['id'],
                    $row['started_lima'],
                    $row['recovered_lima'] ?? 'OPEN'
                );
            }
        }

        return $out;
    }

    /**
     * @param  array<int, array{started_at: CarbonImmutable, recovered_at: ?CarbonImmutable}>  $outages
     */
    private function hourlyValidation(int $sensorId, string $fromDay, string $toDay, array $outages, string $tz): void
    {
        $base = rtrim((string) config('prtg.base_url'), '/');
        $token = (string) config('prtg.api_token');
        $his = Http::withoutVerifying()->timeout(120)->get("{$base}/api/historicdata.json", [
            'id' => $sensorId,
            'avg' => 3600,
            'sdate' => str_replace('-', '-', $fromDay).'-00-00-00',
            'edate' => CarbonImmutable::parse($toDay, $tz)->addDay()->format('Y-m-d').'-00-00-00',
            'usecaption' => 1,
            'apitoken' => $token,
        ])->json()['histdata'] ?? [];

        foreach ($his as $row) {
            $downtime = $row['Tiempo de inactividad'] ?? $row['downtime'] ?? 0;
            $pct = is_numeric($downtime)
                ? ((float) $downtime <= 1 ? (float) $downtime * 100 : (float) $downtime)
                : (float) preg_replace('/[^\d.]/', '', (string) $downtime);
            if ($pct <= 0) {
                continue;
            }

            $label = (string) ($row['datetime'] ?? '?');
            // Parse "22/09/2026 14:00:00 - 15:00:00"
            if (! preg_match('#(\d{2})/(\d{2})/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})#', $label, $m)) {
                continue;
            }
            $hourStart = CarbonImmutable::create(
                (int) $m[3],
                (int) $m[2],
                (int) $m[1],
                (int) $m[4],
                (int) $m[5],
                (int) $m[6],
                $tz
            );
            $hourEnd = $hourStart->addHour();
            $expectedSec = (int) round(($pct / 100) * 3600);

            $overlap = 0;
            foreach ($outages as $o) {
                $a = $o['started_at'];
                $b = $o['recovered_at'] ?? CarbonImmutable::now('UTC');
                $start = max($a->getTimestamp(), $hourStart->utc()->getTimestamp());
                $end = min($b->getTimestamp(), $hourEnd->utc()->getTimestamp());
                if ($end > $start) {
                    $overlap += $end - $start;
                }
            }

            $delta = abs($overlap - $expectedSec);
            $status = $delta <= 90 ? 'OK' : 'MISMATCH';
            $this->line(sprintf(
                '%s  PRTG downtime≈%s%% (~%s)  intervals overlap=%s  [%s]',
                $label,
                rtrim(rtrim(number_format($pct, 2, '.', ''), '0'), '.'),
                $this->human($expectedSec),
                $this->human($overlap),
                $status
            ));
        }
    }

    private function human(int $seconds): string
    {
        $seconds = max(0, $seconds);
        if ($seconds < 60) {
            return "{$seconds}s";
        }
        $m = intdiv($seconds, 60);
        $s = $seconds % 60;
        if ($m < 60) {
            return $s > 0 ? "{$m}m {$s}s" : "{$m}m";
        }
        $h = intdiv($m, 60);
        $m = $m % 60;

        return $m > 0 ? "{$h}h {$m}m" : "{$h}h";
    }

    private function kv(string $k, string $v): void
    {
        $this->line(str_pad($k.':', 28).$v);
    }
}
