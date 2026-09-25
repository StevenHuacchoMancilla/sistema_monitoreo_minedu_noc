<?php

namespace App\Domain\Dashboard\Services;

use App\Enums\CidStatus;
use App\Enums\FollowupStatus;
use App\Enums\MonitoringStatus;
use App\Enums\RecoveryReviewStatus;
use App\Domain\Monitoring\Support\SyncCoordinator;
use App\Models\Incident;
use App\Models\NetworkAssignment;
use App\Models\PrtgSensor;
use App\Models\SyncRun;
use Illuminate\Support\Facades\DB;
use Throwable;

class PrtgDashboardService
{
    public function __construct(private readonly DashboardService $dashboard) {}

    /**
     * @return array<string, mixed>
     */
    public function summary(): array
    {
        $driver = (string) config('database.default');
        $dbOnline = false;
        try {
            DB::connection()->getPdo();
            DB::select('select 1 as ok');
            $dbOnline = true;
        } catch (Throwable) {
            $dbOnline = false;
        }

        app(\App\Domain\Incidents\Services\IncidentService::class)->closeOperativeIncidents();

        $totalSchools = \App\Models\School::query()->where('active', true)->count();
        $validCid = NetworkAssignment::query()
            ->where('is_active', true)
            ->where('cid_status', CidStatus::Valid)
            ->count();

        $pingStatuses = \App\Domain\Monitoring\PRTG\Services\PrtgSensorQuery::statusCounts();

        $operativos = (int) ($pingStatuses[MonitoringStatus::Operativo->value] ?? 0);
        $caidos = (int) ($pingStatuses[MonitoringStatus::Caido->value] ?? 0);
        $parciales = (int) ($pingStatuses[MonitoringStatus::Parcial->value] ?? 0);
        $pausados = (int) ($pingStatuses[MonitoringStatus::Pausado->value] ?? 0);

        $eligible = NetworkAssignment::query()
            ->where('is_active', true)
            ->where('monitoring_eligible', true)
            ->count();
        $withPing = \App\Domain\Monitoring\PRTG\Services\PrtgSensorQuery::monitoredAssignmentCount();
        $withoutPrtg = max(0, $eligible - $withPing);

        $activeOutages = $this->dashboard->activeOutages();
        $activeIncidents = $activeOutages->count();
        $pendingContact = $activeOutages->where('followup_status', FollowupStatus::PendienteContacto->value)->count();
        $enGestion = Incident::query()->active()->whereIn('followup_status', FollowupStatus::managingValues())->count();
        $recoveredToday = Incident::query()
            ->whereNotNull('recovered_at')
            ->whereBetween('recovered_at', [\App\Support\OperationalTime::dayStart(), \App\Support\OperationalTime::dayEnd()])
            ->count();
        $pendingReviews = Incident::query()
            ->whereNotNull('recovered_at')
            ->where(function ($q) {
                $q->where('recovery_review_status', RecoveryReviewStatus::PendingReview->value)
                    ->orWhere(function ($q2) {
                        $q2->where('recovered_while_managing', true)
                            ->whereNull('recovery_review_status');
                    });
            })
            ->count();
        $recoveredTotal = Incident::query()->whereNotNull('recovered_at')->count();
        $concentrationCount = count($this->dashboard->concentrations());

        $monitored = $withPing;
        $monitoredBase = max(1, $monitored);
        $sync = $this->lastSyncRun('PRTG');

        $duplicateCids = (int) NetworkAssignment::query()
            ->where('is_active', true)
            ->whereNotNull('cid')
            ->select('cid')
            ->groupBy('cid')
            ->havingRaw('count(*) > 1')
            ->get()
            ->count();

        $duplicatePings = (int) PrtgSensor::query()
            ->whereRaw('LOWER(name) = ?', ['ping'])
            ->whereNotNull('network_assignment_id')
            ->select('network_assignment_id')
            ->groupBy('network_assignment_id')
            ->havingRaw('count(*) > 1')
            ->get()
            ->count();

        $pingProblem = $caidos + $parciales;

        $scope = \App\Domain\Monitoring\PRTG\Services\PrtgSensorQuery::currentScope();
        $inScope = fn () => PrtgSensor::query()->whereRaw("(metadata->>'source_scope') = ?", [$scope]);

        $sensorInventory = [
            'devices' => (int) DB::table('prtg_sensors')
                ->whereRaw("(metadata->>'source_scope') = ?", [$scope])
                ->whereNotNull('prtg_device_id')
                ->selectRaw('count(distinct prtg_device_id) as c')
                ->value('c'),
            'sensors_total' => (int) $inScope()->count(),
            'sensors_ping' => (int) $inScope()->whereRaw('LOWER(name) = ?', ['ping'])->count(),
            'sensors_lan' => (int) $inScope()->whereRaw('LOWER(name) = ?', ['lan colegio'])->count(),
            'sensors_other' => (int) $inScope()
                ->whereRaw('LOWER(name) NOT IN (?, ?)', ['ping', 'lan colegio'])
                ->count(),
            'source_scope' => $scope,
        ];

        return [
            'health' => [
                'api' => true,
                'database' => $dbOnline,
                'prtg' => $sync !== null && ($sync['error_count'] ?? 0) === 0,
                'driver' => $driver,
                'name' => config('database.connections.'.$driver.'.database'),
            ],
            'sync' => $sync,
            'kpis' => [
                'total_schools' => $totalSchools,
                'valid_cid' => $validCid,
                'monitored' => $monitored,
                'operational' => $operativos,
                'down' => $caidos,
                'partial' => $parciales,
                'paused' => $pausados,
                'without_prtg' => $withoutPrtg,
                'active_incidents' => $activeIncidents,
                'pending_contact' => $pendingContact,
                'in_management' => $enGestion,
                'recovered_today' => $recoveredToday,
                'pending_reviews' => $pendingReviews,
                'concentrations' => $concentrationCount,
                'prtg_devices' => $sensorInventory['devices'],
                'prtg_sensors_total' => $sensorInventory['sensors_total'],
                'prtg_sensors_ping' => $sensorInventory['sensors_ping'],
                'prtg_sensors_lan' => $sensorInventory['sensors_lan'],
            ],
            'status_distribution' => [
                'operational' => $operativos,
                'down' => $caidos,
                'partial' => $parciales,
                'paused' => $pausados,
                'without_monitoring' => $withoutPrtg,
                'operational_pct' => round(($operativos / $monitoredBase) * 100, 1),
            ],
            'coverage' => [
                'valid_cid' => $validCid,
                'associated' => $monitored,
                'unassociated' => $withoutPrtg,
                'eligible' => $eligible,
                'with_ping' => $withPing,
                'without_ping' => $withoutPrtg,
                'duplicate_cids' => $duplicateCids,
                'duplicate_ping_sensors' => $duplicatePings,
                'sync_warnings' => (int) ($sync['warning_count'] ?? 0),
                'without_ping_samples' => $this->assignmentsWithoutPing(8),
            ],
            'monitoring' => [
                'associated_devices' => $monitored,
                'unassociated_devices' => $withoutPrtg,
                'ping_sensors' => $sensorInventory['sensors_ping'],
                'lan_sensors' => $sensorInventory['sensors_lan'],
                'sensors_total' => $sensorInventory['sensors_total'],
                'problem_sensors' => $pingProblem,
                'source_scope' => $sensorInventory['source_scope'],
            ],
            'inventory' => $sensorInventory,
            'sync_diagnostics' => $this->syncDiagnostics($sync),
            'charts' => $this->buildCharts(
                $operativos,
                $caidos,
                $parciales,
                $pausados,
                $withoutPrtg,
                $sensorInventory
            ),
            'nav' => [
                'caidas_activas' => $activeIncidents,
                'pendientes_contacto' => $pendingContact,
                'en_gestion' => $enGestion,
                'concentraciones' => $concentrationCount,
                'recuperados' => $recoveredToday,
                'pending_reviews' => $pendingReviews,
            ],
            'links' => [
                'downs' => '/incidents/active',
                'pending_contact' => '/incidents/pending',
                'in_management' => '/incidents/managing',
                'recoveries' => '/recoveries',
                'pending_reviews' => '/recoveries?review_status=PENDING_REVIEW',
                'concentrations' => '/concentrations',
                'school_history' => '/history/schools',
                'without_prtg' => '/admin',
                'diagnostics' => '/admin',
            ],
        ];
    }

