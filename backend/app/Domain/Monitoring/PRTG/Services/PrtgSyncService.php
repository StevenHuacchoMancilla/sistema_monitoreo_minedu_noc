<?php

namespace App\Domain\Monitoring\PRTG\Services;

use App\Domain\Incidents\Services\IncidentService;
use App\Enums\CidStatus;
use App\Enums\MonitoringStatus;
use App\Enums\SyncIssueSeverity;
use App\Enums\SyncRunStatus;
use App\Models\NetworkAssignment;
use App\Models\PrtgEvent;
use App\Models\PrtgSensor;
use App\Models\SyncIssue;
use App\Models\SyncRun;
use Illuminate\Support\Facades\Log;
use Throwable;

class PrtgSyncService
{
    public function __construct(
        private readonly PrtgService $prtg,
        private readonly IncidentService $incidentService,
    ) {}

    /**
     * @return array<string, mixed>
     */
    public function sync(): array
    {
        $run = SyncRun::query()->create([
            'source' => 'PRTG',
            'started_at' => now(),
            'status' => SyncRunStatus::Success,
        ]);

        SyncRun::query()
            ->where('source', 'PRTG')
            ->whereNull('finished_at')
            ->where('id', '!=', $run->id)
            ->update([
                'status' => SyncRunStatus::Failed,
                'finished_at' => now(),
                'metadata' => ['error' => 'sync_interrupted'],
            ]);

        try {
            $summary = $this->runSync($run);
            $summary['closed_operativo'] = $this->incidentService->closeOperativeIncidents();
        } catch (Throwable $exception) {
            Log::error('PRTG sync failed', ['message' => $exception->getMessage()]);
            $run->update([
                'status' => SyncRunStatus::Failed,
                'finished_at' => now(),
                'error_count' => $run->error_count + 1,
                'metadata' => ['error' => $exception->getMessage()],
            ]);
            $code = str_contains($exception->getMessage(), 'PRTG_ALLOWED_ROOT_NOT_FOUND')
                ? 'PRTG_ALLOWED_ROOT_NOT_FOUND'
                : 'PRTG_SYNC_FAILED';
            $this->issue($run, SyncIssueSeverity::Error, $code, null, null, $exception->getMessage(), []);

            throw $exception;
        }

        $fresh = $run->fresh();
        $status = ($fresh->error_count > 0 || $fresh->warning_count > 0)
            ? SyncRunStatus::SuccessWithWarnings
            : SyncRunStatus::Success;

        $run->update([
            'status' => $status,
            'finished_at' => now(),
            'received_count' => $summary['received_count'],
            'processed_count' => $summary['processed_count'],
            'created_count' => $summary['created_count'],
            'updated_count' => $summary['updated_count'],
            'ignored_count' => $summary['ignored_count'],
            'metadata' => $summary,
        ]);

        return array_merge($summary, [
            'sync_run_id' => $run->id,
            'status' => $status->value,
        ]);
    }

    /**
     * Auditoría READ-ONLY del scope allowlist (no modifica incidencias ni sensores).
     *
     * @return array<string, mixed>
     */
    public function scopeAudit(): array
    {
        $probe = (string) config('prtg.allowed_probe');
        $rootName = (string) config('prtg.allowed_root_group');

        Log::info('[PRTG] Starting scope audit', [
            'probe' => $probe,
            'allowed_root' => $rootName,
        ]);

        $root = $this->prtg->findAllowedRootGroup();
        $tableCount = (int) config('prtg.table_count', 10000);

        $groups = $this->prtg->fetchTable('groups', [
            'columns' => 'objid,group,probe,parentid,status',
            'count' => $tableCount,
        ]);
        $groupIndex = $this->prtg->indexGroupsById($groups);
        $geo = $this->prtg->countGeoGroups($root['objid'], $groupIndex);

        $devices = $this->prtg->fetchTable('devices', [
            'id' => $root['objid'],
            'columns' => 'objid,device,host,group,probe,parentid,status',
            'count' => $tableCount,
        ]);
        $sensors = $this->prtg->fetchTable('sensors', [
            'id' => $root['objid'],
            'columns' => 'objid,sensor,device,status,status_raw,lastvalue,lastcheck,lastcheck_raw,downtimesince,type,parentid,message',
            'count' => $tableCount,
        ]);

        $discovered = $this->discoverScopedDevices($devices, $sensors, $root['objid'], $groupIndex, null);

        $assignments = NetworkAssignment::query()
            ->where('is_active', true)
            ->where('cid_status', CidStatus::Valid)
            ->where('monitoring_eligible', true)
            ->pluck('cid')
            ->flip();

        $associated = 0;
        $unassociated = 0;
        foreach (array_keys($discovered['devices_by_cid']) as $cid) {
            if ($assignments->has($cid)) {
                $associated++;
            } else {
                $unassociated++;
            }
        }

        $summary = [
            'probe' => $root['probe'],
            'root_group' => $root['name'],
            'root_objid' => $root['objid'],
            'source_scope' => $root['probe'].' > '.$root['name'],
            'provinces' => $geo['provinces'],
            'districts' => $geo['districts'],
            'devices' => $discovered['devices_in_scope'],
            'devices_cid' => $discovered['devices_with_cid'],
            'unique_cids' => count($discovered['devices_by_cid']),
            'duplicate_cids' => $discovered['duplicate_cids'],
            'associated_with_db' => $associated,
            'unassociated' => $unassociated,
            'ping_sensors' => $discovered['ping_sensors'],
            'devices_without_ping' => $discovered['devices_without_ping'],
            'excluded_objects' => $discovered['excluded_outside_scope'] + $discovered['ignored_no_cid'],
            'excluded_outside_scope' => $discovered['excluded_outside_scope'],
            'ignored_no_cid' => $discovered['ignored_no_cid'],
            'warnings' => $discovered['hierarchy_warnings'],
            'read_only' => true,
        ];

        $run = SyncRun::query()->create([
            'source' => 'PRTG_SCOPE_AUDIT',
            'started_at' => now(),
            'finished_at' => now(),
            'status' => SyncRunStatus::Success,
            'received_count' => $summary['devices'],
            'processed_count' => $summary['devices_cid'],
            'metadata' => $summary,
        ]);

        $summary['sync_run_id'] = $run->id;

        Log::info('[PRTG] Scope audit finished', [
            'devices' => $summary['devices'],
            'cid_devices' => $summary['devices_cid'],
            'associated' => $summary['associated_with_db'],
        ]);

        return $summary;
    }

