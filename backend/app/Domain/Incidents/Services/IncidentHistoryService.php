<?php

namespace App\Domain\Incidents\Services;

use App\Domain\Incidents\Support\OutageDuration;
use App\Domain\Monitoring\PRTG\Support\PrtgOperationalLocation;
use App\Enums\ManagementClassification;
use App\Enums\ManagementScope;
use App\Enums\MonitoringStatus;
use App\Models\Incident;
use App\Models\PrtgSensor;
use App\Models\School;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;

class IncidentHistoryService
{
    /**
     * @param  array<string, mixed>  $filters
     * @return array{data: list<array<string, mixed>>, meta: array<string, mixed>, filters: array<string, mixed>, stats: array<string, mixed>}
     */
    public function listSchools(array $filters): array
    {
        $perPage = (int) ($filters['per_page'] ?? 25);
        $perPage = max(1, min(100, $perPage));
        $page = max(1, (int) ($filters['page'] ?? 1));
        $search = trim((string) ($filters['q'] ?? $filters['search'] ?? ''));
        $provincia = trim((string) ($filters['provincia'] ?? ''));
        $distrito = trim((string) ($filters['distrito'] ?? ''));
        $tecnologia = trim((string) ($filters['tecnologia'] ?? ''));
        $currentStatus = strtoupper(trim((string) ($filters['current_status'] ?? '')));

        $agg = Incident::query()
            ->select([
                'school_id',
                DB::raw('count(*) as caidas'),
                DB::raw('sum(case when recovered_at is not null then 1 else 0 end) as recuperaciones'),
                DB::raw('sum(case when recovered_at is null then 1 else 0 end) as activas'),
                DB::raw('max(started_at) as ultima_caida'),
                DB::raw('max(recovered_at) as ultima_recuperacion'),
            ])
            ->groupBy('school_id');

        $schoolQuery = School::query()
            ->joinSub($agg, 'incident_stats', function ($join) {
                $join->on('schools.id', '=', 'incident_stats.school_id');
            })
            ->leftJoin('network_assignments as na', function ($join) {
                $join->on('na.school_id', '=', 'schools.id')->where('na.is_active', true);
            })
            ->select([
                'schools.id as school_id',
                'schools.local_educativo',
                'schools.codigo_local',
                'schools.provincia as admin_provincia',
                'schools.distrito as admin_distrito',
                'na.cid',
                'na.tecnologia_acceso',
                'na.prtg_province',
                'na.prtg_district',
                'na.id as assignment_id',
                'incident_stats.caidas',
                'incident_stats.recuperaciones',
                'incident_stats.activas',
                'incident_stats.ultima_caida',
                'incident_stats.ultima_recuperacion',
            ])
            ->orderByDesc('incident_stats.caidas')
            ->orderBy('schools.local_educativo');

        if ($search !== '') {
            $like = '%'.mb_strtolower($search).'%';
            $schoolQuery->where(function (Builder $q) use ($like) {
                $q->whereRaw('lower(coalesce(schools.local_educativo, \'\')) like ?', [$like])
                    ->orWhereRaw('lower(coalesce(schools.codigo_local, \'\')) like ?', [$like])
                    ->orWhereRaw('lower(coalesce(na.cid, \'\')) like ?', [$like]);
            });
        }
        if ($provincia !== '') {
            $schoolQuery->whereRaw('upper(coalesce(na.prtg_province, \'\')) = ?', [mb_strtoupper($provincia)]);
        }
        if ($distrito !== '') {
            $schoolQuery->whereRaw('upper(coalesce(na.prtg_district, \'\')) = ?', [mb_strtoupper($distrito)]);
        }
        if ($tecnologia !== '') {
            $schoolQuery->whereRaw('upper(coalesce(na.tecnologia_acceso, \'\')) = ?', [mb_strtoupper($tecnologia)]);
        }

        // Filter by current PRTG status requires ping join — apply after building base if needed
        $allRows = $schoolQuery->get();
        $assignmentIds = $allRows->pluck('assignment_id')->filter()->unique()->values();
        $pings = PrtgSensor::query()
            ->where('name', 'Ping')
            ->whereIn('network_assignment_id', $assignmentIds)
            ->get()
            ->keyBy('network_assignment_id');

        $mapped = $allRows->map(function ($row) use ($pings) {
            $ping = $row->assignment_id ? $pings->get($row->assignment_id) : null;
            $estado = $ping?->normalized_status?->value ?? MonitoringStatus::SinDatos->value;
            $province = PrtgOperationalLocation::clean($row->prtg_province)
                ?? PrtgOperationalLocation::clean($row->admin_provincia);
            $district = PrtgOperationalLocation::clean($row->prtg_district)
                ?? PrtgOperationalLocation::clean($row->admin_distrito);

            return [
                'school_id' => (int) $row->school_id,
                'cid' => $row->cid,
                'local_educativo' => $row->local_educativo,
                'codigo_local' => $row->codigo_local,
                'provincia' => $province,
                'distrito' => $district,
                'tecnologia' => $row->tecnologia_acceso,
                'caidas' => (int) $row->caidas,
                'recuperaciones' => (int) $row->recuperaciones,
                'activas' => (int) $row->activas,
                'estado_actual' => $estado,
                'ultima_caida' => $row->ultima_caida,
                'ultima_recuperacion' => $row->ultima_recuperacion,
            ];
        });

        if ($currentStatus !== '') {
            $mapped = $mapped->filter(
                fn (array $row) => strtoupper((string) $row['estado_actual']) === $currentStatus
            )->values();
        }

        $schoolIds = $mapped->pluck('school_id')->all();
        $downtimeBySchool = $this->totalDowntimeSecondsBySchool($schoolIds);

        $mapped = $mapped->map(function (array $row) use ($downtimeBySchool) {
            $seconds = $downtimeBySchool[$row['school_id']] ?? 0;
            $row['tiempo_total_caido_segundos'] = $seconds;
            $row['tiempo_total_caido'] = OutageDuration::human($seconds);

            return $row;
        });

        $total = $mapped->count();
        $lastPage = max(1, (int) ceil($total / $perPage));
        $page = min($page, $lastPage);
        $slice = $mapped->slice(($page - 1) * $perPage, $perPage)->values()->all();

        return [
            'data' => $slice,
            'meta' => [
                'current_page' => $page,
                'last_page' => $lastPage,
                'per_page' => $perPage,
                'total' => $total,
            ],
            'filters' => $this->catalogFilters($provincia),
            'stats' => [
                'colegios_con_historial' => $total,
                'incidencias_historicas' => (int) Incident::query()->count(),
                'recuperadas' => (int) Incident::query()->whereNotNull('recovered_at')->count(),
                'activas' => (int) Incident::query()->whereNull('recovered_at')->count(),
            ],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function schoolOverview(School $school): array
    {
        $school->loadMissing(['activeAssignment']);
        $assignment = $school->activeAssignment;
        $ping = $assignment
            ? PrtgSensor::query()
                ->where('network_assignment_id', $assignment->id)
                ->where('name', 'Ping')
                ->first()
            : null;

        $incidents = Incident::query()
            ->where('school_id', $school->id)
            ->orderByDesc('started_at')
            ->get(['id', 'started_at', 'recovered_at', 'followup_status', 'management_classification', 'management_scope']);

        $now = now();
        $durations = [];
        $totalSeconds = 0;
        $recovered = 0;
        $active = 0;
        $last30 = $incidents->filter(fn (Incident $i) => $i->started_at && $i->started_at->gte($now->copy()->subDays(30)));

        foreach ($incidents as $incident) {
            $seconds = OutageDuration::seconds($incident->started_at, $incident->recovered_at, $now) ?? 0;
            $totalSeconds += $seconds;
            if ($incident->recovered_at) {
                $recovered++;
                $durations[] = $seconds;
            } else {
                $active++;
            }
        }

        $avg = $durations !== [] ? (int) round(array_sum($durations) / count($durations)) : null;
        $max = $durations !== [] ? max($durations) : null;

        $last30Seconds = 0;
        foreach ($last30 as $incident) {
            $last30Seconds += OutageDuration::seconds($incident->started_at, $incident->recovered_at, $now) ?? 0;
        }

        $location = PrtgOperationalLocation::apiFields($assignment, $school);

        return [
            'school' => [
                'id' => $school->id,
                'local_educativo' => $school->local_educativo,
                'codigo_local' => $school->codigo_local,
                'codigo_modular' => $school->codigo_modular,
                'provincia' => $location['provincia'],
                'distrito' => $location['distrito'],
                'admin_provincia' => $location['admin_provincia'],
                'admin_distrito' => $location['admin_distrito'],
                'location_source' => $location['location_source'],
                'location_mismatch' => $location['location_mismatch'],
                'centro_poblado' => $school->centro_poblado,
            ],
            'network' => [
                'cid' => $assignment?->cid,
                'tecnologia_acceso' => $assignment?->tecnologia_acceso,
                'capacidad_mbps' => $assignment?->capacidad_mbps,
                'nodo_pop' => $assignment?->nodo_pop,
                'prtg_device_name' => $assignment?->prtg_device_name,
                'prtg_province' => $location['prtg_province'],
                'prtg_district' => $location['prtg_district'],
            ],
            'monitoring' => [
                'estado_actual' => $ping?->normalized_status?->value ?? MonitoringStatus::SinDatos->value,
                'estado_texto' => $ping?->status_text,
                'last_check' => $ping?->last_check?->toIso8601String(),
                'device_name' => $ping?->device_name ?? $assignment?->prtg_device_name,
            ],
            'statistics' => [
                'total_caidas' => $incidents->count(),
                'recuperaciones' => $recovered,
                'caidas_activas' => $active,
                'ultima_caida' => optional($incidents->first())->started_at?->toIso8601String(),
                'ultima_recuperacion' => optional(
                    $incidents->first(fn (Incident $i) => $i->recovered_at !== null)
                )->recovered_at?->toIso8601String(),
                'tiempo_total_caido_segundos' => $totalSeconds,
                'tiempo_total_caido' => OutageDuration::human($totalSeconds),
                'duracion_promedio_segundos' => $avg,
                'duracion_promedio' => OutageDuration::human($avg),
                'mayor_caida_segundos' => $max,
                'mayor_caida' => OutageDuration::human($max),
                'ultimos_30_dias' => [
                    'caidas' => $last30->count(),
                    'duracion_total_segundos' => $last30Seconds,
                    'duracion_total' => OutageDuration::human($last30Seconds),
                    'promedio_segundos' => $last30->count() > 0
                        ? (int) round($last30Seconds / $last30->count())
                        : null,
                    'promedio' => $last30->count() > 0
                        ? OutageDuration::human((int) round($last30Seconds / $last30->count()))
                        : null,
                ],
            ],
        ];
    }

    /**
     * @param  array<string, mixed>  $filters
     */
    public function schoolIncidents(School $school, array $filters): LengthAwarePaginator
    {
        $perPage = (int) ($filters['per_page'] ?? 10);
        $perPage = in_array($perPage, [10, 25, 50], true) ? $perPage : 10;

        $query = Incident::query()
            ->where('school_id', $school->id)
            ->with(['sensor:id,name,normalized_status,device_name', 'networkAssignment:id,cid,tecnologia_acceso'])
            ->orderByDesc('started_at');

        if (! empty($filters['date_from'])) {
            $query->whereDate('started_at', '>=', $filters['date_from']);
        }
        if (! empty($filters['date_to'])) {
            $query->whereDate('started_at', '<=', $filters['date_to']);
        }

        $status = strtoupper((string) ($filters['status'] ?? ''));
        if ($status === 'RECOVERED' || $status === 'RECUPERADOS') {
            $query->whereNotNull('recovered_at');
        } elseif ($status === 'ACTIVE' || $status === 'ACTIVOS') {
            $query->whereNull('recovered_at');
        }

        if (! empty($filters['classification'])) {
            $query->where('management_classification', $filters['classification']);
        }
        if (! empty($filters['scope'])) {
            $query->where('management_scope', $filters['scope']);
        }

        $totalForSchool = Incident::query()->where('school_id', $school->id)->count();
        $orderedIds = Incident::query()
            ->where('school_id', $school->id)
            ->orderBy('started_at')
            ->orderBy('id')
            ->pluck('id')
            ->all();
        $rankById = array_flip($orderedIds);

        return $query->paginate($perPage)->through(function (Incident $incident) use ($totalForSchool, $rankById) {
            $seconds = OutageDuration::seconds($incident->started_at, $incident->recovered_at);
            $ordinal = isset($rankById[$incident->id]) ? ((int) $rankById[$incident->id] + 1) : null;

            return [
                'id' => $incident->id,
                'started_at' => $incident->started_at?->toIso8601String(),
                'recovered_at' => $incident->recovered_at?->toIso8601String(),
                'duration_seconds' => $seconds,
                'duration' => OutageDuration::human($seconds),
                'same_day' => $incident->started_at && $incident->recovered_at
                    ? $incident->started_at->toDateString() === $incident->recovered_at->toDateString()
                    : false,
                'followup_status' => $incident->followup_status?->value,
                'followup_label' => $incident->followup_status?->label(),
                'management_classification' => $incident->management_classification?->value,
                'management_classification_label' => $incident->management_classification?->label(),
                'management_scope' => $incident->management_scope?->value,
                'current_status' => $incident->current_status,
                'prtg_status' => $incident->sensor?->normalized_status?->value,
                'reincidencia' => [
                    'numero' => $ordinal,
                    'total' => $totalForSchool,
                    'label' => $ordinal ? "Incidencia {$ordinal} de {$totalForSchool}" : null,
                ],
            ];
        });
    }

    /**
     * @param  list<int>  $schoolIds
     * @return array<int, int>
     */
    private function totalDowntimeSecondsBySchool(array $schoolIds): array
    {
        if ($schoolIds === []) {
            return [];
        }

        $rows = Incident::query()
            ->whereIn('school_id', $schoolIds)
            ->get(['school_id', 'started_at', 'recovered_at']);

        $now = now();
        $out = [];
        foreach ($rows as $row) {
            $seconds = OutageDuration::seconds($row->started_at, $row->recovered_at, $now) ?? 0;
            $out[(int) $row->school_id] = ($out[(int) $row->school_id] ?? 0) + $seconds;
        }

        return $out;
    }

    /**
     * @return array{provincias: list<string>, distritos: list<string>, tecnologias: list<string>, classifications: list<array{value: string, label: string}>, scopes: list<array{value: string, label: string}>}
     */
    private function catalogFilters(?string $provincia): array
    {
        $schoolIds = Incident::query()->distinct()->pluck('school_id');

        $provincias = DB::table('network_assignments')
            ->whereIn('school_id', $schoolIds)
            ->where('is_active', true)
            ->whereNotNull('prtg_province')
            ->where('prtg_province', '!=', '')
            ->distinct()
            ->orderBy('prtg_province')
            ->pluck('prtg_province')
            ->values()
            ->all();

        $distritosQuery = DB::table('network_assignments')
            ->whereIn('school_id', $schoolIds)
            ->where('is_active', true)
            ->whereNotNull('prtg_district')
            ->where('prtg_district', '!=', '');
        if ($provincia) {
            $distritosQuery->whereRaw('upper(prtg_province) = ?', [mb_strtoupper($provincia)]);
        }
        $distritos = $distritosQuery->distinct()->orderBy('prtg_district')->pluck('prtg_district')->values()->all();

        $tecnologias = DB::table('network_assignments')
            ->whereIn('school_id', $schoolIds)
            ->where('is_active', true)
            ->whereNotNull('tecnologia_acceso')
            ->where('tecnologia_acceso', '!=', '')
            ->distinct()
            ->orderBy('tecnologia_acceso')
            ->pluck('tecnologia_acceso')
            ->values()
            ->all();

        return [
            'provincias' => $provincias,
            'distritos' => $distritos,
            'tecnologias' => $tecnologias,
            'classifications' => collect(ManagementClassification::cases())
                ->map(fn (ManagementClassification $c) => ['value' => $c->value, 'label' => $c->label()])
                ->values()
                ->all(),
            'scopes' => collect(ManagementScope::cases())
                ->map(fn (ManagementScope $s) => ['value' => $s->value, 'label' => $s->label()])
                ->values()
                ->all(),
        ];
    }
}