    /**
     * @param  array<string, mixed>|null  $sync
     * @return array<string, mixed>
     */
    private function syncDiagnostics(?array $sync): array
    {
        $runId = isset($sync['run_id']) ? (int) $sync['run_id'] : null;
        if (! $runId) {
            $runId = SyncRun::query()
                ->where('source', 'PRTG')
                ->whereNotNull('finished_at')
                ->orderByDesc('id')
                ->value('id');
        }

        if (! $runId) {
            return [
                'run_id' => null,
                'total_warnings' => 0,
                'total_errors' => 0,
                'by_code' => [],
                'samples' => [],
                'summary' => 'Sin sincronizaciones PRTG registradas.',
            ];
        }

        $byCode = \App\Models\SyncIssue::query()
            ->where('sync_run_id', $runId)
            ->selectRaw("code, severity, count(*)::int as total")
            ->groupBy('code', 'severity')
            ->orderByDesc('total')
            ->get()
            ->map(fn ($row) => [
                'code' => (string) $row->code,
                'severity' => $row->severity?->value ?? (string) $row->severity,
                'total' => (int) $row->total,
                'label' => $this->issueLabel((string) $row->code),
            ])
            ->values()
            ->all();

        $samples = \App\Models\SyncIssue::query()
            ->where('sync_run_id', $runId)
            ->orderByDesc('id')
            ->limit(6)
            ->get(['code', 'severity', 'message', 'cid', 'payload'])
            ->map(fn ($issue) => [
                'code' => (string) $issue->code,
                'severity' => $issue->severity?->value ?? (string) $issue->severity,
                'message' => (string) $issue->message,
                'cid' => $issue->cid,
                'payload' => $issue->payload,
            ])
            ->all();

        $warnTotal = (int) ($sync['warning_count'] ?? array_sum(array_map(
            fn ($r) => strtoupper((string) $r['severity']) === 'WARNING' ? (int) $r['total'] : 0,
            $byCode
        )));

        $summary = $warnTotal === 0
            ? 'Sincronización limpia: sin advertencias de calidad de datos.'
            : 'Advertencias de calidad (no bloquean el monitoreo): '.implode(
                ' · ',
                array_map(fn ($r) => $r['label'].' ('.$r['total'].')', $byCode)
            );

        return [
            'run_id' => (int) $runId,
            'total_warnings' => $warnTotal,
            'total_errors' => (int) ($sync['error_count'] ?? 0),
            'by_code' => $byCode,
            'samples' => $samples,
            'summary' => $summary,
        ];
    }