    /**
     * Auditoría READ-ONLY de geografía operativa PRTG (provincias/distritos/CID).
     * No escribe SyncRun, sensores, schools ni incidencias.
     *
     * @return array<string, mixed>
     */
    public function locationAudit(bool $verbose = false): array
    {
        $probe = (string) config('prtg.allowed_probe');
        $rootName = (string) config('prtg.allowed_root_group');

        Log::info('[PRTG] Starting location audit', [
            'probe' => $probe,
            'allowed_root' => $rootName,
            'verbose' => $verbose,
        ]);

        $root = $this->prtg->findAllowedRootGroup();
        $tableCount = (int) config('prtg.table_count', 10000);

        $groups = $this->prtg->fetchTable('groups', [
            'columns' => 'objid,group,probe,parentid,status',
            'count' => $tableCount,
        ]);
        $groupIndex = $this->prtg->indexGroupsById($groups);
        $geoTree = $this->prtg->mapGeoTree($root['objid'], $groupIndex);
        $geo = $this->prtg->countGeoGroups($root['objid'], $groupIndex);

        $devices = $this->prtg->fetchTable('devices', [
            'id' => $root['objid'],
            'columns' => 'objid,device,host,group,probe,parentid,status',
            'count' => $tableCount,
        ]);
        $sensors = $this->prtg->fetchTable('sensors', [
            'id' => $root['objid'],
            'columns' => 'objid,sensor,device,status,status_raw,lastvalue,lastcheck,lastcheck_raw,downtimesince,type,parentid,message',
            'count' => $tableCount,
        ]);

        $discovered = $this->discoverScopedDevices($devices, $sensors, $root['objid'], $groupIndex, null);

        $assignments = NetworkAssignment::query()
            ->with('school:id,codigo_local,local_educativo,provincia,distrito')
            ->where('is_active', true)
            ->where('cid_status', CidStatus::Valid)
            ->where('monitoring_eligible', true)
            ->get(['id', 'cid', 'school_id', 'prtg_province', 'prtg_district'])
            ->keyBy('cid');

        $associated = 0;
        $unassociated = 0;
        $withoutProvince = 0;
        $withoutDistrict = 0;
        $unexpectedHierarchy = 0;
        $locationMismatches = 0;
        $persistedOk = 0;
        $persistedMissing = 0;
        $verboseRows = [];

        $provinceStats = [];
        foreach ($geoTree as $province) {
            $provinceStats[$province['name']] = [
                'province' => $province['name'],
                'districts' => count($province['districts']),
                'devices' => 0,
                'associated' => 0,
                'mismatches' => 0,
            ];
        }

        foreach ($discovered['devices_by_cid'] as $cid => $candidates) {
            $device = $candidates[0];
            $objid = (string) ($device['objid'] ?? '');
            $deviceName = (string) ($device['device'] ?? '');
            $location = $discovered['locations_by_device'][$objid] ?? [
                'province' => null,
                'district' => null,
                'under_root' => false,
                'ancestor_levels' => 0,
                'warning' => 'missing_location',
            ];

            $province = $location['province'] ?? null;
            $district = $location['district'] ?? null;
            $levels = (int) ($location['ancestor_levels'] ?? 0);
            $warning = $location['warning'] ?? null;

            if ($province === null || $province === '') {
                $withoutProvince++;
            }
            if ($district === null || $district === '') {
                $withoutDistrict++;
            }
            if ($warning !== null || $levels > 2) {
                $unexpectedHierarchy++;
            }

            if ($province !== null && $province !== '' && isset($provinceStats[$province])) {
                $provinceStats[$province]['devices']++;
            } elseif ($province !== null && $province !== '') {
                $provinceStats[$province] = [
                    'province' => $province,
                    'districts' => 0,
                    'devices' => 1,
                    'associated' => 0,
                    'mismatches' => 0,
                ];
            }

            /** @var NetworkAssignment|null $assignment */
            $assignment = $assignments->get($cid);
            $matchLabel = 'NO_DB';
            if ($assignment !== null) {
                $associated++;
                if ($province !== null && $province !== '' && isset($provinceStats[$province])) {
                    $provinceStats[$province]['associated']++;
                }

                $hasPersisted = trim((string) ($assignment->prtg_province ?? '')) !== ''
                    || trim((string) ($assignment->prtg_district ?? '')) !== '';
                if ($hasPersisted) {
                    $persistedOk++;
                } else {
                    $persistedMissing++;
                }

                if ($this->locationMismatch($assignment, $location)) {
                    $locationMismatches++;
                    $matchLabel = 'MISMATCH';
                    if ($province !== null && $province !== '' && isset($provinceStats[$province])) {
                        $provinceStats[$province]['mismatches']++;
                    }
                } else {
                    $matchLabel = 'MATCH';
                }
            } else {
                $unassociated++;
            }

            if ($verbose) {
                $school = $assignment?->school;
                $verboseRows[] = [
                    'province' => $province ?? '—',
                    'district' => $district ?? '—',
                    'cid' => $cid,
                    'device' => $deviceName,
                    'match_db' => $matchLabel,
                    'db_province' => $school?->provincia ?? '—',
                    'db_district' => $school?->distrito ?? '—',
                    'stored_prtg_province' => $assignment?->prtg_province ?? '—',
                    'stored_prtg_district' => $assignment?->prtg_district ?? '—',
                    'warning' => $warning ?? '',
                ];
            }
        }

        uasort($provinceStats, fn (array $a, array $b): int => strcasecmp($a['province'], $b['province']));

        $summary = [
            'probe' => $root['probe'],
            'root_group' => $root['name'],
            'root_objid' => $root['objid'],
            'source_scope' => $root['probe'].' > '.$root['name'],
            'provinces' => $geo['provinces'],
            'districts' => $geo['districts'],
            'devices_in_scope' => $discovered['devices_in_scope'],
            'devices_cid' => $discovered['devices_with_cid'],
            'unique_cids' => count($discovered['devices_by_cid']),
            'duplicate_cids' => $discovered['duplicate_cids'],
            'associated_with_db' => $associated,
            'unassociated' => $unassociated,
            'devices_without_province' => $withoutProvince,
            'devices_without_district' => $withoutDistrict,
            'unexpected_hierarchy' => $unexpectedHierarchy,
            'location_mismatches' => $locationMismatches,
            'assignments_with_prtg_location' => $persistedOk,
            'assignments_missing_prtg_location' => $persistedMissing,
            'province_breakdown' => array_values($provinceStats),
            'read_only' => true,
        ];

        if ($verbose) {
            usort($verboseRows, function (array $a, array $b): int {
                return strcasecmp($a['province'], $b['province'])
                    ?: strcasecmp($a['district'], $b['district'])
                    ?: strcasecmp($a['cid'], $b['cid']);
            });
            $summary['verbose_rows'] = $verboseRows;
        }

        Log::info('[PRTG] Location audit finished', [
            'provinces' => $summary['provinces'],
            'districts' => $summary['districts'],
            'devices_cid' => $summary['devices_cid'],
            'mismatches' => $summary['location_mismatches'],
        ]);

        return $summary;
    }

