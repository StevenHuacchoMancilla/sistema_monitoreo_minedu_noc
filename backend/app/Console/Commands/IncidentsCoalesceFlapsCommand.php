<?php

namespace App\Console\Commands;

use App\Domain\Incidents\Services\IncidentFlapCoalesceService;
use App\Models\NetworkAssignment;
use App\Models\School;
use Illuminate\Console\Command;

class IncidentsCoalesceFlapsCommand extends Command
{
    protected $signature = 'incidents:coalesce-flaps
        {--school= : ID de colegio}
        {--cid= : CID de asignación}
        {--window= : Segundos máx. entre recuperación y re-caída para fusionar (default config)}
        {--apply : Persiste los merges (sin esto es dry-run)}
        {--report= : Ruta JSON de reporte}';

    protected $description = 'Fusiona micro-caídas consecutivas del mismo Ping en el historial (sin gestión/tracking).';

    public function handle(IncidentFlapCoalesceService $service): int
    {
        $schoolId = $this->option('school') !== null && $this->option('school') !== ''
            ? (int) $this->option('school')
            : null;
        $cid = trim((string) ($this->option('cid') ?: ''));
        $cid = $cid !== '' ? $cid : null;
        $windowOpt = $this->option('window');
        $window = $windowOpt !== null && $windowOpt !== '' ? (int) $windowOpt : null;
        $apply = (bool) $this->option('apply');
        $dryRun = ! $apply;

        if ($cid !== null && $schoolId === null) {
            $na = NetworkAssignment::query()->where('cid', $cid)->first();
            if ($na) {
                $schoolId = (int) $na->school_id;
            }
        }

        $this->info($dryRun ? 'Mode: DRY-RUN' : 'Mode: APPLY');
        $this->line('Window: '.($window ?? (int) config('incidents.history_coalesce_seconds', 1800)).'s');
        if ($schoolId) {
            $name = School::query()->find($schoolId)?->local_educativo;
            $this->line("School: #{$schoolId} ".($name ?? ''));
        }
        if ($cid) {
            $this->line("CID: {$cid}");
        }
        $this->newLine();

        $result = $service->coalesce($schoolId, $cid, $window, $dryRun);
        $s = $result['summary'];

        $this->line(sprintf(
            'SUMMARY  sensors=%d  chains=%d  kept=%d  absorbed=%d  skipped_protected=%d',
            $s['sensors'],
            $s['chains'],
            $s['kept'],
            $s['absorbed'],
            $s['skipped_protected']
        ));

        $sample = array_slice($result['chains'], 0, 25);
        foreach ($sample as $c) {
            $this->line(sprintf(
                '%s school=%s sensor=%s keep=#%s absorb=%d  %s → %s',
                $c['action'],
                $c['school_id'],
                $c['sensor_id'],
                $c['keep_id'],
                count($c['absorb_ids']),
                $c['started_at'] ?? '?',
                $c['recovered_at'] ?? 'OPEN'
            ));
        }
        if (count($result['chains']) > 25) {
            $this->line('... +'.(count($result['chains']) - 25).' cadenas más');
        }

        if ($dryRun) {
            $this->warn('Dry-run: nada persistido. Para aplicar: --apply');
        }

        $report = trim((string) $this->option('report'));
        if ($report !== '') {
            file_put_contents($report, json_encode([
                'mode' => $dryRun ? 'dry-run' : 'apply',
                'school_id' => $schoolId,
                'cid' => $cid,
                'window' => $window ?? (int) config('incidents.history_coalesce_seconds', 1800),
                'summary' => $s,
                'chains' => $result['chains'],
            ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
            $this->line('Report: '.$report);
        }

        return self::SUCCESS;
    }
}