    private function issueLabel(string $code): string
    {
        return match ($code) {
            'PRTG_LOCATION_MISMATCH' => 'Ubicación no alineable con PRTG',
            'PRTG_LOCATION_UPDATED' => 'Ubicación alineada desde PRTG',
            'DUPLICATE_PRTG_DEVICE' => 'CID duplicado en PRTG',
            'CLOUDNET_DEVICE_API_UNAVAILABLE' => 'API equipos Cloudnet no disponible',
            'DUPLICATE_PING_SENSOR' => 'Varios sensores Ping',
            'PRTG_DEVICE_WITHOUT_CID' => 'Dispositivo sin CID',
            'PRTG_DEVICE_WITHOUT_ASSIGNMENT' => 'Sin asignación en BD',
            'PRTG_DEVICE_WITHOUT_PING' => 'Sin sensor Ping',
            'PRTG_HIERARCHY_WARNING' => 'Jerarquía incompleta',
            default => $code,
        };
    }

    /**
     * @param  array<string, mixed>  $inventory
     * @return array<string, mixed>
     */
    private function buildCharts(
        int $operativos,
        int $caidos,
        int $parciales,
        int $pausados,
        int $withoutPrtg,
        array $inventory
    ): array {
        $pingSub = \App\Domain\Monitoring\PRTG\Services\PrtgSensorQuery::canonicalPingSubquery();

        $byProvinceRows = DB::select(
            <<<SQL
            SELECT
                COALESCE(NULLIF(TRIM(na.prtg_province), ''), 'SIN PROVINCIA') AS province,
                c.normalized_status,
                COUNT(*)::int AS total
            FROM ({$pingSub}) c
            INNER JOIN network_assignments na ON na.id = c.network_assignment_id
            GROUP BY 1, 2
            ORDER BY 1
            SQL
        );

        /** @var array<string, array{province: string, operational: int, down: int, partial: int, paused: int, total: int}> $byProvince */
        $byProvince = [];
        foreach ($byProvinceRows as $row) {
            $province = (string) $row->province;
            if (! isset($byProvince[$province])) {
                $byProvince[$province] = [
                    'province' => $province,
                    'operational' => 0,
                    'down' => 0,
                    'partial' => 0,
                    'paused' => 0,
                    'total' => 0,
                ];
            }
            $status = (string) $row->normalized_status;
            $total = (int) $row->total;
            $byProvince[$province]['total'] += $total;
            if ($status === MonitoringStatus::Operativo->value) {
                $byProvince[$province]['operational'] += $total;
            } elseif ($status === MonitoringStatus::Caido->value) {
                $byProvince[$province]['down'] += $total;
            } elseif ($status === MonitoringStatus::Parcial->value) {
                $byProvince[$province]['partial'] += $total;
            } elseif ($status === MonitoringStatus::Pausado->value) {
                $byProvince[$province]['paused'] += $total;
            }
        }

        $provinceChart = array_values($byProvince);
        usort($provinceChart, fn ($a, $b) => $b['down'] <=> $a['down'] ?: $b['total'] <=> $a['total']);

        $runs = SyncRun::query()
            ->where('source', 'PRTG')
            ->whereNotNull('finished_at')
            ->orderByDesc('id')
            ->limit(36)
            ->get(['finished_at', 'metadata']);

        $availabilityTrend = $runs
            ->reverse()
            ->values()
            ->map(function (SyncRun $run) {
                $meta = is_array($run->metadata) ? $run->metadata : [];
                $operativos = (int) ($meta['operativos'] ?? 0);
                $downs = (int) ($meta['downs'] ?? 0);
                $base = max(1, $operativos + $downs);

                return [
                    'at' => $run->finished_at?->toIso8601String(),
                    'label' => \App\Support\OperationalTime::format($run->finished_at, 'H:i') ?? '',
                    'operational' => $operativos,
                    'down' => $downs,
                    'availability_pct' => round(($operativos / $base) * 100, 1),
                ];
            })
            ->all();

        $transitionRows = DB::select(
            <<<'SQL'
            SELECT
                to_char(date_trunc('hour', occurred_at), 'HH24:00') AS hour_label,
                date_trunc('hour', occurred_at) AS hour_bucket,
                SUM(CASE WHEN new_status = 'CAIDO' THEN 1 ELSE 0 END)::int AS to_down,
                SUM(CASE WHEN new_status = 'OPERATIVO' THEN 1 ELSE 0 END)::int AS to_up,
                COUNT(*)::int AS total
            FROM prtg_events
            WHERE occurred_at >= NOW() - INTERVAL '24 hours'
            GROUP BY 1, 2
            ORDER BY 2
            SQL
        );

        $transitions = array_map(static fn ($row) => [
            'hour' => (string) $row->hour_label,
            'to_down' => (int) $row->to_down,
            'to_up' => (int) $row->to_up,
            'total' => (int) $row->total,
        ], $transitionRows);

        $concentrations = array_slice($this->dashboard->concentrations(), 0, 8);
        $concentrationBars = array_map(static fn (array $z) => [
            'label' => (string) ($z['label'] ?? ''),
            'caidos' => (int) ($z['caidos'] ?? 0),
            'pct' => (float) ($z['porcentaje_caidos'] ?? 0),
        ], $concentrations);

        $fleet2d = $this->fleetSeries('2 days', 'hour');
        $fleet30d = $this->fleetSeries('30 days', 'day');

        return [
            'ping_status' => [
                ['key' => 'operational', 'label' => 'Operativos', 'value' => $operativos, 'color' => '#15803d'],
                ['key' => 'down', 'label' => 'Caídos', 'value' => $caidos, 'color' => '#b91c1c'],
                ['key' => 'partial', 'label' => 'Parciales', 'value' => $parciales, 'color' => '#b45309'],
                ['key' => 'paused', 'label' => 'Pausados', 'value' => $pausados, 'color' => '#64748b'],
                ['key' => 'without', 'label' => 'Sin Ping', 'value' => $withoutPrtg, 'color' => '#94a3b8'],
            ],
            'sensor_mix' => [
                ['key' => 'ping', 'label' => 'Ping', 'value' => (int) $inventory['sensors_ping'], 'color' => '#1d4ed8'],
                ['key' => 'lan', 'label' => 'LAN COLEGIO', 'value' => (int) $inventory['sensors_lan'], 'color' => '#0e7490'],
                ['key' => 'other', 'label' => 'Otros', 'value' => (int) $inventory['sensors_other'], 'color' => '#94a3b8'],
            ],
            'availability_trend' => $availabilityTrend,
            'fleet_2d' => $fleet2d,
            'fleet_30d' => $fleet30d,
            'transitions_24h' => $transitions,
            'by_province' => $provinceChart,
            'concentrations' => $concentrationBars,
            'snapshot' => [
                'availability_pct' => round(($operativos / max(1, $operativos + $caidos + $parciales + $pausados)) * 100, 1),
                'alarms' => $caidos + $parciales,
                'operational' => $operativos,
                'down' => $caidos,
                'monitored' => $operativos + $caidos + $parciales + $pausados,
            ],
        ];
    }