    /**
     * @return array<string, mixed>
     */
    private function runSync(SyncRun $run): array
    {
        $probe = (string) config('prtg.allowed_probe');
        $rootName = (string) config('prtg.allowed_root_group');
        Log::info('[PRTG] Starting sync', [
            'probe' => $probe,
            'allowed_root' => $rootName,
        ]);

        try {
            $root = $this->prtg->findAllowedRootGroup();
        } catch (Throwable $exception) {
            $this->issue(
                $run,
                SyncIssueSeverity::Error,
                'PRTG_ALLOWED_ROOT_NOT_FOUND',
                null,
                null,
                $exception->getMessage(),
                [
                    'probe' => $probe,
                    'allowed_root' => $rootName,
                ]
            );

            throw $exception;
        }

        $tableCount = (int) config('prtg.table_count', 10000);
        $groups = $this->prtg->fetchTable('groups', [
            'columns' => 'objid,group,probe,parentid,status',
            'count' => $tableCount,
        ]);
        $groupIndex = $this->prtg->indexGroupsById($groups);
        $geo = $this->prtg->countGeoGroups($root['objid'], $groupIndex);

        $devices = $this->prtg->fetchTable('devices', [
            'id' => $root['objid'],
            'columns' => 'objid,device,host,group,probe,parentid,status',
            'count' => $tableCount,
        ]);
        $sensors = $this->prtg->fetchTable('sensors', [
            'id' => $root['objid'],
            'columns' => 'objid,sensor,device,status,status_raw,lastvalue,lastcheck,lastcheck_raw,downtimesince,type,parentid,message',
            'count' => $tableCount,
        ]);

        $discovered = $this->discoverScopedDevices(
            $devices,
            $sensors,
            $root['objid'],
            $groupIndex,
            $run
        );

        $summary = [
            'source_scope' => $root['probe'].' > '.$root['name'],
            'probe' => $root['probe'],
            'root_group' => $root['name'],
            'root_objid' => $root['objid'],
            'provinces' => $geo['provinces'],
            'districts' => $geo['districts'],
            'received_count' => $discovered['devices_in_scope'],
            'processed_count' => 0,
            'created_count' => 0,
            'updated_count' => 0,
            'ignored_count' => $discovered['ignored_no_cid'],
            'matched' => 0,
            'unmatched' => 0,
            'downs' => 0,
            'operativos' => 0,
            'excluded_outside_scope' => $discovered['excluded_outside_scope'],
            'duplicate_cids' => $discovered['duplicate_cids'],
            'location_mismatches' => 0,
            'location_updated' => 0,
        ];

        Log::info('[PRTG] Devices discovered', [
            'devices' => $discovered['devices_in_scope'],
            'cid_devices' => $discovered['devices_with_cid'],
            'excluded_outside_scope' => $discovered['excluded_outside_scope'],
        ]);

        $assignments = NetworkAssignment::query()
            ->with('school')
            ->where('is_active', true)
            ->where('cid_status', CidStatus::Valid)
            ->where('monitoring_eligible', true)
            ->get()
            ->keyBy('cid');

        $sensorsByDevice = $discovered['sensors_by_device'];
        $locationsByDevice = $discovered['locations_by_device'];

        foreach ($discovered['devices_by_cid'] as $cid => $candidates) {
            try {
                $device = $this->resolveDevice($cid, $candidates, $assignments->get($cid), $run);
                if ($device === null) {
                    $summary['unmatched']++;

                    continue;
                }

                $assignment = $assignments->get($cid);
                if ($assignment === null) {
                    $this->issue(
                        $run,
                        SyncIssueSeverity::Warning,
                        'PRTG_DEVICE_WITHOUT_ASSIGNMENT',
                        $cid,
                        null,
                        'Dispositivo PRTG sin asignación activa.',
                        ['device' => $device['device'] ?? null]
                    );
                    $summary['unmatched']++;

                    continue;
                }

                $summary['matched']++;
                $objid = (string) ($device['objid'] ?? '');
                $location = $locationsByDevice[$objid] ?? [
                    'province' => null,
                    'district' => null,
                ];

                // Ubicación operativa PRTG → network_assignments (no toca schools Excel/admin).
                if ($this->persistAssignmentPrtgLocation($assignment, $location)) {
                    $summary['location_updated']++;
                }

                // Mismatch informativo: admin Excel (schools) vs jerarquía PRTG.
                if ($this->locationMismatch($assignment, $location)) {
                    $summary['location_mismatches']++;
                    $this->issue(
                        $run,
                        SyncIssueSeverity::Warning,
                        'PRTG_LOCATION_MISMATCH',
                        $cid,
                        $assignment->school?->codigo_local,
                        'Provincia/distrito admin (Excel) difiere de la jerarquía PRTG. Operativo usa PRTG.',
                        [
                            'school_provincia' => $assignment->school?->provincia,
                            'school_distrito' => $assignment->school?->distrito,
                            'prtg_province' => $location['province'],
                            'prtg_district' => $location['district'],
                            'assignment_prtg_province' => $assignment->prtg_province,
                            'assignment_prtg_district' => $assignment->prtg_district,
                        ]
                    );
                }

                $deviceSensors = $sensorsByDevice[$objid] ?? [];
                $ping = $this->resolvePingSensor($deviceSensors, $run, $cid);

                $previousBySensor = [];
                foreach ($deviceSensors as $sensorRow) {
                    $sensorId = (string) ($sensorRow['objid'] ?? '');
                    if ($sensorId !== '') {
                        $existing = PrtgSensor::query()->where('prtg_sensor_id', $sensorId)->first();
                        $previousBySensor[$sensorId] = $existing?->normalized_status;
                    }
                    $result = $this->upsertSensor($assignment->id, $device, $sensorRow, $root, $location);
                    $summary['created_count'] += $result['created'];
                    $summary['updated_count'] += $result['updated'];
                }

                if ($ping !== null) {
                    $sensorModel = PrtgSensor::query()
                        ->where('prtg_sensor_id', (string) $ping['objid'])
                        ->first();

                    if ($sensorModel) {
                        $previous = $previousBySensor[(string) $ping['objid']] ?? null;
                        $this->handleStatusTransition($assignment, $sensorModel, $previous);
                        if ($sensorModel->normalized_status === MonitoringStatus::Caido) {
                            $summary['downs']++;
                        } elseif ($sensorModel->normalized_status === MonitoringStatus::Operativo) {
                            $summary['operativos']++;
                        }
                    }
                } else {
                    $this->issue(
                        $run,
                        SyncIssueSeverity::Warning,
                        'PRTG_DEVICE_WITHOUT_PING',
                        $cid,
                        $assignment->school?->codigo_local,
                        'Dispositivo CID sin sensor Ping.',
                        ['device' => $device['device'] ?? null]
                    );
                }

                $summary['processed_count']++;
            } catch (Throwable $exception) {
                $this->issue(
                    $run,
                    SyncIssueSeverity::Error,
                    'PRTG_DEVICE_FAILED',
                    $cid,
                    null,
                    $exception->getMessage(),
                    []
                );
            }
        }

        Log::info('[PRTG] Finished', [
            'processed' => $summary['processed_count'],
            'matched' => $summary['matched'],
            'warnings' => $run->fresh()?->warning_count,
        ]);

        $prune = PrtgSensorQuery::pruneObsoleteScopeSensors(
            $root['probe'].' > '.$root['name']
        );
        $summary['pruned_obsolete_sensors'] = $prune['deleted_sensors'];
        $summary['closed_obsolete_incidents'] = $prune['closed_incidents'];
        if ($prune['deleted_sensors'] > 0) {
            Log::info('[PRTG] Pruned obsolete sensors from previous scope', $prune);
        }

        return $summary;
    }

