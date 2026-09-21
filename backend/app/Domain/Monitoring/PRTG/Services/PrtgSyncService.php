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
            $this->issue($run, SyncIssueSeverity::Error, 'PRTG_SYNC_FAILED', null, null, $exception->getMessage(), []);

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
     * @return array<string, mixed>
     */
    private function runSync(SyncRun $run): array
    {
        $summary = [
            'received_count' => 0,
            'processed_count' => 0,
            'created_count' => 0,
            'updated_count' => 0,
            'ignored_count' => 0,
            'matched' => 0,
            'unmatched' => 0,
            'downs' => 0,
            'operativos' => 0,
            'excluded_local_probe' => 0,
        ];

        try {
            $loretoId = $this->prtg->findLoretoGroupId();
        } catch (Throwable $exception) {
            $this->issue(
                $run,
                SyncIssueSeverity::Error,
                'PRTG_ROOT_GROUP_NOT_FOUND',
                null,
                null,
                $exception->getMessage(),
                []
            );

            throw $exception;
        }

        $devices = $this->prtg->fetchTable('devices', [
            'id' => $loretoId,
            'columns' => 'objid,device,host,group,probe,parentid,status',
            'count' => 5000,
        ]);
        $sensors = $this->prtg->fetchTable('sensors', [
            'id' => $loretoId,
            'columns' => 'objid,sensor,device,status,lastvalue,lastcheck,downtimesince,type,parentid',
            'count' => 5000,
        ]);

        $summary['received_count'] = count($devices);
        $summary['excluded_local_probe'] = 0;

        $devicesById = [];
        $devicesByCid = [];
        foreach ($devices as $device) {
            $probe = (string) ($device['probe'] ?? '');
            if ($probe === (string) config('prtg.allowed_probe') || $probe === '') {
                // keep
            }
            if (stripos($probe, 'Sonda local') !== false) {
                $summary['excluded_local_probe']++;

                continue;
            }

            $objid = (string) ($device['objid'] ?? '');
            $name = (string) ($device['device'] ?? '');
            $cid = $this->prtg->extractCid($name);
            if ($objid === '' || $cid === null) {
                $summary['ignored_count']++;

                continue;
            }
            $devicesById[$objid] = $device;
            $devicesByCid[$cid][] = $device;
        }

        $assignments = NetworkAssignment::query()
            ->with('school')
            ->where('is_active', true)
            ->where('cid_status', CidStatus::Valid)
            ->where('monitoring_eligible', true)
            ->get()
            ->keyBy('cid');

        $sensorsByDevice = [];
        foreach ($sensors as $sensor) {
            $parent = (string) ($sensor['parentid'] ?? '');
            if ($parent === '') {
                continue;
            }
            $sensorsByDevice[$parent][] = $sensor;
        }

        foreach ($devicesByCid as $cid => $candidates) {
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
                $deviceSensors = $sensorsByDevice[(string) $device['objid']] ?? [];
                $ping = $this->resolvePingSensor($deviceSensors, $run, $cid);

                $previousBySensor = [];
                foreach ($deviceSensors as $sensorRow) {
                    $sensorId = (string) ($sensorRow['objid'] ?? '');
                    if ($sensorId !== '') {
                        $existing = PrtgSensor::query()->where('prtg_sensor_id', $sensorId)->first();
                        $previousBySensor[$sensorId] = $existing?->normalized_status;
                    }
                    $result = $this->upsertSensor($assignment->id, $device, $sensorRow);
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

        return $summary;
    }

    /**
     * @param  array<int, array<string, mixed>>  $candidates
     */
    private function resolveDevice(string $cid, array $candidates, ?NetworkAssignment $assignment, SyncRun $run): ?array
    {
        if (count($candidates) === 1) {
            return $candidates[0];
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
        $pings = array_values(array_filter($sensors, fn ($s) => ($s['sensor'] ?? '') === 'Ping'));
        if ($pings === []) {
            $pings = array_values(array_filter($sensors, fn ($s) => strcasecmp((string) ($s['type'] ?? ''), 'Ping') === 0));
        }
        if ($pings === []) {
            return null;
        }
        if (count($pings) > 1) {
            usort($pings, function ($a, $b) {
                $aDown = in_array((int) ($a['status_raw'] ?? 0), [7, 8, 9, 11, 12], true) ? 1 : 0;
                $bDown = in_array((int) ($b['status_raw'] ?? 0), [7, 8, 9, 11, 12], true) ? 1 : 0;
                if ($aDown !== $bDown) {
                    return $aDown <=> $bDown;
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
     * @return array{created: int, updated: int}
     */
    private function upsertSensor(int $assignmentId, array $device, array $sensorRow): array
    {
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
            ],
            'created_at' => now(),
        ]);

        if ($sensor->name === 'Ping') {
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
