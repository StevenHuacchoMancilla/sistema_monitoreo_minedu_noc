<?php

namespace App\Domain\Monitoring\Cloudnet\Services;

use App\Enums\CidStatus;
use App\Enums\SyncIssueSeverity;
use App\Enums\SyncRunStatus;
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

        $summary['devices_synced'] = $this->syncDevicesForDownSites();

        return $summary;
    }

    private function syncDevicesForDownSites(): int
    {
        $sites = CloudnetSite::query()
            ->whereNotNull('school_id')
            ->whereIn('school_id', \App\Models\Incident::query()->active()->select('school_id'))
            ->limit(40)
            ->get();

        $saved = 0;
        $available = null;
        foreach ($sites as $site) {
            $devices = $this->cloudnet->fetchShopDevices((string) $site->shop_id);
            if ($devices === null) {
                if ($available === null) {
                    return 0;
                }
                continue;
            }
            $available = true;
            CloudnetDevice::query()->where('cloudnet_site_id', $site->id)->delete();
            foreach ($devices as $device) {
                if (! is_array($device)) {
                    continue;
                }
                $status = (string) ($device['status'] ?? $device['onlineStatus'] ?? $device['devStatus'] ?? '');
                CloudnetDevice::query()->create([
                    'cloudnet_site_id' => $site->id,
                    'serial' => $device['serialNumber'] ?? $device['sn'] ?? $device['devSN'] ?? null,
                    'model' => $device['model'] ?? $device['devModel'] ?? null,
                    'status' => $status !== '' ? $status : null,
                    'ip' => $device['ip'] ?? $device['manageIp'] ?? null,
                    'mac' => $device['mac'] ?? $device['macAddr'] ?? null,
                    'last_synced_at' => now(),
                    'metadata' => $device,
                ]);
                $saved++;
            }
        }

        return $saved;
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
