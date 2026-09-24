<?php

namespace App\Console\Commands;

use App\Domain\Monitoring\PRTG\Services\PrtgHistoricOutageReader;
use App\Domain\Monitoring\PRTG\Services\PrtgIncidentReconciliationService;
use App\Models\NetworkAssignment;
use App\Models\PrtgSensor;
use App\Support\OperationalTime;
use Carbon\CarbonImmutable;
use Illuminate\Console\Command;
use Throwable;

/**
 * Reconciliación de intervalos PRTG → Incidents.
 * Por defecto es DRY-RUN (no escribe). Usar --apply para persistir.
 *
 * --all: revisa todos los Ping canónicos (solo dry-run salvo --apply explícito).
 */
class PrtgReconcileOutagesCommand extends Command
{
    protected $signature = 'prtg:reconcile-outages
        {--sensor= : PRTG sensor objid}
        {--cid= : CID (resuelve Ping canónico)}
        {--all : Todos los Ping con assignment elegible}
        {--from= : Fecha local YYYY-MM-DD}
        {--to= : Fecha local YYYY-MM-DD}
        {--dry-run : Forzar dry-run (default si no hay --apply)}
        {--apply : Persistir cambios}
        {--batch= : Lote: high|high-time-earlier|high-time-align|high-creates|high-recovery|meta}
        {--limit= : Máximo de sensores en modo --all}
        {--sleep-ms=50 : Pausa entre sensores (--all) para no saturar PRTG}
        {--report= : Ruta JSON de salida (opcional)}';

    protected $description = 'Reconcilia intervalos DOWN/UP PRTG con incidents (dry-run por defecto).';

