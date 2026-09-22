<?php

namespace App\Domain\Monitoring\Cloudnet\Services;

use App\Enums\CidStatus;
use App\Enums\SyncIssueSeverity;
use App\Enums\SyncRunStatus;
use App\Models\CloudnetAp;
use App\Models\CloudnetDevice;
use App\Models\CloudnetSite;
use App\Models\NetworkAssignment;
use App\Models\SyncIssue;
use App\Models\SyncRun;
use Illuminate\Support\Facades\Log;
use Throwable;

class CloudnetSyncService
{
    public function __construct(
        private readonly CloudnetService $cloudnet,
    ) {}

    /**
     * @return array<string, mixed>
     */
    public function sync(): array
    {
        $run = SyncRun::query()->create([
            'source' => 'CLOUDNET',
            'started_at' => now(),
            'status' => SyncRunStatus::Success,
        ]);

        SyncRun::query()
            ->where('source', 'CLOUDNET')
            ->whereNull('finished_at')
            ->where('id', '!=', $run->id)
            ->update([
                'status' => SyncRunStatus::Failed,
                'finished_at' => now(),
                'metadata' => ['error' => 'sync_interrupted'],
            ]);

        try {
            $summary = $this->runSync($run);
        } catch (Throwable $exception) {
            Log::error('Cloudnet sync failed', ['message' => $exception->getMessage()]);
            $run->update([
                'status' => SyncRunStatus::Failed,
                'finished_at' => now(),
                'error_count' => $run->error_count + 1,
                'metadata' => ['error' => $exception->getMessage()],
            ]);
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
        $sites = $this->cloudnet->fetchSites();
        $summary = [
            'received_count' => count($sites),
            'processed_count' => 0,
            'created_count' => 0,
            'updated_count' => 0,
            'ignored_count' => 0,
            'matched' => 0,
            'pending' => 0,
        ];

        $assignments = NetworkAssignment::query()
            ->with('school')
            ->where('is_active', true)
            ->where('cid_status', CidStatus::Valid)
            ->get();

        foreach ($sites as $site) {
            try {
                $shopId = (string) ($site['shopId'] ?? '');
                $siteName = (string) ($site['shopName'] ?? '');
                if ($shopId === '') {
                    $summary['ignored_count']++;

                    continue;
                }

                [$cid, $codigoLocal] = $this->parseSiteName($siteName);
                $assignment = null;
                $matchStatus = 'PENDING';

                if ($cid !== null) {
                    $candidates = $assignments->where('cid', $cid)->values();
                    if ($codigoLocal !== null) {
                        $byLocal = $candidates->filter(
                            fn (NetworkAssignment $a) => $a->school?->codigo_local === $codigoLocal
                        )->values();
                        if ($byLocal->count() === 1) {
                            $assignment = $byLocal->first();
                            $matchStatus = 'MATCHED_CID_LOCAL';
                        }
                    }
                    if ($assignment === null && $candidates->count() === 1) {
                        $assignment = $candidates->first();
                        $matchStatus = 'MATCHED_CID';
                    }
                }

                $payload = [
                    'site_name' => $siteName,
                    'cid_detected' => $cid,
                    'codigo_local_detected' => $codigoLocal,
                    'network_assignment_id' => $assignment?->id,
                    'school_id' => $assignment?->school_id,
                    'address' => $site['address'] ?? null,
                    'match_status' => $matchStatus,
                    'last_synced_at' => now(),
                    'metadata' => [
                        'userName' => $site['userName'] ?? null,
                        'scenarioName' => $site['scenarioName'] ?? null,
                        'province' => $site['province'] ?? null,
                        'city' => $site['city'] ?? null,
                        'area' => $site['area'] ?? null,
                        'phone' => $site['phone'] ?? null,
                    ],
                ];

                $existing = CloudnetSite::query()->where('shop_id', $shopId)->first();
                if ($existing) {
                    $existing->fill($payload)->save();
                    $summary['updated_count']++;
                } else {
                    CloudnetSite::query()->create(array_merge($payload, ['shop_id' => $shopId]));
                    $summary['created_count']++;
                }

                if ($assignment) {
                    $summary['matched']++;
                } else {
                    $summary['pending']++;
                }
                $summary['processed_count']++;
            } catch (Throwable $exception) {
                $run->increment('error_count');
                SyncIssue::query()->create([
                    'sync_run_id' => $run->id,
                    'severity' => SyncIssueSeverity::Error,
                    'code' => 'CLOUDNET_SITE_FAILED',
                    'cid' => null,
                    'codigo_local' => null,
                    'message' => $exception->getMessage(),
                    'payload' => ['shopId' => $site['shopId'] ?? null],
                    'created_at' => now(),
                ]);
            }
        }

        $inventory = $this->syncInventoryForSites($run);
        $summary['devices_synced'] = $inventory['devices'];
        $summary['aps_synced'] = $inventory['aps'];
        $summary['inventory_sites'] = $inventory['sites'];
        $summary['inventory_error'] = $inventory['error'];

        return $summary;
    }

    /**
     * Sincroniza devices + APs por site (prioriza linked + menos recientes).
     *
     * @return array{devices: int, aps: int, sites: int, error: ?string}
     */
    private function syncInventoryForSites(SyncRun $run): array
    {
        $limit = (int) config('cloudnet.inventory_sync_limit', 120);
        $sites = CloudnetSite::query()
            ->whereNotNull('shop_id')
            ->orderByRaw('CASE WHEN network_assignment_id IS NULL THEN 1 ELSE 0 END')
            ->orderBy('last_synced_at')
            ->limit(max(20, $limit))
            ->get();

        $savedDevices = 0;
        $savedAps = 0;
        $sitesTouched = 0;
        $apiError = null;
        $apiOk = false;

        foreach ($sites as $site) {
            $inventory = $this->cloudnet->fetchShopInventory((string) $site->shop_id);
            if ($inventory === null) {
                continue;
            }

            if (($inventory['error'] ?? null) && $inventory['devices'] === [] && $inventory['aps'] === []) {
                $apiError = $inventory['error'];
                break;
            }

            $apiOk = true;
            $sitesTouched++;

            CloudnetDevice::query()->where('cloudnet_site_id', $site->id)->delete();
            CloudnetAp::query()->where('cloudnet_site_id', $site->id)->delete();

            $deviceIdBySerial = [];
            foreach ($inventory['devices'] as $device) {
                if (! is_array($device)) {
                    continue;
                }
                $serial = $this->pickString($device, ['serialNumber', 'sn', 'devSN', 'serial']);
                $model = $this->pickString($device, ['model', 'devModel', 'deviceModel']);
                $status = $this->pickString($device, ['status', 'onlineStatus', 'devStatus', 'deviceStatus']);
                $row = CloudnetDevice::query()->create([
                    'cloudnet_site_id' => $site->id,
                    'serial' => $serial,
                    'model' => $model,
                    'status' => $status !== '' ? $status : null,
                    'ip' => $this->pickString($device, ['ip', 'manageIp', 'mgmtIp', 'devIp']),
                    'mac' => $this->pickString($device, ['mac', 'macAddr', 'devMac']),
                    'online_time' => null,
                    'last_synced_at' => now(),
                    'metadata' => $device,
                ]);
                if ($serial) {
                    $deviceIdBySerial[$serial] = $row->id;
                }
                $savedDevices++;
            }

            foreach ($inventory['aps'] as $ap) {
                if (! is_array($ap)) {
                    continue;
                }
                $serial = $this->pickString($ap, ['serialNumber', 'sn', 'devSN', 'serial', 'apSN']);
                CloudnetAp::query()->create([
                    'cloudnet_site_id' => $site->id,
                    'cloudnet_device_id' => $serial && isset($deviceIdBySerial[$serial]) ? $deviceIdBySerial[$serial] : null,
                    'serial' => $serial,
                    'model' => $this->pickString($ap, ['model', 'devModel', 'apModel']),
                    'status' => $this->pickString($ap, ['status', 'onlineStatus', 'devStatus', 'apStatus']) ?: null,
                    'mac' => $this->pickString($ap, ['mac', 'macAddr', 'apMac']),
                    'ip' => $this->pickString($ap, ['ip', 'manageIp', 'apIp']),
                    'clients' => (int) ($ap['clients'] ?? $ap['clientCount'] ?? $ap['staCount'] ?? 0),
                    'last_synced_at' => now(),
                    'metadata' => $ap,
                ]);
                $savedAps++;
            }

            $site->forceFill(['last_synced_at' => now()])->save();
        }

        if ($apiError && ! $apiOk) {
            $run->increment('warning_count');
            SyncIssue::query()->create([
                'sync_run_id' => $run->id,
                'severity' => SyncIssueSeverity::Warning,
                'code' => 'CLOUDNET_DEVICE_API_UNAVAILABLE',
                'cid' => null,
                'codigo_local' => null,
                'message' => 'API Cloudnet de equipos no disponible o sin permiso para esta apikey. Sites sí sincronizan; devices/APs quedan pendientes.',
                'payload' => ['error' => $apiError],
                'created_at' => now(),
            ]);
        }

        return [
            'devices' => $savedDevices,
            'aps' => $savedAps,
            'sites' => $sitesTouched,
            'error' => $apiOk ? null : $apiError,
        ];
    }

    /**
     * @param  array<string, mixed>  $row
     * @param  array<int, string>  $keys
     */
    private function pickString(array $row, array $keys): ?string
    {
        foreach ($keys as $key) {
            if (! array_key_exists($key, $row) || $row[$key] === null || $row[$key] === '') {
                continue;
            }

            return (string) $row[$key];
        }

        return null;
    }

    /**
     * @return array{0: ?string, 1: ?string}
     */
    private function parseSiteName(string $siteName): array
    {
        if (preg_match('/^CID(\d+)_(\d+)/', $siteName, $matches) === 1) {
            return [$matches[1], $matches[2]];
        }
        if (preg_match('/^CID(\d+)/', $siteName, $matches) === 1) {
            return [$matches[1], null];
        }

        return [null, null];
    }
}