    /**
     * Serie estilo NOC: disponibilidad % + alarmas (caídos sync) agregada.
     *
     * @return array<int, array<string, mixed>>
     */
    private function fleetSeries(string $interval, string $bucket): array
    {
        $trunc = $bucket === 'day' ? 'day' : 'hour';
        $labelFmt = $bucket === 'day' ? 'DD/MM' : 'HH24:00';

        $rows = DB::select(
            <<<SQL
            SELECT
                date_trunc('{$trunc}', finished_at) AS bucket,
                to_char(date_trunc('{$trunc}', finished_at), '{$labelFmt}') AS label,
                ROUND(AVG(NULLIF((metadata->>'operativos')::numeric, 0) /
                    NULLIF(((metadata->>'operativos')::numeric + (metadata->>'downs')::numeric), 0)) * 100, 1) AS availability_pct,
                ROUND(AVG(COALESCE((metadata->>'downs')::numeric, 0)), 0) AS alarms,
                ROUND(AVG(COALESCE((metadata->>'operativos')::numeric, 0)), 0) AS operational,
                COUNT(*)::int AS samples
            FROM sync_runs
            WHERE source = 'PRTG'
              AND finished_at IS NOT NULL
              AND finished_at >= NOW() - INTERVAL '{$interval}'
              AND (metadata->>'operativos') IS NOT NULL
            GROUP BY 1, 2
            ORDER BY 1
            SQL
        );

        $eventRows = DB::select(
            <<<SQL
            SELECT
                date_trunc('{$trunc}', occurred_at) AS bucket,
                SUM(CASE WHEN new_status = 'CAIDO' THEN 1 ELSE 0 END)::int AS transitions_down,
                SUM(CASE WHEN new_status = 'OPERATIVO' THEN 1 ELSE 0 END)::int AS transitions_up
            FROM prtg_events
            WHERE occurred_at >= NOW() - INTERVAL '{$interval}'
            GROUP BY 1
            ORDER BY 1
            SQL
        );

        $eventsByBucket = [];
        foreach ($eventRows as $row) {
            $eventsByBucket[(string) $row->bucket] = [
                'transitions_down' => (int) $row->transitions_down,
                'transitions_up' => (int) $row->transitions_up,
            ];
        }

        return array_map(static function ($row) use ($eventsByBucket) {
            $key = (string) $row->bucket;
            $ev = $eventsByBucket[$key] ?? ['transitions_down' => 0, 'transitions_up' => 0];

            return [
                'at' => $key,
                'label' => (string) $row->label,
                'availability_pct' => $row->availability_pct !== null ? (float) $row->availability_pct : null,
                'alarms' => (int) $row->alarms,
                'operational' => (int) $row->operational,
                'transitions_down' => $ev['transitions_down'],
                'transitions_up' => $ev['transitions_up'],
                'samples' => (int) $row->samples,
            ];
        }, $rows);
    }