    /**
     * Filtra dispositivos por ALLOWLIST (descendants del root) + CID.
     *
     * @param  array<int, array<string, mixed>>  $devices
     * @param  array<int, array<string, mixed>>  $sensors
     * @param  array<int, array<string, mixed>>  $groupIndex
     * @return array<string, mixed>
     */
    public function discoverScopedDevices(
        array $devices,
        array $sensors,
        int $allowedRootObjId,
        array $groupIndex,
        ?SyncRun $run
    ): array {
        $devicesById = [];
        $devicesByCid = [];
        $locationsByDevice = [];
        $excludedOutsideScope = 0;
        $ignoredNoCid = 0;
        $hierarchyWarnings = 0;
        $devicesInScope = 0;

        foreach ($devices as $device) {
            $objid = (string) ($device['objid'] ?? '');
            $name = (string) ($device['device'] ?? '');
            $parentId = (int) ($device['parentid'] ?? 0);

            if ($objid === '') {
                $ignoredNoCid++;

                continue;
            }

            $location = $this->prtg->resolveLocationFromHierarchy($parentId, $allowedRootObjId, $groupIndex);
            if (! $location['under_root']) {
                $excludedOutsideScope++;
                if ($run && $location['warning']) {
                    $hierarchyWarnings++;
                    $this->issue(
                        $run,
                        SyncIssueSeverity::Warning,
                        'PRTG_HIERARCHY_WARNING',
                        null,
                        null,
                        'Dispositivo fuera del root allowlist o jerarquía incompleta.',
                        [
                            'device' => $name,
                            'objid' => $objid,
                            'warning' => $location['warning'],
                        ]
                    );
                }

                continue;
            }

            $devicesInScope++;
            $cid = $this->prtg->extractCid($name);
            if ($cid === null) {
                $ignoredNoCid++;
                if ($run) {
                    $this->issue(
                        $run,
                        SyncIssueSeverity::Warning,
                        'PRTG_DEVICE_WITHOUT_CID',
                        null,
                        null,
                        'Objeto en scope sin CID válido; ignorado como colegio.',
                        ['device' => $name, 'objid' => $objid]
                    );
                }

                continue;
            }

            $devicesById[$objid] = $device;
            $devicesByCid[$cid][] = $device;
            $locationsByDevice[$objid] = $location;
        }

        $sensorsByDevice = [];
        $pingSensors = 0;
        foreach ($sensors as $sensor) {
            $parent = (string) ($sensor['parentid'] ?? '');
            if ($parent === '' || ! isset($devicesById[$parent])) {
                continue;
            }
            $sensorsByDevice[$parent][] = $sensor;
            $sensorName = (string) ($sensor['sensor'] ?? '');
            $sensorType = (string) ($sensor['type'] ?? '');
            if (strcasecmp($sensorName, 'Ping') === 0 || strcasecmp($sensorType, 'Ping') === 0) {
                $pingSensors++;
            }
        }

        $devicesWithoutPing = 0;
        foreach ($devicesById as $objid => $device) {
            $deviceSensors = $sensorsByDevice[$objid] ?? [];
            $hasPing = false;
            foreach ($deviceSensors as $sensor) {
                if (strcasecmp((string) ($sensor['sensor'] ?? ''), 'Ping') === 0
                    || strcasecmp((string) ($sensor['type'] ?? ''), 'Ping') === 0) {
                    $hasPing = true;
                    break;
                }
            }
            if (! $hasPing) {
                $devicesWithoutPing++;
            }
        }

        $duplicateCids = 0;
        foreach ($devicesByCid as $candidates) {
            if (count($candidates) > 1) {
                $duplicateCids++;
            }
        }

        return [
            'devices_by_id' => $devicesById,
            'devices_by_cid' => $devicesByCid,
            'locations_by_device' => $locationsByDevice,
            'sensors_by_device' => $sensorsByDevice,
            'devices_in_scope' => $devicesInScope,
            'devices_with_cid' => count($devicesById),
            'duplicate_cids' => $duplicateCids,
            'excluded_outside_scope' => $excludedOutsideScope,
            'ignored_no_cid' => $ignoredNoCid,
            'ping_sensors' => $pingSensors,
            'devices_without_ping' => $devicesWithoutPing,
            'hierarchy_warnings' => $hierarchyWarnings,
        ];
    }

