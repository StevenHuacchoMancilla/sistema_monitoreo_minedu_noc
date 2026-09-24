<?php

namespace App\Console\Commands;

use App\Domain\Monitoring\PRTG\Services\PrtgService;
use App\Models\Incident;
use App\Models\NetworkAssignment;
use App\Models\PrtgSensor;
use Carbon\CarbonImmutable;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Throwable;

/**
 * Auditoría READ-ONLY de la cadena temporal PRTG → PHP → PostgreSQL → API.
 * No escribe en base de datos.
 */
class PrtgTimeAuditCommand extends Command
{
    protected $signature = 'prtg:time-audit {--cid= : CID a auditar (ej. 258374)}';

    protected $description = 'Auditoría READ-ONLY de timestamps PRTG vs PHP/PostgreSQL/API para un CID.';

    private const SENSOR_COLUMNS = 'objid,sensor,device,status,status_raw,lastcheck,lastup,lastdown,downtimesince,uptimesince,type';

    public function handle(PrtgService $prtg): int
    {
        $cid = trim((string) $this->option('cid'));
        if ($cid === '') {
            $this->error('Indica --cid=');

            return self::FAILURE;
        }

        $appTz = (string) config('app.timezone');
        $now = CarbonImmutable::now();

        $this->line('==================================================');
        $this->line('PRTG TIME AUDIT');
        $this->line('==================================================');
        $this->kv('CID', $cid);
        $this->kv('SERVER CURRENT TIME (UTC)', $now->utc()->toIso8601String());
        $this->kv('APP TIMEZONE (config)', $appTz);
        $this->kv('PHP TIMEZONE (runtime)', date_default_timezone_get());
        $this->kv('PHP php.ini date.timezone', (string) ini_get('date.timezone'));
        $this->kv('CURRENT TIME AMERICA/LIMA', $now->setTimezone('America/Lima')->toIso8601String());
        $this->kv('POSTGRESQL TimeZone', (string) (DB::selectOne('show timezone')->TimeZone ?? '?'));
        $this->kv('POSTGRESQL now()', (string) DB::selectOne('select now()::text as n')->n);

        $this->section('PRTG SERVER CLOCK');
        $this->prtgClock();

        $this->section('RAW PRTG VALUES (API table.json)');
        try {
            $rows = $prtg->fetchTable('sensors', [
                'columns' => self::SENSOR_COLUMNS,
                'filter_device' => '@sub(CID'.$cid.')',
                'count' => 50,
            ]);
        } catch (Throwable $e) {
            $this->error('No se pudo consultar PRTG: '.$e->getMessage());
            $rows = [];
        }

        foreach ($rows as $row) {
            $this->line(sprintf('Sensor %s · %s · %s', $row['objid'] ?? '?', $row['sensor'] ?? '?', strip_tags((string) ($row['status'] ?? ''))));
            foreach (['lastcheck', 'lastup', 'lastdown', 'downtimesince', 'uptimesince'] as $field) {
                $display = strip_tags((string) ($row[$field] ?? ''));
                $raw = $row[$field.'_raw'] ?? null;
                $this->kv("  {$field}", $display === '' ? '(vacío)' : $display);
                $this->kv("  {$field}_raw", $raw === null || $raw === '' ? '(vacío)' : var_export($raw, true));
                $parsed = $this->interpretRaw($field, $raw, $now);
                if ($parsed !== null) {
                    $this->kv("  {$field} parsed UTC", $parsed->utc()->toIso8601String());
                    $this->kv("  {$field} parsed Lima", $parsed->setTimezone('America/Lima')->toIso8601String());
                }
            }
            $this->newLine();
        }

        $this->section('DATABASE');
        $assignment = NetworkAssignment::query()->where('cid', $cid)->first();
        if (! $assignment) {
            $this->warn('CID no encontrado en network_assignments.');

            return self::SUCCESS;
        }

        foreach (PrtgSensor::query()->where('network_assignment_id', $assignment->id)->get() as $sensor) {
            $this->kv("prtg_sensor {$sensor->name}.down_since (texto)", var_export($sensor->down_since, true));
            $this->kv("prtg_sensor {$sensor->name}.last_check raw", (string) $sensor->getRawOriginal('last_check'));
        }
        $this->newLine();

        $incidents = Incident::query()
            ->where('network_assignment_id', $assignment->id)
            ->orderByDesc('id')
            ->limit(5)
            ->get(['id', 'started_at', 'recovered_at', 'created_at']);

        foreach ($incidents as $incident) {
            $startedRaw = $incident->getRawOriginal('started_at');
            $recoveredRaw = $incident->getRawOriginal('recovered_at');
            $this->line("incident #{$incident->id}");
            $this->kv('  started_at raw (naive)', (string) $startedRaw);
            $this->kv('  recovered_at raw (naive)', (string) ($recoveredRaw ?? 'NULL'));
            $this->kv('  API JSON started_at (hoy)', (string) $incident->started_at?->toIso8601String());
            $this->kv('  si raw fuese UTC → Lima', $this->naiveAs($startedRaw, 'UTC'));
            $this->kv('  si raw fuese Lima → Lima', $this->naiveAs($startedRaw, 'America/Lima'));
            if ($incident->started_at && $incident->started_at->gt($now->addMinutes(2))) {
                $this->warn('  ⚠ started_at está en el FUTURO respecto a now()');
            }
        }

        $this->newLine();
        $this->line('==================================================');

        return self::SUCCESS;
    }

    private function prtgClock(): void
    {
        $base = rtrim((string) config('prtg.base_url'), '/');
        $token = (string) config('prtg.api_token');
        try {
            $status = Http::withoutVerifying()->timeout(30)
                ->get("{$base}/api/status.json", ['apitoken' => $token])
                ->json();
            $this->kv('PRTG status.Clock', (string) ($status['Clock'] ?? '(no disponible)'));
            $this->kv('PRTG status.Version', (string) ($status['Version'] ?? '?'));
        } catch (Throwable $e) {
            $this->warn('status.json no disponible: '.$e->getMessage());
        }
    }

    /**
     * lastcheck/lastup/lastdown *_raw son fechas OLE (días desde 1899-12-30, UTC).
     * downtimesince/uptimesince *_raw son segundos transcurridos.
     */
    private function interpretRaw(string $field, mixed $raw, CarbonImmutable $now): ?CarbonImmutable
    {
        if ($raw === null || $raw === '' || ! is_numeric($raw)) {
            return null;
        }

        if (in_array($field, ['downtimesince', 'uptimesince'], true)) {
            return $now->subSeconds((int) round((float) $raw));
        }

        $seconds = (int) round(((float) $raw - 25569) * 86400);

        return CarbonImmutable::createFromTimestampUTC($seconds);
    }

    private function naiveAs(?string $naive, string $tz): string
    {
        if (! $naive) {
            return '—';
        }

        return CarbonImmutable::createFromFormat('Y-m-d H:i:s', substr($naive, 0, 19), $tz)
            ->setTimezone('America/Lima')
            ->toIso8601String();
    }

    private function section(string $title): void
    {
        $this->newLine();
        $this->line($title);
        $this->line(str_repeat('-', 40));
    }

    private function kv(string $key, string $value): void
    {
        $this->line(str_pad($key.':', 34).' '.$value);
    }
}