    /**
     * Asignaciones elegibles sin sensor Ping (brecha de cobertura PRTG).
     *
     * @return list<array{cid: ?string, local_educativo: ?string, codigo_local: ?string, provincia: ?string, distrito: ?string, device: ?string}>
     */
    private function assignmentsWithoutPing(int $limit = 8): array
    {
        return NetworkAssignment::query()
            ->where('is_active', true)
            ->where('monitoring_eligible', true)
            ->whereDoesntHave('sensors', function ($q) {
                $q->whereRaw('LOWER(name) = ?', ['ping']);
            })
            ->with('school:id,local_educativo,codigo_local')
            ->orderBy('cid')
            ->limit($limit)
            ->get(['id', 'cid', 'school_id', 'prtg_province', 'prtg_district', 'prtg_device_name'])
            ->map(fn (NetworkAssignment $row) => [
                'cid' => $row->cid,
                'local_educativo' => $row->school?->local_educativo,
                'codigo_local' => $row->school?->codigo_local,
                'provincia' => $row->prtg_province,
                'distrito' => $row->prtg_district,
                'device' => $row->prtg_device_name,
            ])
            ->values()
            ->all();
    }

    /**
     * @return array<string, mixed>|null
     */
    private function lastSyncRun(string $source): ?array
    {
        return SyncCoordinator::lastFinishedRun($source);
    }
}