    /**
     * Persiste provincia/distrito operativos desde la jerarquía PRTG en el assignment.
     * No modifica schools.provincia/distrito (fuente admin/Excel).
     *
     * @param  array{province: ?string, district: ?string}  $location
     */
    private function persistAssignmentPrtgLocation(NetworkAssignment $assignment, array $location): bool
    {
        $province = trim((string) ($location['province'] ?? ''));
        $district = trim((string) ($location['district'] ?? ''));

        $newProvince = $province !== '' ? $province : null;
        $newDistrict = $district !== '' ? $district : null;

        $payload = [];
        if (($assignment->prtg_province ?? null) !== $newProvince) {
            $payload['prtg_province'] = $newProvince;
        }
        if (($assignment->prtg_district ?? null) !== $newDistrict) {
            $payload['prtg_district'] = $newDistrict;
        }

        if ($payload === []) {
            return false;
        }

        $assignment->update($payload);

        return true;
    }

    /**
     * Compara ubicación admin (schools Excel) vs jerarquía PRTG viva.
     *
     * @param  array{province: ?string, district: ?string}  $location
     */
    private function locationMismatch(NetworkAssignment $assignment, array $location): bool
    {
        $school = $assignment->school;
        if ($school === null) {
            return false;
        }

        $schoolProv = $this->normalizePlaceName($school->provincia);
        $schoolDist = $this->normalizePlaceName($school->distrito);
        $prtgProv = $this->normalizePlaceName($location['province'] ?? null);
        $prtgDist = $this->normalizePlaceName($location['district'] ?? null);

        if ($prtgProv === '' && $prtgDist === '') {
            return false;
        }

        if ($prtgProv !== '' && $schoolProv !== '' && ! $this->placesMatch($schoolProv, $prtgProv)) {
            return true;
        }

        if ($prtgDist !== '' && $schoolDist !== '' && ! $this->placesMatch($schoolDist, $prtgDist)) {
            return true;
        }

        return false;
    }

