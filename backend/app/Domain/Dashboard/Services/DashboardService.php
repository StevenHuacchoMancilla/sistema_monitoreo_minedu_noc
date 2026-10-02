<?php

namespace App\Domain\Dashboard\Services;

use App\Domain\Monitoring\PRTG\Support\PrtgOperationalLocation;
use App\Domain\Monitoring\Support\SyncCoordinator;
use App\Enums\CidStatus;
use App\Enums\ContactMatchStatus;
use App\Enums\FollowupStatus;
use App\Enums\MonitoringStatus;
use App\Enums\RecoveryReviewStatus;
use App\Models\Incident;
use App\Models\NetworkAssignment;
use App\Models\PrtgSensor;
use App\Models\School;
use App\Models\SchoolContact;
use App\Models\TrackingRecord;
use App\Enums\TrackingStatus;
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

        $managing = FollowupStatus::managingValues();
        $trackingOpen = TrackingStatus::openValues();
        $cidMissing = [CidStatus::Empty->value, CidStatus::Invalid->value, CidStatus::BajaImpe->value];
        $dayStart = \App\Support\OperationalTime::dayStart();
        $dayEnd = \App\Support\OperationalTime::dayEnd();

        $counts = DB::selectOne(
            'SELECT
                (SELECT COUNT(*)::int FROM schools WHERE active = true) AS total_schools,
                (SELECT COUNT(*)::int FROM network_assignments WHERE is_active = true AND cid_status = ?) AS valid_cid,
                (SELECT COUNT(*)::int FROM network_assignments WHERE is_active = true AND cid_status IN (?, ?, ?)) AS without_cid,
                (SELECT COUNT(*)::int FROM network_assignments WHERE is_active = true AND monitoring_eligible = true) AS eligible,
                (SELECT COUNT(*)::int FROM incidents WHERE recovered_at IS NULL AND followup_status IN (?, ?, ?, ?, ?)) AS en_gestion,
                (SELECT COUNT(*)::int FROM incidents WHERE recovered_at IS NOT NULL AND recovered_at BETWEEN ? AND ?) AS recovered_today,
                (SELECT COUNT(*)::int FROM incidents WHERE recovered_at IS NOT NULL AND (recovery_review_status = ? OR (recovered_while_managing = true AND recovery_review_status IS NULL))) AS pending_reviews,
                (SELECT COUNT(*)::int FROM incidents WHERE recovered_at IS NOT NULL) AS recovered_total,
                (SELECT COUNT(*)::int FROM tracking_records WHERE status IN (?, ?, ?)) AS tracking_abiertos,
                (SELECT COUNT(*)::int FROM schools WHERE contact_match_status = ?) AS contacts_pending',
            [
                CidStatus::Valid->value,
                ...$cidMissing,
                ...$managing,
                $dayStart,
                $dayEnd,
                RecoveryReviewStatus::PendingReview->value,
                ...$trackingOpen,
                ContactMatchStatus::Pending->value,
            ]
        );

        $pingStatuses = \App\Domain\Monitoring\PRTG\Services\PrtgSensorQuery::statusCounts();
        $withPing = array_sum($pingStatuses);
        $outageNav = $this->outageNavCounts();
        $concentrationCount = $this->concentrationCount();
        $eligible = (int) $counts->eligible;

        return [
            'health' => [
                'api' => 'online',
                'database' => $dbOnline ? 'online' : 'offline',
                'driver' => $driver,
                'name' => $connection['database'] ?? null,
            ],
            'kpis' => [
                'total_locales' => (int) $counts->total_schools,
                'con_cid_valido' => (int) $counts->valid_cid,
                'sin_cid' => (int) $counts->without_cid,
                'operativos' => (int) ($pingStatuses[MonitoringStatus::Operativo->value] ?? 0),
                'caidos' => (int) ($pingStatuses[MonitoringStatus::Caido->value] ?? 0),
                'parciales' => (int) ($pingStatuses[MonitoringStatus::Parcial->value] ?? 0),
                'pausados' => (int) ($pingStatuses[MonitoringStatus::Pausado->value] ?? 0),
                'sin_datos_prtg' => max(0, $eligible - $withPing),
                'incidencias_activas' => $outageNav['activas'],
                'pendientes_contacto' => $outageNav['pendientes'],
                'en_gestion' => (int) $counts->en_gestion,
                'recaida_gestion' => $outageNav['recaidas'],
                'recuperados_hoy' => (int) $counts->recovered_today,
                'pending_reviews' => (int) $counts->pending_reviews,
                'recuperados_total' => (int) $counts->recovered_total,
                'concentraciones' => $concentrationCount,
                'contactos_pendientes_match' => (int) $counts->contacts_pending,
            ],
            'nav' => [
                'caidas_totales' => $outageNav['totales'],
                'caidas_activas' => $outageNav['activas'],
                'pendientes_contacto' => $outageNav['pendientes'],
                'en_gestion' => (int) $counts->en_gestion,
                'recaida_gestion' => $outageNav['recaidas'],
                'concentraciones' => $concentrationCount,
                'recuperados' => (int) $counts->recovered_today,
                'pending_reviews' => (int) $counts->pending_reviews,
                'tracking_abiertos' => (int) $counts->tracking_abiertos,
            ],
            'active_incidents_preview' => [],
            'oldest_incidents_preview' => [],
            'concentrations' => [],
            'recent_recoveries' => [],
            'sync' => [
                'prtg' => $this->lastSyncRun('PRTG'),
            ],
        ];
    }

    /**
     * Conteos del menú sin armar cada fila de la tabla.
     *
     * @return array{totales: int, activas: int, pendientes: int, recaidas: int}
     */
    public function outageNavCounts(): array
    {
        $row = DB::selectOne(
            "SELECT
                COUNT(*)::int AS totales,
                COUNT(*) FILTER (WHERE NOT reopened_from_management)::int AS activas,
                COUNT(*) FILTER (WHERE NOT reopened_from_management AND followup_status = ?)::int AS pendientes,
                COUNT(*) FILTER (WHERE reopened_from_management)::int AS recaidas
             FROM (
                SELECT DISTINCT ON (network_assignment_id)
                    reopened_from_management,
                    followup_status
                FROM incidents
                WHERE recovered_at IS NULL
                  AND (
                    detection_source = ?
                    OR EXISTS (
                        SELECT 1 FROM prtg_sensors s
                        WHERE s.id = incidents.prtg_sensor_id
                          AND s.normalized_status = ?
                    )
                  )
                ORDER BY network_assignment_id, started_at DESC NULLS LAST, id DESC
             ) t",
            [
                FollowupStatus::PendienteContacto->value,
                Incident::DETECTION_MANUAL_PARTIAL,
                MonitoringStatus::Caido->value,
            ]
        );

        return [
            'totales' => (int) ($row->totales ?? 0),
            'activas' => (int) ($row->activas ?? 0),
            'pendientes' => (int) ($row->pendientes ?? 0),
            'recaidas' => (int) ($row->recaidas ?? 0),
        ];
    }

    public function concentrationCount(): int
    {
        $zones = [];
        $incidents = Incident::query()->active()->with(['school', 'networkAssignment'])->get();
        foreach ($incidents as $incident) {
            $location = PrtgOperationalLocation::resolve($incident->networkAssignment, $incident->school);
            $key = mb_strtoupper((string) ($location['province'] ?? 'SIN PROVINCIA'))
                .'|'.mb_strtoupper((string) ($location['district'] ?? 'SIN DISTRITO'));
            $zones[$key] = ($zones[$key] ?? 0) + 1;
        }

        return count(array_filter($zones, fn (int $n) => $n >= 2));
    }

    /**
     * @return Collection<int, array<string, mixed>>
     */
    public function activeOutages(?string $search = null, ?string $sort = null, ?string $direction = null): Collection
    {
        $sort = in_array($sort, ['started_at', 'id'], true) ? $sort : 'started_at';
        $direction = strtolower((string) $direction) === 'asc' ? 'asc' : 'desc';

        $query = Incident::query()
            ->active()
            ->where(function ($q) {
                $q->whereHas('sensor', fn ($sensor) => $sensor->where('normalized_status', MonitoringStatus::Caido))
                    ->orWhere('detection_source', Incident::DETECTION_MANUAL_PARTIAL);
            })
            ->with([
                'school.contacts',
                'networkAssignment',
                'sensor',
                'trackingRecords' => fn ($q) => $q
                    ->select(['id', 'incident_id', 'status', 'report_ticket', 'ticket'])
                    ->orderByDesc('id'),
            ])
            ->orderBy($sort, $direction)
            ->orderBy('id', $direction);

        if ($search) {
            $term = '%'.mb_strtolower($search).'%';
            $query->where(function ($q) use ($term) {
                $q->whereHas('school', function ($school) use ($term) {
                    $school->whereRaw('LOWER(local_educativo) like ?', [$term])
                        ->orWhereRaw('LOWER(codigo_local) like ?', [$term])
                        ->orWhereRaw('LOWER(distrito) like ?', [$term])
                        ->orWhereRaw('LOWER(provincia) like ?', [$term]);
                })->orWhereHas('networkAssignment', function ($na) use ($term) {
                    $na->whereRaw('LOWER(cid) like ?', [$term])
                        ->orWhereRaw('LOWER(COALESCE(prtg_province, \'\')) like ?', [$term])
                        ->orWhereRaw('LOWER(COALESCE(prtg_district, \'\')) like ?', [$term]);
                });
            });
        }

        $incidents = $query->get()
            // Una caída visible por asignación (evita dobles por sensores de ramas antiguas).
            ->unique('network_assignment_id')
            ->values();

        $assignmentIds = $incidents->pluck('network_assignment_id')->filter()->unique()->values();

        $reincidenteCounts = Incident::query()
            ->whereIn('network_assignment_id', $assignmentIds)
            ->select('network_assignment_id', DB::raw('count(*) as total'))
            ->groupBy('network_assignment_id')
            ->pluck('total', 'network_assignment_id');

        return $incidents->map(function (Incident $incident) use ($reincidenteCounts) {
            $school = $incident->school;
            $assignment = $incident->networkAssignment;
            $sensor = $incident->sensor;
            $contact = $school?->contacts?->first();

            $reincidenteCount = (int) ($reincidenteCounts[$incident->network_assignment_id] ?? 1);
            $location = PrtgOperationalLocation::apiFields($assignment, $school);
            $tracking = $incident->trackingRecords->first();

            return [
                'incident_id' => $incident->id,
                'school_id' => $incident->school_id,
                'assignment_id' => $incident->network_assignment_id,
                'cid' => $assignment?->cid,
                'local_educativo' => $school?->local_educativo,
                'codigo_local' => $school?->codigo_local,
                ...$location,
                'tecnologia' => $assignment?->tecnologia_acceso,
                'nodo_pop' => $assignment?->nodo_pop,
                'estado_prtg' => $incident->isManualPartial()
                    ? MonitoringStatus::Parcial->value
                    : ($sensor?->normalized_status?->value ?? $incident->current_status),
                'estado_prtg_text' => $incident->isManualPartial()
                    ? ('Enlace '.($incident->affected_wan_node?->value ?? 'PARCIAL'))
                    : $sensor?->status_text,
                'detection_source' => $incident->detection_source,
                'affected_wan_node' => $incident->affected_wan_node?->value,
                'affected_wan_node_label' => $incident->affected_wan_node?->label(),
                'is_link_outage' => $incident->isManualPartial(),
                'duracion' => $incident->started_at?->diffForHumans(now(), true),
                'duration_seconds' => $incident->started_at
                    ? max(0, now()->getTimestamp() - $incident->started_at->getTimestamp())
                    : null,
                'started_at' => $incident->started_at?->toIso8601String(),
                'current_down_started_at' => ($incident->prtg_down_started_at ?? $incident->started_at)?->toIso8601String(),
                'in_management' => $incident->reopened_from_management
                    || ($incident->followup_status && in_array($incident->followup_status->value, FollowupStatus::managingValues(), true)),
                'tracking' => $tracking ? [
                    'id' => $tracking->id,
                    'status' => $tracking->status?->value,
                    'status_label' => $tracking->status?->label(),
                    'ticket' => $tracking->report_ticket ?? $tracking->ticket,
                ] : null,
                'followup_status' => $incident->followup_status?->value,
                'management_classification' => $incident->management_classification?->value,
                'management_classification_label' => $incident->management_classification?->label(),
                'color_key' => $incident->management_classification?->colorKey(),
                'outage_text' => $incident->outage_text,
                'detail_text' => $incident->detail_text,
                'management_scope' => $incident->management_scope?->value,
                'last_check' => $sensor?->last_check?->toIso8601String(),
                'contacto' => $contact?->name,
                'telefono' => $contact?->phone,
                'contacto_corto' => $this->shortContactName($contact),
                'telefono_masked' => $contact?->phone,
                'reincidente_count' => $reincidenteCount,
                'reincidente' => $reincidenteCount > 1,
                'glpi_ticket' => $incident->glpi_ticket,
                'responsible_area' => $incident->responsible_area,
                'reopened_from_management' => (bool) $incident->reopened_from_management,
            ];
        });
    }

    /**
     * Concentraciones por provincia > distrito PRTG (estilo NOC operativo).
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
            $location = PrtgOperationalLocation::resolve(
                $incident->networkAssignment,
                $incident->school,
            );
            $provincia = $location['province'] ?? 'SIN PROVINCIA';
            $distrito = $location['district'] ?? 'SIN DISTRITO';
            $key = mb_strtoupper($provincia).'|'.mb_strtoupper($distrito);

            if (! isset($zones[$key])) {
                $zones[$key] = [
                    'dimension' => 'distrito',
                    'provincia' => $provincia,
                    'distrito' => $distrito,
                    'label' => $provincia.' > '.$distrito,
                    'caidos' => 0,
                    'school_ids' => [],
                    'assignment_ids' => [],
                    'nodos' => [],
                    'oldest_started_at' => null,
                ];
            }

            $zones[$key]['caidos']++;
            if ($incident->school_id) {
                $zones[$key]['school_ids'][$incident->school_id] = true;
            }
            if ($incident->network_assignment_id) {
                $zones[$key]['assignment_ids'][$incident->network_assignment_id] = true;
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
            $provincia = (string) $zone['provincia'];
            $distrito = (string) $zone['distrito'];

            $assignmentQuery = NetworkAssignment::query()
                ->where('is_active', true)
                ->where('monitoring_eligible', true)
                ->where('cid_status', CidStatus::Valid);
            $this->constrainAssignmentsByPrtgZone($assignmentQuery, $provincia, $distrito);

            $assignmentIds = (clone $assignmentQuery)->pluck('id');
            $schoolIds = (clone $assignmentQuery)->whereNotNull('school_id')->distinct()->pluck('school_id');
            $total = $schoolIds->count();

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
                'location_source' => 'prtg',
                'caidos' => $caidos,
                'afectados' => $afectados,
                'total' => $total,
                'monitoreados' => $monitored,
                'operativos' => $operativos,
                'sin_monitoreo' => $sinMonitoreo,
                'porcentaje_caidos' => $pct,
                'nodo_pop' => $nodos !== [] ? implode(', ', $nodos) : '—',
                'oldest_started_at' => $zone['oldest_started_at']?->toIso8601String(),
                'nota' => 'Posible concentración operativa PRTG (no implica causa confirmada).',
            ];
        }

        usort($out, fn ($a, $b) => $b['caidos'] <=> $a['caidos']);

        return array_values($out);
    }

    /**
     * @param  \Illuminate\Database\Eloquent\Builder<\App\Models\NetworkAssignment>  $query
     */
    private function constrainAssignmentsByPrtgZone($query, string $provincia, string $distrito): void
    {
        if (mb_strtoupper($provincia) === 'SIN PROVINCIA') {
            $query->where(function ($q) {
                $q->whereNull('prtg_province')->orWhereRaw("TRIM(prtg_province) = ''");
            });
        } else {
            $query->whereRaw('UPPER(TRIM(COALESCE(prtg_province, \'\'))) = ?', [mb_strtoupper($provincia)]);
        }

        if (mb_strtoupper($distrito) === 'SIN DISTRITO') {
            $query->where(function ($q) {
                $q->whereNull('prtg_district')->orWhereRaw("TRIM(prtg_district) = ''");
            });
        } else {
            $query->whereRaw('UPPER(TRIM(COALESCE(prtg_district, \'\'))) = ?', [mb_strtoupper($distrito)]);
        }
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
                'provincia' => PrtgOperationalLocation::province($assignment, $school),
                'distrito' => PrtgOperationalLocation::district($assignment, $school),
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
        $run = SyncCoordinator::lastFinishedRun($source);
        if (! $run) {
            return null;
        }

        // Forma compacta que consume el dashboard principal.
        return [
            'status' => $run['status'],
            'finished_at' => $run['finished_at'],
            'warning_count' => $run['warning_count'],
            'error_count' => $run['error_count'],
            'processed_count' => $run['processed_count'],
        ];
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
