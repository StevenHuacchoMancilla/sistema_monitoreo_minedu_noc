<?php

namespace App\Domain\Dashboard\Services;

use App\Enums\MonitoringStatus;
use App\Domain\Monitoring\Support\SyncCoordinator;
use App\Models\CloudnetAp;
use App\Models\CloudnetDevice;
use App\Models\CloudnetSite;
use App\Models\Incident;
use App\Models\School;
use Illuminate\Support\Facades\DB;
use Throwable;

class CloudnetDashboardService
{
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

        $sync = $this->lastSyncRun('CLOUDNET');
        $totalSchools = School::query()->where('active', true)->count();

        $sites = CloudnetSite::query()->count();
        $linked = CloudnetSite::query()->whereNotNull('network_assignment_id')->count();
        $unlinked = CloudnetSite::query()->whereNull('network_assignment_id')->count();
        $withCid = CloudnetSite::query()->whereNotNull('cid_detected')->where('cid_detected', '!=', '')->count();
        $withCodigo = CloudnetSite::query()->whereNotNull('codigo_local_detected')->where('codigo_local_detected', '!=', '')->count();

        $deviceCount = CloudnetDevice::query()->count();
        $devicesOnline = 0;
        $devicesOffline = 0;
        $devicesUnknown = 0;
        if ($deviceCount > 0) {
            $devicesOnline = CloudnetDevice::query()
                ->where(function ($q) {
                    $q->whereRaw('LOWER(COALESCE(status, \'\')) in (?, ?, ?)', ['online', 'up', 'connected']);
                })
                ->count();
            $devicesOffline = CloudnetDevice::query()
                ->where(function ($q) {
                    $q->whereRaw('LOWER(COALESCE(status, \'\')) in (?, ?, ?, ?)', ['offline', 'down', 'disconnected', 'unreachable']);
                })
                ->count();
            $devicesUnknown = max(0, $deviceCount - $devicesOnline - $devicesOffline);
        }

        $apsTotal = CloudnetAp::query()->count();
        $apsOnline = 0;
        $apsOffline = 0;
        $apsUnknown = 0;
        $clientsTotal = 0;
        if ($apsTotal > 0) {
            $apsOnline = CloudnetAp::query()
                ->where(function ($q) {
                    $q->whereRaw('LOWER(COALESCE(status, \'\')) in (?, ?, ?)', ['online', 'up', 'connected']);
                })
                ->count();
            $apsOffline = CloudnetAp::query()
                ->where(function ($q) {
                    $q->whereRaw('LOWER(COALESCE(status, \'\')) in (?, ?, ?, ?)', ['offline', 'down', 'disconnected', 'unreachable']);
                })
                ->count();
            $apsUnknown = max(0, $apsTotal - $apsOnline - $apsOffline);
            $clientsTotal = (int) CloudnetAp::query()->sum('clients');
        }

        $sitesWithDevice = (int) CloudnetDevice::query()->distinct('cloudnet_site_id')->count('cloudnet_site_id');
        $sitesWithAp = $apsTotal > 0
            ? (int) CloudnetAp::query()->distinct('cloudnet_site_id')->count('cloudnet_site_id')
            : 0;
        $sitesWithoutDevice = max(0, $sites - $sitesWithDevice);
        $sitesWithoutAp = max(0, $sites - $sitesWithAp);

        $sitesWithClients = $apsTotal > 0
            ? (int) CloudnetAp::query()->where('clients', '>', 0)->distinct('cloudnet_site_id')->count('cloudnet_site_id')
            : 0;
        $sitesWithoutClients = max(0, $sites - $sitesWithClients);
        $avgClients = $sitesWithClients > 0 ? round($clientsTotal / $sitesWithClients, 1) : 0.0;

        $topSitesByClients = [];
        if ($apsTotal > 0) {
            $topSitesByClients = CloudnetAp::query()
                ->select('cloudnet_site_id', DB::raw('COALESCE(SUM(clients), 0) as total_clients'))
                ->groupBy('cloudnet_site_id')
                ->orderByDesc('total_clients')
                ->limit(5)
                ->get()
                ->map(function ($row) {
                    $site = CloudnetSite::query()->find($row->cloudnet_site_id);

                    return [
                        'shop_id' => $site?->shop_id,
                        'site_name' => $site?->site_name,
                        'cid_detected' => $site?->cid_detected,
                        'clients' => (int) $row->total_clients,
                    ];
                })
                ->filter(fn (array $item) => $item['clients'] > 0)
                ->values()
                ->all();
        }

        $schoolsWithoutSite = max(0, $totalSchools - CloudnetSite::query()->whereNotNull('school_id')->distinct('school_id')->count('school_id'));