    private function normalizePlaceName(?string $value): string
    {
        $value = mb_strtoupper(trim((string) $value));
        if ($value === '') {
            return '';
        }

        $value = str_replace(['_', '-'], ' ', $value);
        $value = preg_replace('/\s+/u', ' ', $value) ?? $value;

        if (class_exists(\Normalizer::class)) {
            $decomposed = \Normalizer::normalize($value, \Normalizer::FORM_D);
            if (is_string($decomposed)) {
                $value = preg_replace('/\p{Mn}/u', '', $decomposed) ?? $value;
            }
        } else {
            $value = strtr($value, [
                'Á' => 'A', 'É' => 'E', 'Í' => 'I', 'Ó' => 'O', 'Ú' => 'U', 'Ñ' => 'N',
                'Ü' => 'U',
            ]);
        }

        $aliases = [
            'GENARO HERRERA' => 'JENARO HERRERA',
            'JENARO HERRERA' => 'JENARO HERRERA',
            'MARISCAL RAMON CASTILLA' => 'MARISCAL RAMON CASTILLA',
            'RAMON CASTILLA' => 'RAMON CASTILLA',
        ];

        return $aliases[$value] ?? $value;
    }

    private function placesMatch(string $a, string $b): bool
    {
        if ($a === $b) {
            return true;
        }

        // Contención controlada (p.ej. "RAMON CASTILLA" ⊆ "MARISCAL RAMON CASTILLA")
        if (str_contains($a, $b) || str_contains($b, $a)) {
            $shorter = mb_strlen($a) <= mb_strlen($b) ? $a : $b;
            if (mb_strlen($shorter) >= 8) {
                return true;
            }
        }

        return false;
    }