    public function handle(
        PrtgHistoricOutageReader $reader,
        PrtgIncidentReconciliationService $reconciliation,
    ): int {
        $apply = (bool) $this->option('apply');
        $dryRun = ! $apply || (bool) $this->option('dry-run');
        if ($apply && $this->option('dry-run')) {
            $this->warn('--dry-run y --apply juntos: se prioriza dry-run.');
            $dryRun = true;
        }

        $fromDay = (string) ($this->option('from') ?: OperationalTime::localDate()->toDateString());
        $toDay = (string) ($this->option('to') ?: $fromDay);
        $fromUtc = CarbonImmutable::instance(OperationalTime::dayStart($fromDay));
        $toUtc = CarbonImmutable::instance(OperationalTime::dayEnd($toDay));

        $sensors = $this->resolveSensors();
        if ($sensors === []) {
            $this->error('Indica --sensor=, --cid= o --all con Ping locales.');

            return self::FAILURE;
        }

        $batch = trim((string) ($this->option('batch') ?: ''));
        $batch = $batch !== '' ? $batch : null;
        $allowedBatches = ['high', 'high-time-earlier', 'high-time-align', 'high-creates', 'high-recovery', 'meta'];
        if ($batch !== null && ! in_array($batch, $allowedBatches, true)) {
            $this->error('batch inválido. Use: '.implode('|', $allowedBatches));

            return self::FAILURE;
        }

        // APPLY masivo solo con lote high* (nunca apply ciego de review/overlap).
        if (count($sensors) > 1 && $apply && ! $dryRun) {
            if ($batch === null || (! str_starts_with($batch, 'high') && $batch !== 'meta')) {
                $this->error('APPLY masivo requiere --batch=high|high-time-earlier|high-time-align|high-creates|high-recovery|meta');

                return self::FAILURE;
            }
        }

        $this->line('========================================================');
        $this->line('PRTG RECONCILE OUTAGES');
        $this->line('========================================================');
        $this->line('Mode: '.($dryRun ? 'DRY-RUN (no escribe BD)' : 'APPLY'));
        $this->line('Batch: '.($batch ?? '(todos, filtrados por confidence en apply)'));
        $this->line('Sensores: '.count($sensors));
        $this->line("Periodo: {$fromDay} → {$toDay}");
        $this->line('Fuente DOWN/UP: PRTG table.json messages (Fallo/OK) — no agregados horarios');
        $this->newLine();

        $sleepMs = max(0, (int) $this->option('sleep-ms'));
        $totals = ['create' => 0, 'update' => 0, 'unchanged' => 0, 'conflict' => 0, 'skipped' => 0, 'errors' => 0];
        $byConfidence = ['high' => 0, 'medium' => 0, 'review' => 0];
        $timeFixes = [];
        $recoveryFixes = [];
        $creates = [];
        $conflicts = [];
        $errors = [];
        $reportRows = [];

        $bar = $this->output->createProgressBar(count($sensors));
        $bar->start();

        foreach ($sensors as $row) {
            /** @var PrtgSensor $sensor */
            $sensor = $row['sensor'];
            $prtgId = (int) $row['prtg_id'];
            $cid = $row['cid'];

            try {
                $pack = $reader->intervalsForSensor($prtgId, $fromUtc, $toUtc);
                $result = $reconciliation->reconcileSensor($sensor, $fromUtc, $toUtc, $dryRun, $pack['outages'], $batch);
                foreach ($result['summary'] as $k => $v) {
                    $totals[$k] = ($totals[$k] ?? 0) + $v;
                }

                foreach ($result['actions'] as $action) {
                    $verb = (string) ($action['action'] ?? '');
                    $conf = (string) ($action['confidence'] ?? 'review');
                    if (isset($byConfidence[$conf])) {
                        $byConfidence[$conf]++;
                    }
                    $entry = [
                        'cid' => $cid,
                        'sensor' => $prtgId,
                        'action' => $verb,
                        'confidence' => $conf,
                        'confidence_reason' => $action['confidence_reason'] ?? null,
                        'match_kind' => $action['match_kind'] ?? null,
                        'evidence' => $action['evidence'] ?? null,
                        'prtg' => $action['prtg'] ?? null,
                        'incident_id' => $action['incident_id'] ?? null,
                        'reason' => $action['reason'] ?? null,
                        'fields' => $action['fields'] ?? null,
                    ];
                    $reportRows[] = $entry;

                    if ($verb === 'CREATE') {
                        $creates[] = $entry;
                    } elseif ($verb === 'CONFLICT') {
                        $conflicts[] = $entry;
                    } elseif ($verb === 'UPDATE' && isset($action['fields']['started_at'])) {
                        $timeFixes[] = $entry;
                    } elseif ($verb === 'UPDATE' && isset($action['fields']['recovered_at'])) {
                        $recoveryFixes[] = $entry;
                    }
                }
            } catch (Throwable $e) {
                $totals['errors']++;
                $errors[] = [
                    'cid' => $cid,
                    'sensor' => $prtgId,
                    'error' => $e->getMessage(),
                ];
            }

            $bar->advance();
            if ($sleepMs > 0 && count($sensors) > 1) {
                usleep($sleepMs * 1000);
            }
        }

        $bar->finish();
        $this->newLine(2);

        if (count($sensors) === 1) {
            foreach ($reportRows as $action) {
                $this->printAction($action);
            }
        } else {
            $this->line('--------------------------------------------------------');
            $this->line('TIME START MISMATCHES (UPDATE started_at)');
            $this->line('--------------------------------------------------------');
            if ($timeFixes === []) {
                $this->line('(ninguno)');
            }
            foreach ($timeFixes as $e) {
                $from = $e['fields']['started_at']['from'] ?? '?';
                $to = $e['fields']['started_at']['to'] ?? '?';
                $this->line(sprintf(
                    'CID %s sensor %s incident #%s: %s → %s',
                    $e['cid'] ?? '?',
                    $e['sensor'],
                    $e['incident_id'] ?? '?',
                    $from,
                    $to
                ));
            }

            $this->newLine();
            $this->line('--------------------------------------------------------');
            $this->line('MISSING INTERVALS (CREATE)');
            $this->line('--------------------------------------------------------');
            $this->line('Total CREATE: '.count($creates));
            foreach (array_slice($creates, 0, 40) as $e) {
                $this->line(sprintf(
                    'CID %s sensor %s: %s → %s',
                    $e['cid'] ?? '?',
                    $e['sensor'],
                    $e['prtg']['down'] ?? '?',
                    $e['prtg']['up'] ?? 'OPEN'
                ));
            }
            if (count($creates) > 40) {
                $this->line('... +'.(count($creates) - 40).' más');
            }

            $this->newLine();
            $this->line('--------------------------------------------------------');
            $this->line('RECOVERY TIME MISMATCHES (UPDATE recovered_at → OK PRTG)');
            $this->line('--------------------------------------------------------');
            if ($recoveryFixes === []) {
                $this->line('(ninguno)');
            }
            foreach ($recoveryFixes as $e) {
                $from = $e['fields']['recovered_at']['from'] ?? '?';
                $to = $e['fields']['recovered_at']['to'] ?? '?';
                $this->line(sprintf(
                    'CID %s sensor %s incident #%s: %s → %s',
                    $e['cid'] ?? '?',
                    $e['sensor'],
                    $e['incident_id'] ?? '?',
                    $from === null ? 'NULL' : $from,
                    $to
                ));
            }

            if ($conflicts !== []) {
                $this->newLine();
                $this->line('CONFLICTS: '.count($conflicts));
                foreach (array_slice($conflicts, 0, 20) as $e) {
                    $this->line(sprintf('CID %s sensor %s: %s', $e['cid'] ?? '?', $e['sensor'], $e['reason'] ?? ''));
                }
            }

            if ($errors !== []) {
                $this->newLine();
                $this->warn('ERRORS: '.count($errors));
                foreach (array_slice($errors, 0, 15) as $e) {
                    $this->line(sprintf('CID %s sensor %s: %s', $e['cid'] ?? '?', $e['sensor'], $e['error']));
                }
            }
        }

        $this->newLine();
        $this->line(sprintf(
            'SUMMARY  CREATE=%d  UPDATE=%d  UNCHANGED=%d  CONFLICT=%d  SKIPPED=%d  ERRORS=%d',
            $totals['create'],
            $totals['update'],
            $totals['unchanged'],
            $totals['conflict'],
            $totals['skipped'] ?? 0,
            $totals['errors']
        ));
        $this->line(sprintf(
            'CONFIDENCE high=%d medium=%d review=%d',
            $byConfidence['high'],
            $byConfidence['medium'],
            $byConfidence['review']
        ));
        $this->line('TIME_FIXES (started_at): '.count($timeFixes));
        $this->line('RECOVERY_FIXES (recovered_at): '.count($recoveryFixes));
        if ($dryRun) {
            $this->warn('Dry-run: nada persistido. APPLY masivo: --all --apply --batch=high-time-earlier|high-creates|high-recovery|meta');
        }

        $reportPath = trim((string) $this->option('report'));
        if ($reportPath !== '') {
            $payload = [
                'mode' => $dryRun ? 'dry-run' : 'apply',
                'batch' => $batch,
                'from' => $fromDay,
                'to' => $toDay,
                'sensors' => count($sensors),
                'source' => 'PRTG messages Fallo/OK',
                'summary' => $totals,
                'confidence' => $byConfidence,
                'time_fixes' => $timeFixes,
                'recovery_fixes' => $recoveryFixes,
                'creates' => $creates,
                'conflicts' => $conflicts,
                'errors' => $errors,
            ];
            file_put_contents($reportPath, json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
            $this->line('Report: '.$reportPath);
        }

        return $totals['errors'] > 0 ? self::FAILURE : self::SUCCESS;
    }

    /**
     * @param  array<string, mixed>  $action
     */
    private function printAction(array $action): void
    {
        $verb = (string) ($action['action'] ?? '?');
        $this->line(str_repeat('-', 56));
        $this->line($verb);
        if (isset($action['prtg'])) {
            $this->line('PRTG: '.($action['prtg']['down'] ?? '?').' → '.($action['prtg']['up'] ?? 'OPEN'));
        }
        if (isset($action['incident_id'])) {
            $this->line('Incident: #'.$action['incident_id']);
        }
        if (isset($action['reason'])) {
            $this->line('Reason: '.$action['reason']);
        }
        if (! empty($action['fields']) && is_array($action['fields'])) {
            foreach ($action['fields'] as $field => $change) {
                if (is_array($change)) {
                    $this->line(sprintf(
                        'Field %s: %s → %s',
                        $field,
                        $change['from'] ?? 'null',
                        $change['to'] ?? 'null'
                    ));
                } else {
                    $this->line("Field {$field}: {$change}");
                }
            }
        }
    }

    /**
     * @return array<int, array{sensor: PrtgSensor, prtg_id: int, cid: ?string}>
     */
    private function resolveSensors(): array
    {
        if ($this->option('all')) {
            $limit = $this->option('limit') !== null ? (int) $this->option('limit') : null;
            $query = PrtgSensor::query()
                ->whereRaw('LOWER(name) = ?', ['ping'])
                ->whereNotNull('network_assignment_id')
                ->whereHas('networkAssignment', fn ($q) => $q
                    ->where('monitoring_eligible', true)
                    ->where('is_active', true))
                ->with(['networkAssignment:id,cid'])
                ->orderBy('id');

            if ($limit !== null && $limit > 0) {
                $query->limit($limit);
            }

            return $query->get()->map(fn (PrtgSensor $s) => [
                'sensor' => $s,
                'prtg_id' => (int) $s->prtg_sensor_id,
                'cid' => $s->networkAssignment?->cid,
            ])->all();
        }

        $sensorOpt = (int) $this->option('sensor');
        $cid = trim((string) $this->option('cid'));

        if ($sensorOpt > 0) {
            $local = PrtgSensor::query()->where('prtg_sensor_id', (string) $sensorOpt)->first();
            if (! $local) {
                return [];
            }
            $assignment = $local->network_assignment_id
                ? NetworkAssignment::query()->find($local->network_assignment_id)
                : null;

            return [[
                'sensor' => $local,
                'prtg_id' => $sensorOpt,
                'cid' => $assignment?->cid,
            ]];
        }

        if ($cid === '') {
            return [];
        }

        $assignment = NetworkAssignment::query()->where('cid', $cid)->first();
        $local = $assignment
            ? PrtgSensor::query()
                ->where('network_assignment_id', $assignment->id)
                ->whereRaw('LOWER(name) = ?', ['ping'])
                ->orderBy('id')
                ->first()
            : null;

        if (! $local) {
            return [];
        }

        return [[
            'sensor' => $local,
            'prtg_id' => (int) $local->prtg_sensor_id,
            'cid' => $cid,
        ]];
    }
}