        $deviceBase = max(1, $deviceCount);
        $availabilityPct = $deviceCount > 0 ? round(($devicesOnline / $deviceBase) * 100, 1) : null;

        return [
            'health' => [
                'api' => true,
                'database' => $dbOnline,
                'cloudnet' => $sync !== null && ($sync['error_count'] ?? 0) === 0,
                'driver' => $driver,
                'name' => config('database.connections.'.$driver.'.database'),
            ],
            'sync' => $sync,
            'kpis' => [
                'sites' => $sites,
                'linked_sites' => $linked,
                'unlinked_sites' => $unlinked,
                'devices_total' => $deviceCount,
                'devices_online' => $devicesOnline,
                'devices_offline' => $devicesOffline,
                'aps_total' => $apsTotal,
                'aps_online' => $apsOnline,
                'aps_offline' => $apsOffline,
                'online_clients' => $clientsTotal,
                'sites_without_device' => $sitesWithoutDevice,
                'sites_without_ap' => $sitesWithoutAp,
            ],
            'coverage' => [
                'total_schools' => $totalSchools,
                'sites' => $sites,
                'linked_sites' => $linked,
                'unlinked_sites' => $unlinked,
                'schools_without_site' => $schoolsWithoutSite,
                'sites_with_cid' => $withCid,
                'sites_with_codigo_local' => $withCodigo,
            ],
            'device_status' => [
                'online' => $devicesOnline,
                'offline' => $devicesOffline,
                'unknown' => $devicesUnknown,
                'total' => $deviceCount,
                'availability_pct' => $availabilityPct,
            ],
            'ap_status' => [
                'online' => $apsOnline,
                'offline' => $apsOffline,
                'unknown' => $apsUnknown,
                'total' => $apsTotal,
                'sites_without_ap' => $sitesWithoutAp,
            ],
            'clients' => [
                'online' => $clientsTotal,
                'sites_with_clients' => $sitesWithClients,
                'sites_without_clients' => $sitesWithoutClients,
                'avg_per_site' => $avgClients,
                'top_sites' => $topSitesByClients,
                'data_available' => $apsTotal > 0,
            ],
            'correlation' => $this->prtgCorrelation(),
            'inventory' => $this->inventoryByCid(),
            'charts' => $this->buildCharts($devicesOnline, $devicesOffline, $devicesUnknown, $apsOnline, $apsOffline, $clientsTotal),
            'links' => [
                'unlinked' => '/admin',
                'diagnostics' => '/admin',
            ],
        ];
    }

    /**
     * Inventario operacional por CID: site + devices + APs.
     *
     * @return array<string, mixed>
     */
    private function inventoryByCid(): array
    {
        $sites = CloudnetSite::query()
            ->with(['devices', 'aps', 'school'])
            ->whereNotNull('cid_detected')
            ->orderBy('cid_detected')
            ->limit(500)
            ->get();

        $rows = [];
        $withDevices = 0;
        $withAps = 0;
        $offlineDevices = 0;

        foreach ($sites as $site) {
            $devices = $site->devices->map(fn (CloudnetDevice $d) => [
                'serial' => $d->serial,
                'model' => $d->model,
                'status' => $d->status,
                'ip' => $d->ip,
                'mac' => $d->mac,
            ])->values()->all();

            $aps = $site->aps->map(fn (CloudnetAp $a) => [
                'serial' => $a->serial,
                'model' => $a->model,
                'status' => $a->status,
                'ip' => $a->ip,
                'mac' => $a->mac,
                'clients' => (int) $a->clients,
            ])->values()->all();

            if ($devices !== []) {
                $withDevices++;
            }
            if ($aps !== []) {
                $withAps++;
            }
            foreach ($devices as $device) {
                $st = strtolower((string) ($device['status'] ?? ''));
                if (in_array($st, ['offline', 'down', 'disconnected', 'unreachable'], true)) {
                    $offlineDevices++;
                }
            }

            $rows[] = [
                'cid' => $site->cid_detected,
                'codigo_local' => $site->codigo_local_detected,
                'shop_id' => $site->shop_id,
                'site_name' => $site->site_name,
                'address' => $site->address,
                'school' => $site->school?->local_educativo,
                'provincia' => $site->school?->provincia,
                'distrito' => $site->school?->distrito,
                'match_status' => $site->match_status,
                'devices_total' => count($devices),
                'aps_total' => count($aps),
                'clients' => array_sum(array_map(fn ($a) => (int) $a['clients'], $aps)),
                'devices' => $devices,
                'aps' => $aps,
            ];
        }

        usort($rows, function (array $a, array $b) {
            $scoreA = ($a['devices_total'] === 0 ? 2 : 0) + ($a['aps_total'] === 0 ? 1 : 0);
            $scoreB = ($b['devices_total'] === 0 ? 2 : 0) + ($b['aps_total'] === 0 ? 1 : 0);
            if ($scoreA !== $scoreB) {
                return $scoreB <=> $scoreA;
            }

            return strcmp((string) $a['cid'], (string) $b['cid']);
        });

        return [
            'total_sites_with_cid' => count($rows),
            'sites_with_devices' => $withDevices,
            'sites_with_aps' => $withAps,
            'offline_devices' => $offlineDevices,
            'rows' => array_slice($rows, 0, 80),
            'note' => $withDevices === 0
                ? 'Sites OK por CID (mismo árbol que el portal). La apikey Open API no tiene permiso de equipos: /device/operation → No permission; /shop/device no entrega seriales. El login web no habilita esos scopes.'
                : 'Inventario Cloudnet enlazado por CID (equipos, series y APs).',
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function buildCharts(
        int $devicesOnline,
        int $devicesOffline,
        int $devicesUnknown,
        int $apsOnline,
        int $apsOffline,
        int $clientsTotal
    ): array {
        return [
            'devices' => [
                ['key' => 'online', 'label' => 'Online', 'value' => $devicesOnline, 'color' => '#0e7490'],
                ['key' => 'offline', 'label' => 'Offline', 'value' => $devicesOffline, 'color' => '#b91c1c'],
                ['key' => 'unknown', 'label' => 'Sin dato', 'value' => $devicesUnknown, 'color' => '#94a3b8'],
            ],
            'aps' => [
                ['key' => 'online', 'label' => 'AP online', 'value' => $apsOnline, 'color' => '#0e7490'],
                ['key' => 'offline', 'label' => 'AP offline', 'value' => $apsOffline, 'color' => '#b91c1c'],
            ],
            'clients_total' => $clientsTotal,
        ];
    }

    /**
     * Comparación de evidencias PRTG vs Cloudnet (no determina causa).
     *
     * @return array<string, mixed>
     */
    private function prtgCorrelation(): array
    {
        $downIncidents = Incident::query()
            ->active()
            ->whereHas('sensor', fn ($s) => $s->where('normalized_status', MonitoringStatus::Caido))
            ->with(['networkAssignment', 'school'])
            ->get();

        $prtgDownCloudnetOffline = 0;
        $prtgDownCloudnetOnline = 0;
        $prtgUpCloudnetOffline = 0;

        foreach ($downIncidents as $incident) {
            $site = null;
            if ($incident->network_assignment_id) {
                $site = CloudnetSite::query()->where('network_assignment_id', $incident->network_assignment_id)->first();
            }
            if ($site === null && $incident->school_id) {
                $site = CloudnetSite::query()->where('school_id', $incident->school_id)->first();
            }
            if ($site === null) {
                continue;
            }

            $devices = CloudnetDevice::query()->where('cloudnet_site_id', $site->id)->get();
            if ($devices->isEmpty()) {
                continue;
            }

            $anyOnline = $devices->contains(function (CloudnetDevice $device) {
                $status = strtolower((string) $device->status);

                return in_array($status, ['online', 'up', 'connected'], true);
            });

            if ($anyOnline) {
                $prtgDownCloudnetOnline++;
            } else {
                $prtgDownCloudnetOffline++;
            }
        }

        // Evidencia inversa: assignments operativos con devices offline (muestra limitada).
        $offlineDevices = CloudnetDevice::query()
            ->where(function ($q) {
                $q->whereRaw('LOWER(COALESCE(status, \'\')) in (?, ?, ?, ?)', ['offline', 'down', 'disconnected', 'unreachable']);
            })
            ->with('site')
            ->limit(200)
            ->get();

        foreach ($offlineDevices as $device) {
            $assignmentId = $device->site?->network_assignment_id;
            if (! $assignmentId) {
                continue;
            }
            $ping = \App\Models\PrtgSensor::query()
                ->where('network_assignment_id', $assignmentId)
                ->where('name', 'Ping')
                ->where('normalized_status', MonitoringStatus::Operativo)
                ->exists();
            if ($ping) {
                $prtgUpCloudnetOffline++;
            }
        }

        return [
            'prtg_down_cloudnet_offline' => $prtgDownCloudnetOffline,
            'prtg_down_cloudnet_online' => $prtgDownCloudnetOnline,
            'prtg_operational_cloudnet_offline' => $prtgUpCloudnetOffline,
            'note' => 'Comparación de evidencias de ambas plataformas. No determina causa automática.',
        ];
    }

    /**
     * @return array<string, mixed>|null
     */
    private function lastSyncRun(string $source): ?array
    {
        return SyncCoordinator::lastFinishedRun($source);
    }
}