    /**
     * @param  array<int, array<string, mixed>>  $candidates
     */
    private function resolveDevice(string $cid, array $candidates, ?NetworkAssignment $assignment, SyncRun $run): ?array
    {
        if (count($candidates) === 1) {
            return $candidates[0];
        }

        $uniqueNames = array_values(array_unique(array_map(
            static fn (array $c): string => (string) ($c['device'] ?? ''),
            $candidates
        )));
        if (count($uniqueNames) === 1) {
            usort($candidates, fn ($a, $b) => ((int) ($a['objid'] ?? 0)) <=> ((int) ($b['objid'] ?? 0)));

            return $candidates[0] ?? null;
        }

        if ($assignment?->prtg_device_name) {
            foreach ($candidates as $candidate) {
                if (($candidate['device'] ?? '') === $assignment->prtg_device_name) {
                    $this->issue($run, SyncIssueSeverity::Warning, 'DUPLICATE_PRTG_DEVICE', $cid, $assignment->school?->codigo_local, 'Duplicado resuelto por nombre PRTG exacto.', [
                        'candidates' => array_map(fn ($c) => $c['device'] ?? null, $candidates),
                    ]);

                    return $candidate;
                }
            }
        }

        if ($assignment?->school) {
            $codigo = $assignment->school->codigo_local;
            $modular = $assignment->school->codigo_modular;
            $scored = [];
            foreach ($candidates as $candidate) {
                $name = (string) ($candidate['device'] ?? '');
                $score = 0;
                if ($codigo && str_contains($name, $codigo)) {
                    $score += 2;
                }
                if ($modular && str_contains($name, $modular)) {
                    $score += 1;
                }
                $scored[] = [$score, $candidate];
            }
            usort($scored, fn ($a, $b) => $b[0] <=> $a[0]);
            if (($scored[0][0] ?? 0) > 0 && (($scored[1][0] ?? -1) < $scored[0][0])) {
                $this->issue($run, SyncIssueSeverity::Warning, 'DUPLICATE_PRTG_DEVICE', $cid, $codigo, 'Duplicado resuelto por código local/modular en nombre.', [
                    'selected' => $scored[0][1]['device'] ?? null,
                ]);

                return $scored[0][1];
            }
        }

        usort($candidates, fn ($a, $b) => ((int) ($a['objid'] ?? 0)) <=> ((int) ($b['objid'] ?? 0)));
        $this->issue($run, SyncIssueSeverity::Warning, 'DUPLICATE_PRTG_DEVICE', $cid, $assignment?->school?->codigo_local, 'Duplicado ambiguo; se eligió objid menor de forma determinista.', [
            'candidates' => array_map(fn ($c) => $c['device'] ?? null, $candidates),
        ]);

        return $candidates[0] ?? null;
    }

    /**
     * @param  array<int, array<string, mixed>>  $sensors
     * @return array<string, mixed>|null
     */
    private function resolvePingSensor(array $sensors, SyncRun $run, string $cid): ?array
    {
        $pings = array_values(array_filter(
            $sensors,
            fn ($s) => strcasecmp((string) ($s['sensor'] ?? ''), 'Ping') === 0
                || strcasecmp((string) ($s['type'] ?? ''), 'Ping') === 0
        ));
        if ($pings === []) {
            return null;
        }
        if (count($pings) > 1) {
            usort($pings, function ($a, $b) {
                $aPaused = in_array((int) ($a['status_raw'] ?? 0), [7, 8, 9, 11, 12], true) ? 1 : 0;
                $bPaused = in_array((int) ($b['status_raw'] ?? 0), [7, 8, 9, 11, 12], true) ? 1 : 0;
                if ($aPaused !== $bPaused) {
                    return $aPaused <=> $bPaused;
                }

                return ((float) ($b['lastcheck_raw'] ?? 0)) <=> ((float) ($a['lastcheck_raw'] ?? 0));
            });
            $this->issue($run, SyncIssueSeverity::Warning, 'DUPLICATE_PING_SENSOR', $cid, null, 'Varios sensores Ping; se eligió uno de forma determinista.', [
                'count' => count($pings),
            ]);
        }

        return $pings[0];
    }

