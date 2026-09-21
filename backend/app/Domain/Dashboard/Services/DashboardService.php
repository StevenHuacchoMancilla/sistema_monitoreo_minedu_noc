<?php

namespace App\Domain\Dashboard\Services;

use App\Enums\CidStatus;
use App\Enums\ContactMatchStatus;
use App\Enums\FollowupStatus;
use App\Enums\MonitoringStatus;
use App\Models\CloudnetDevice;
use App\Models\CloudnetSite;
use App\Models\Incident;
use App\Models\NetworkAssignment;
use App\Models\PrtgSensor;
use App\Models\School;
use App\Models\SchoolContact;
use App\Models\SyncRun;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Throwable;

class DashboardService
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
        $connection = config('database.connections.'.$driver, []);

        app(\App\Domain\Incidents\Services\IncidentService::class)->closeOperativeIncidents();

        $totalSchools = School::query()->where('active', true)->count();
        $validCid = NetworkAssignment::query()->where('is_active', true)->where('cid_status', CidStatus::Valid)->count();
        $withoutCid = NetworkAssignment::query()->where('is_active', true)->whereIn('cid_status', [
            CidStatus::Empty->value,
            CidStatus::Invalid->value,
            CidStatus::BajaImpe->value,
        ])->count();

        $pingStatuses = PrtgSensor::query()
            ->where('name', 'Ping')
            ->select('normalized_status', DB::raw('count(*) as total'))
            ->groupBy('normalized_status')
            ->pluck('total', 'normalized_status');

        $activeIncidents = Incident::query()->active()->count();
        $pendingContact = Incident::query()->active()->where('followup_status', FollowupStatus::PendienteContacto)->count();
        $enGestion = Incident::query()->active()->whereIn('followup_status', FollowupStatus::managingValues())->count();
        $recoveredToday = Incident::query()
            ->whereNotNull('recovered_at')
            ->whereDate('recovered_at', today())
            ->count();
        $recoveredTotal = Incident::query()->whereNotNull('recovered_at')->count();
        $eligible = NetworkAssignment::query()->where('is_active', true)->where('monitoring_eligible', true)->count();
        $withPing = PrtgSensor::query()->where('name', 'Ping')->whereNotNull('network_assignment_id')->distinct('network_assignment_id')->count('network_assignment_id');

        $cloudnetSites = CloudnetSite::query()->count();
        $deviceCount = CloudnetDevice::query()->count();
        $onlineDevices = 0;
        $offlineDevices = 0;
        if ($deviceCount > 0) {
            $onlineDevices = CloudnetDevice::query()
                ->where(function ($q) {
                    $q->whereRaw('LOWER(status) in (?, ?, ?)', ['online', 'up', 'connected']);
                })
                ->count();
            $offlineDevices = max(0, $deviceCount - $onlineDevices);
        }

        $sitesSinAsociacion = CloudnetSite::query()->whereNull('network_assignment_id')->count();
        $matchedSites = CloudnetSite::query()->whereNotNull('network_assignment_id')->count();
        $pendingSites = CloudnetSite::query()->whereNull('network_assignment_id')->count();
        $lastCloudnetSync = CloudnetSite::query()->max('last_synced_at');

        $allConcentrations = $this->concentrations();
        $concentrationCount = count($allConcentrations);
        $concentrations = array_slice($allConcentrations, 0, 8);

        $allActive = $this->activeOutages();
        $activePreview = $allActive->take(8)->values()->all();

        $cloudnetPreview = CloudnetSite::query()
            ->orderByDesc('last_synced_at')
            ->limit(6)
            ->get(['id', 'shop_id', 'site_name', 'address', 'match_status', 'school_id'])
            ->map(fn (CloudnetSite $site) => [
                'shop_id' => $site->shop_id,
                'site_name' => $site->site_name,
                'address' => $site->address,
                'match_status' => $site->match_status,
                'school_id' => $site->school_id,
            ])
            ->values()
            ->all();

        return [
            'health' => [
                'api' => 'online',
                'database' => $dbOnline ? 'online' : 'offline',
                'driver' => $driver,
                'name' => $connection['database'] ?? null,
            ],
            'kpis' => [
                'total_locales' => $totalSchools,
                'con_cid_valido' => $validCid,
                'sin_cid' => $withoutCid,
                'operativos' => (int) ($pingStatuses[MonitoringStatus::Operativo->value] ?? 0),
                'caidos' => (int) ($pingStatuses[MonitoringStatus::Caido->value] ?? 0),
                'parciales' => (int) ($pingStatuses[MonitoringStatus::Parcial->value] ?? 0),
                'pausados' => (int) ($pingStatuses[MonitoringStatus::Pausado->value] ?? 0),
                'sin_datos_prtg' => max(0, $eligible - $withPing),
                'incidencias_activas' => $allActive->count(),
                'pendientes_contacto' => $allActive->where('followup_status', FollowupStatus::PendienteContacto->value)->count(),
                'en_gestion' => $enGestion,
                'recuperados_hoy' => $recoveredToday,
                'recuperados_total' => $recoveredTotal,
                'concentraciones' => $concentrationCount,
                'cloudnet_sites' => $cloudnetSites,
                'cloudnet_online_devices' => $onlineDevices,
                'cloudnet_offline_devices' => $offlineDevices,
                'sites_sin_asociacion' => $sitesSinAsociacion,
                'contactos_pendientes_match' => School::query()->where('contact_match_status', ContactMatchStatus::Pending)->count(),
            ],
            'nav' => [
                'caidas_activas' => $allActive->count(),
                'pendientes_contacto' => $allActive->where('followup_status', FollowupStatus::PendienteContacto->value)->count(),
                'en_gestion' => $enGestion,
                'concentraciones' => $concentrationCount,
                'recuperados' => $recoveredTotal,
            ],
            'active_incidents_preview' => $activePreview,
            'oldest_incidents_preview' => [],
            'cloudnet' => [
                'sites' => $cloudnetSites,
                'matched' => $matchedSites,
                'pending' => $pendingSites,
                'last_synced_at' => $lastCloudnetSync,
                'devices' => $deviceCount,
                'preview' => $cloudnetPreview,
            ],
            'concentrations' => $concentrations,
            'recent_recoveries' => [],
            'sync' => [
                'prtg' => $this->lastSyncRun('PRTG'),
                'cloudnet' => $this->lastSyncRun('CLOUDNET'),
            ],
        ];
    }

    /**
     * @return Collection<int, array<string, mixed>>
     */
    public function activeOutages(?string $search = null): Collection
    {
        $query = Incident::query()
            ->active()
            ->whereHas('sensor', fn ($sensor) => $sensor->where('normalized_status', MonitoringStatus::Caido))
            ->with([
                'school.contacts',
                'networkAssignment',
                'sensor',
            ])
            ->orderByDesc('started_at');

        if ($search) {
            $term = '%'.mb_strtolower($search).'%';
            $query->where(function ($q) use ($term) {
                $q->whereHas('school', function ($school) use ($term) {
                    $school->whereRaw('LOWER(local_educativo) like ?', [$term])
                        ->orWhereRaw('LOWER(codigo_local) like ?', [$term])
                        ->orWhereRaw('LOWER(distrito) like ?', [$term]);
                })->orWhereHas('networkAssignment', function ($na) use ($term) {
                    $na->whereRaw('LOWER(cid) like ?', [$term]);
                });
            });
        }

        $incidents = $query->get();

        $assignmentIds = $incidents->pluck('network_assignment_id')->filter()->unique()->values();
        $schoolIds = $incidents->pluck('school_id')->filter()->unique()->values();

        $reincidenteCounts = Incident::query()
            ->whereIn('network_assignment_id', $assignmentIds)
            ->select('network_assignment_id', DB::raw('count(*) as total'))
            ->groupBy('network_assignment_id')
            ->pluck('total', 'network_assignment_id');

        $cloudnetByAssignment = CloudnetSite::query()
            ->whereIn('network_assignment_id', $assignmentIds)
            ->get()
            ->keyBy('network_assignment_id');

        $cloudnetBySchool = CloudnetSite::query()
            ->whereIn('school_id', $schoolIds)
            ->whereNull('network_assignment_id')
            ->get()
            ->groupBy('school_id');

        return $incidents->map(function (Incident $incident) use ($cloudnetByAssignment, $cloudnetBySchool, $reincidenteCounts) {
            $school = $incident->school;
            $assignment = $incident->networkAssignment;
            $sensor = $incident->sensor;
            $contact = $school?->contacts?->first();

            $site = $assignment
                ? ($cloudnetByAssignment->get($assignment->id) ?? null)
                : null;
            if ($site === null && $school) {
                $site = $cloudnetBySchool->get($school->id)?->first();
            }

            $reincidenteCount = (int) ($reincidenteCounts[$incident->network_assignment_id] ?? 1);

            return [
                'incident_id' => $incident->id,
                'school_id' => $incident->school_id,
                'assignment_id' => $incident->network_assignment_id,
                'cid' => $assignment?->cid,
                'local_educativo' => $school?->local_educativo,
                'codigo_local' => $school?->codigo_local,
                'provincia' => $school?->provincia,
                'distrito' => $school?->distrito,
                'tecnologia' => $assignment?->tecnologia_acceso,
                'nodo_pop' => $assignment?->nodo_pop,
                'estado_prtg' => $sensor?->normalized_status?->value ?? $incident->current_status,
                'estado_prtg_text' => $sensor?->status_text,
                'duracion' => $incident->started_at?->diffForHumans(now(), true),
                'started_at' => $incident->started_at?->toIso8601String(),
                'followup_status' => $incident->followup_status?->value,
                'last_check' => $sensor?->last_check?->toIso8601String(),
                'contacto' => $contact?->name,
                'telefono' => $contact?->phone,
                'contacto_corto' => $this->shortContactName($contact),
                'telefono_masked' => $contact?->phone,
                'cloudnet_status' => $this->resolveCloudnetStatus($site),
                'reincidente_count' => $reincidenteCount,
                'reincidente' => $reincidenteCount > 1,
                'glpi_ticket' => $incident->glpi_ticket,
                'responsible_area' => $incident->responsible_area,
            ];
        });
    }

    /**
     * Concentraciones por provincia > distrito (estilo NOC operativo).
     *
     * @return array<int, array<string, mixed>>
     */
    public function concentrations(): array
    {
        $activeIncidents = Incident::query()
            ->active()
            ->with(['school', 'networkAssignment'])
            ->get();

        /** @var array<string, array<string, mixed>> $zones */
        $zones = [];
        foreach ($activeIncidents as $incident) {
            $provincia = trim((string) ($incident->school?->provincia ?? '')) ?: 'SIN PROVINCIA';
            $distrito = trim((string) ($incident->school?->distrito ?? '')) ?: 'SIN DISTRITO';
            $key = mb_strtoupper($provincia).'|'.mb_strtoupper($distrito);

            if (! isset($zones[$key])) {
                $zones[$key] = [
                    'dimension' => 'distrito',
                    'provincia' => $provincia,
                    'distrito' => $distrito,
                    'label' => $provincia.' > '.$distrito,
                    'caidos' => 0,
                    'school_ids' => [],
                    'nodos' => [],
                    'oldest_started_at' => null,
                ];
            }

            $zones[$key]['caidos']++;
            if ($incident->school_id) {
                $zones[$key]['school_ids'][$incident->school_id] = true;
            }
            $nodo = trim((string) ($incident->networkAssignment?->nodo_pop ?? ''));
            if ($nodo !== '') {
                $zones[$key]['nodos'][$nodo] = true;
            }
            $started = $incident->started_at;
            if ($started !== null) {
                $current = $zones[$key]['oldest_started_at'];
                if ($current === null || $started->lt($current)) {
                    $zones[$key]['oldest_started_at'] = $started;
                }
            }
        }

        $zones = array_filter($zones, fn (array $z) => (int) $z['caidos'] >= 2);

        $out = [];
        foreach ($zones as $zone) {
            $provincia = $zone['provincia'];
            $distrito = $zone['distrito'];

            $schoolQuery = School::query()
                ->where('active', true)
                ->whereRaw('UPPER(TRIM(COALESCE(provincia, \'\'))) = ?', [mb_strtoupper($provincia)])
                ->whereRaw('UPPER(TRIM(COALESCE(distrito, \'\'))) = ?', [mb_strtoupper($distrito)]);

            $total = (clone $schoolQuery)->count();
            $schoolIds = (clone $schoolQuery)->pluck('id');

            $assignmentIds = NetworkAssignment::query()
                ->where('is_active', true)
                ->whereIn('school_id', $schoolIds)
                ->pluck('id');

            $monitored = PrtgSensor::query()
                ->where('name', 'Ping')
                ->whereIn('network_assignment_id', $assignmentIds)
                ->distinct('network_assignment_id')
                ->count('network_assignment_id');

            $caidos = (int) $zone['caidos'];
            $afectados = count($zone['school_ids']);
            $operativos = max(0, $monitored - $afectados);
            $sinMonitoreo = max(0, $total - $monitored);
            $pct = $total > 0 ? round(($afectados / $total) * 100, 1) : 0.0;

            $nodos = array_keys($zone['nodos']);
            sort($nodos);

            $out[] = [
                'dimension' => 'distrito',
                'label' => $zone['label'],
                'provincia' => $provincia,
                'distrito' => $distrito,
                'caidos' => $caidos,
                'afectados' => $afectados,
                'total' => $total,
                'monitoreados' => $monitored,
                'operativos' => $operativos,
                'sin_monitoreo' => $sinMonitoreo,
                'porcentaje_caidos' => $pct,
                'nodo_pop' => $nodos !== [] ? implode(', ', $nodos) : '—',
                'oldest_started_at' => $zone['oldest_started_at']?->toIso8601String(),
                'nota' => 'Posible concentración operativa (no implica causa confirmada).',
            ];
        }

        usort($out, fn ($a, $b) => $b['caidos'] <=> $a['caidos']);

        return array_values($out);
    }

    /**
     * Historial por colegio: caídas, recuperaciones y estado actual.
     *
     * @return array<int, array<string, mixed>>
     */
    public function schoolHistory(?string $search = null): array
    {
        $stats = Incident::query()
            ->select([
                'school_id',
                DB::raw('count(*) as caidas'),
                DB::raw('count(recovered_at) as recuperaciones'),
                DB::raw('max(started_at) as ultima_caida'),
                DB::raw('max(recovered_at) as ultima_recuperacion'),
            ])
            ->groupBy('school_id')
            ->get()
            ->keyBy('school_id');

        $schools = School::query()
            ->whereIn('id', $stats->keys())
            ->with(['activeAssignment'])
            ->get();

        $assignmentIds = $schools->pluck('activeAssignment.id')->filter()->values();
        $pings = PrtgSensor::query()
            ->where('name', 'Ping')
            ->whereIn('network_assignment_id', $assignmentIds)
            ->get()
            ->keyBy('network_assignment_id');

        $rows = [];
        foreach ($schools as $school) {
            $stat = $stats->get($school->id);
            $assignment = $school->activeAssignment;
            $ping = $assignment ? $pings->get($assignment->id) : null;
            $local = (string) ($school->local_educativo ?? '');
            $cid = (string) ($assignment?->cid ?? '');
            if ($search) {
                $haystack = mb_strtolower($local.' '.$cid.' '.(string) $school->codigo_local);
                if (! str_contains($haystack, mb_strtolower($search))) {
                    continue;
                }
            }
            $rows[] = [
                'school_id' => $school->id,
                'cid' => $assignment?->cid,
                'local_educativo' => $school->local_educativo,
                'codigo_local' => $school->codigo_local,
                'provincia' => $school->provincia,
                'distrito' => $school->distrito,
                'caidas' => (int) ($stat->caidas ?? 0),
                'recuperaciones' => (int) ($stat->recuperaciones ?? 0),
                'estado_actual' => $ping?->normalized_status?->value ?? 'SIN_DATOS',
                'ultima_caida' => $stat->ultima_caida,
                'ultima_recuperacion' => $stat->ultima_recuperacion,
            ];
        }

        usort($rows, fn ($a, $b) => $b['caidas'] <=> $a['caidas']);

        return $rows;
    }

    /**
     * @return array<string, mixed>|null
     */
    private function lastSyncRun(string $source): ?array
    {
        $run = SyncRun::query()
            ->where('source', $source)
            ->whereNotNull('finished_at')
            ->orderByDesc('id')
            ->first();

        if (! $run) {
            return null;
        }

        return [
            'status' => $run->status?->value ?? $run->status,
            'finished_at' => $run->finished_at?->toIso8601String(),
            'warning_count' => (int) $run->warning_count,
            'error_count' => (int) $run->error_count,
            'processed_count' => (int) $run->processed_count,
        ];
    }

    private function resolveCloudnetStatus(?CloudnetSite $site): string
    {
        if ($site === null) {
            return 'UNKNOWN';
        }

        $status = (string) ($site->match_status ?? '');
        if (str_starts_with($status, 'MATCHED')) {
            return 'VINCULADO';
        }

        return 'UNKNOWN';
    }

    private function shortContactName(?SchoolContact $contact): ?string
    {
        if ($contact === null || blank($contact->name)) {
            return null;
        }

        $parts = preg_split('/\s+/', trim((string) $contact->name)) ?: [];
        $first = $parts[0] ?? null;

        return $first !== null && $first !== '' ? $first : null;
    }

    private function maskPhone(?string $phone): ?string
    {
        if ($phone === null || $phone === '') {
            return null;
        }

        $digits = preg_replace('/\D+/', '', $phone) ?? '';
        if (strlen($digits) < 4) {
            return str_repeat('*', strlen($digits));
        }

        return str_repeat('*', max(0, strlen($digits) - 4)).substr($digits, -4);
    }
}