    /**
     * @param  array<string, mixed>  $device
     * @param  array<string, mixed>  $sensorRow
     * @param  array{objid: int, name: string, probe: string}  $root
     * @param  array{province: ?string, district: ?string}  $location
     * @return array{created: int, updated: int}
     */
    private function upsertSensor(
        int $assignmentId,
        array $device,
        array $sensorRow,
        array $root,
        array $location
    ): array {
        $statusRaw = isset($sensorRow['status_raw']) ? (int) $sensorRow['status_raw'] : null;
        $normalized = MonitoringStatus::fromPrtgRaw($statusRaw);
        $payload = [
            'network_assignment_id' => $assignmentId,
            'prtg_device_id' => (string) ($device['objid'] ?? ($sensorRow['parentid'] ?? '')),
            'device_name' => $device['device'] ?? ($sensorRow['device'] ?? null),
            'name' => (string) ($sensorRow['sensor'] ?? ''),
            'type' => $sensorRow['type'] ?? null,
            'status_raw' => $statusRaw,
            'status_text' => strip_tags((string) ($sensorRow['status'] ?? '')),
            'normalized_status' => $normalized,
            'last_value' => $sensorRow['lastvalue'] ?? null,
            'unit' => null,
            'last_check' => now(),
            'down_since' => $sensorRow['downtimesince'] ?? null,
            'last_synced_at' => now(),
            'metadata' => [
                'message' => strip_tags((string) ($sensorRow['message'] ?? '')),
                'source_scope' => $root['probe'].' > '.$root['name'],
                'prtg_probe_name' => $root['probe'],
                'prtg_root_group' => $root['name'],
                'prtg_province_group' => $location['province'] ?? null,
                'prtg_district_group' => $location['district'] ?? null,
                'prtg_device_id' => (string) ($device['objid'] ?? ''),
                'prtg_device_name' => $device['device'] ?? null,
            ],
        ];

        $existing = PrtgSensor::query()->where('prtg_sensor_id', (string) $sensorRow['objid'])->first();
        if ($existing) {
            $existing->fill($payload)->save();

            return ['created' => 0, 'updated' => 1];
        }

        PrtgSensor::query()->create(array_merge($payload, [
            'prtg_sensor_id' => (string) $sensorRow['objid'],
        ]));

        return ['created' => 1, 'updated' => 0];
    }

    private function handleStatusTransition(
        NetworkAssignment $assignment,
        PrtgSensor $sensor,
        ?MonitoringStatus $previous
    ): void {
        $current = $sensor->normalized_status;

        if ($previous === null) {
            if ($current === MonitoringStatus::Caido) {
                $this->incidentService->ensureOpen($assignment, $sensor);
            }

            return;
        }

        if ($previous === $current) {
            if ($current === MonitoringStatus::Caido) {
                $this->incidentService->ensureOpen($assignment, $sensor);
            }

            return;
        }

        PrtgEvent::query()->create([
            'network_assignment_id' => $assignment->id,
            'prtg_sensor_id' => $sensor->id,
            'previous_status' => $previous->value,
            'new_status' => $current?->value,
            'occurred_at' => now(),
            'payload' => [
                'status_raw' => $sensor->status_raw,
                'device' => $sensor->device_name,
                'source_scope' => $sensor->metadata['source_scope'] ?? null,
            ],
            'created_at' => now(),
        ]);

        if ($sensor->name === 'Ping' || strcasecmp((string) $sensor->name, 'Ping') === 0) {
            $this->incidentService->applyPingTransition($assignment, $sensor, $previous, $current);
        }
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    private function issue(
        SyncRun $run,
        SyncIssueSeverity $severity,
        string $code,
        ?string $cid,
        ?string $codigoLocal,
        string $message,
        array $payload
    ): void {
        if ($severity === SyncIssueSeverity::Warning) {
            $run->increment('warning_count');
        }
        if ($severity === SyncIssueSeverity::Error) {
            $run->increment('error_count');
        }

        SyncIssue::query()->create([
            'sync_run_id' => $run->id,
            'severity' => $severity,
            'code' => $code,
            'source_row' => null,
            'cid' => $cid,
            'codigo_local' => $codigoLocal,
            'message' => $message,
            'payload' => $payload,
            'created_at' => now(),
        ]);
    }
}
