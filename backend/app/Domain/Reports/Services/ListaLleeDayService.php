<?php

namespace App\Domain\Reports\Services;

use App\Domain\Reports\Support\ListaLleeEstadoResolver;
use App\Enums\FollowupStatus;
use App\Enums\ListaLleeEstado;
use App\Models\Incident;
use App\Models\ListaLleeDay;
use App\Models\ListaLleeDayRow;
use App\Support\OperationalTime;
use Illuminate\Support\Facades\DB;

/**
 * Lista de LLEE por día operativo (America/Lima).
 * Hoy se trabaja; días anteriores quedan como historial inmutable salvo sync de PRTG en el día abierto.
 */
class ListaLleeDayService
{
    public function __construct(private readonly OperationalReportService $operational) {}

    /**
     * @return list<string> fechas YYYY-MM-DD (más reciente primero)
     */
    public function availableDates(int $limit = 60): array
    {
        $this->ensureToday();

        return ListaLleeDay::query()
            ->orderByDesc('report_date')
            ->limit($limit)
            ->pluck('report_date')
            ->map(fn ($d) => $d instanceof \DateTimeInterface ? $d->format('Y-m-d') : (string) $d)
            ->values()
            ->all();
    }

    public function todayDate(): string
    {
        return OperationalTime::now()->toDateString();
    }

    public function isToday(string $date): bool
    {
        return $date === $this->todayDate();
    }

    public function ensureToday(): ListaLleeDay
    {
        $today = $this->todayDate();

        $existing = ListaLleeDay::query()->whereDate('report_date', $today)->first();
        if ($existing) {
            $this->syncLiveRows($existing);

            return $existing->fresh(['rows']) ?? $existing;
        }

        return DB::transaction(function () use ($today) {
            $day = ListaLleeDay::query()->create(['report_date' => $today]);
            $yesterday = ListaLleeDay::query()
                ->whereDate('report_date', '<', $today)
                ->orderByDesc('report_date')
                ->first();

            if ($yesterday) {
                $this->seedFromPreviousDay($day, $yesterday);
            }

            $this->syncLiveRows($day);

            return $day->fresh(['rows']) ?? $day;
        });
    }

    /**
     * @param  array<string, mixed>  $filters
     * @return array<string, mixed>
     */
    public function reportForDate(string $date, array $filters = []): array
    {
        $day = $this->isToday($date)
            ? $this->ensureToday()
            : ListaLleeDay::query()->whereDate('report_date', $date)->first();

        if ($day === null) {
            return [
                'rows' => [],
                'total' => 0,
                'report_date' => $date,
                'is_today' => false,
                'available_dates' => $this->availableDates(),
                'legend' => $this->legend(),
                'lista_estados' => $this->listaEstados(),
                'zonas' => [],
                'columns' => OperationalReportService::officialColumns(),
                'filters_applied' => $filters,
                'resumen_prtg' => $this->operational->buildResumenPrtg([]),
            ];
        }

        if ($this->isToday($date)) {
            $this->syncLiveRows($day);
            $day = $day->fresh(['rows']) ?? $day;
        }

        $day->loadMissing([
            'rows.incident.school',
            'rows.incident.networkAssignment',
            'rows.incident.sensor',
            'rows.incident.managements' => fn ($q) => $q->orderByDesc('id'),
        ]);

        $rows = $day->rows->map(fn (ListaLleeDayRow $row) => $this->rowToArray($row))->values()->all();

        if (! empty($filters['technology'])) {
            $tech = mb_strtoupper(trim((string) $filters['technology']));
            $rows = array_values(array_filter(
                $rows,
                fn (array $row) => mb_strtoupper((string) ($row['tipo'] ?? $row['technology_type'] ?? '')) === $tech
            ));
        }

        if (! empty($filters['zona'])) {
            $zona = mb_strtoupper(trim((string) $filters['zona']));
            $rows = array_values(array_filter(
                $rows,
                fn (array $row) => mb_strtoupper((string) ($row['zona'] ?? '')) === $zona
            ));
        }

        $resumenRows = $rows;
        if (! empty($filters['lista_estado'])) {
            $wanted = (string) $filters['lista_estado'];
            $rows = array_values(array_filter(
                $rows,
                fn (array $row) => ($row['lista_estado'] ?? null) === $wanted
            ));
        }

        if (! empty($filters['search'])) {
            $raw = (string) $filters['search'];
            $rows = array_values(array_filter(
                $rows,
                fn (array $row) => \App\Support\CidTssSearch::matchesRowCidTss($row, $raw)
            ));
        }

        if (! empty($filters['province'])) {
            $p = mb_strtoupper(trim((string) $filters['province']));
            $rows = array_values(array_filter(
                $rows,
                fn (array $row) => mb_strtoupper((string) ($row['provincia'] ?? '')) === $p
            ));
        }

        if (! empty($filters['district'])) {
            $d = mb_strtoupper(trim((string) $filters['district']));
            $rows = array_values(array_filter(
                $rows,
                fn (array $row) => mb_strtoupper((string) ($row['distrito'] ?? '')) === $d
            ));
        }

        usort($rows, function (array $a, array $b): int {
            $rank = ListaLleeEstado::listSortRank($a['lista_estado'] ?? null)
                <=> ListaLleeEstado::listSortRank($b['lista_estado'] ?? null);
            if ($rank !== 0) {
                return $rank;
            }

            $byPrtg = ListaLleeEstadoResolver::prtgSortRank($a['estado_prtg'] ?? null)
                <=> ListaLleeEstadoResolver::prtgSortRank($b['estado_prtg'] ?? null);
            if ($byPrtg !== 0) {
                return $byPrtg;
            }

            $caida = strcmp((string) ($a['caida'] ?? ''), (string) ($b['caida'] ?? ''));
            if ($caida !== 0) {
                return $caida;
            }

            return strcmp((string) ($a['cid'] ?? ''), (string) ($b['cid'] ?? ''));
        });

        $zonas = collect($resumenRows)
            ->pluck('zona')
            ->filter(fn ($z) => is_string($z) && trim($z) !== '')
            ->unique()
            ->sort()
            ->values()
            ->all();

        return [
            'rows' => $rows,
            'total' => count($rows),
            'report_date' => $date,
            'is_today' => $this->isToday($date),
            'available_dates' => $this->availableDates(),
            'legend' => $this->legend(),
            'lista_estados' => $this->listaEstados(),
            'zonas' => $zonas,
            'columns' => OperationalReportService::officialColumns(),
            'filters_applied' => $filters + ['day' => $date],
            'resumen_prtg' => $this->operational->buildResumenPrtg($resumenRows),
        ];
    }

    /**
     * Filas del informe final / Excel:
     * - Sin Activo ni Restablecido.
     * - Solo caídos en PRTG (✖), excepto Averías (incluye ✔ y ✖).
     */
    public function exportRowsForDate(?string $date = null): array
    {
        $date ??= $this->todayDate();
        $payload = $this->reportForDate($date, []);
        $skip = [
            ListaLleeEstado::Activo->value,
            ListaLleeEstado::Restablecido->value,
        ];

        return array_values(array_filter(
            $payload['rows'],
            function (array $row) use ($skip): bool {
                $estado = (string) ($row['lista_estado'] ?? '');
                if ($estado === '' || in_array($estado, $skip, true)) {
                    return false;
                }
                if ($estado === ListaLleeEstado::Averias->value) {
                    return true;
                }

                return ($row['estado_prtg'] ?? '') !== '✔';
            }
        ));
    }

    /** Activo = caída normal / pendiente de cierre ya cerrada (PRTG arriba). */
    public function markActivo(Incident $incident): void
    {
        $this->setEstado($incident, ListaLleeEstado::Activo);
    }

    public function setEstado(Incident $incident, ListaLleeEstado $estado): void
    {
        $incident->lista_llee_estado = $estado;
        $incident->save();

        $day = $this->ensureToday();
        $row = ListaLleeDayRow::query()->firstOrNew([
            'lista_llee_day_id' => $day->id,
            'incident_id' => $incident->id,
        ]);
        $this->fillRowFromIncident($row, $incident, $estado);
        $row->lista_estado = $estado;
        $row->save();
        // Un colegio / CID por día: evita doble fila si se marcó incidencia duplicada.
        $this->dedupeDayRowsByCid($day);
    }

    public function setDetalle(Incident $incident, ?string $detalle): void
    {
        $clean = trim((string) $detalle);
        $incident->lista_detalle = $clean !== '' ? $clean : null;
        $incident->save();

        $day = $this->ensureToday();
        $row = ListaLleeDayRow::query()->firstOrNew([
            'lista_llee_day_id' => $day->id,
            'incident_id' => $incident->id,
        ]);
        $this->fillRowFromIncident($row, $incident, $incident->lista_llee_estado instanceof ListaLleeEstado
            ? $incident->lista_llee_estado
            : null);
        $row->detalle = $incident->lista_detalle;
        $row->save();
    }

    public function markAverias(Incident $incident): void
    {
        $this->setEstado($incident, ListaLleeEstado::Averias);
    }

    /** Auto ESTADO cuando la razón MINEDU es Requerimiento. */
    public function markRequerimiento(Incident $incident): void
    {
        $this->setEstado($incident, ListaLleeEstado::Requerimiento);
    }

    /**
     * Restablecido = cierre formal desde Incidencias (Averías → cerrado).
     * No aplica a recuperaciones PRTG ni a cierres de caídas normales.
     */
    public function markRestablecido(Incident $incident): void
    {
        $this->setEstado($incident, ListaLleeEstado::Restablecido);
    }

    /**
     * Quita Restablecido mal asignados (cierres normales / solo operativo).
     * Conserva solo los que tienen incidencia grave cerrada.
     *
     * @return int filas limpiadas
     */
    public function clearInvalidRestablecido(?string $date = null): int
    {
        $date ??= $this->todayDate();
        $day = ListaLleeDay::query()->whereDate('report_date', $date)->first();
        if ($day === null) {
            return 0;
        }

        $rows = ListaLleeDayRow::query()
            ->where('lista_llee_day_id', $day->id)
            ->where('lista_estado', ListaLleeEstado::Restablecido->value)
            ->with('incident')
            ->get();

        $cleared = 0;
        foreach ($rows as $row) {
            $incident = $row->incident;
            $validGraveClose = $incident
                && (bool) $incident->is_grave_incident
                && $incident->grave_closed_at !== null;
            if ($validGraveClose) {
                continue;
            }

            $row->lista_estado = null;
            $row->save();
            if ($incident && $incident->lista_llee_estado === ListaLleeEstado::Restablecido) {
                $incident->lista_llee_estado = null;
                $incident->save();
            }
            $cleared++;
        }

        return $cleared;
    }

    private function seedFromPreviousDay(ListaLleeDay $today, ListaLleeDay $yesterday): void
    {
        $yesterday->loadMissing('rows');
        $skip = [
            ListaLleeEstado::Activo->value,
            ListaLleeEstado::Restablecido->value,
        ];

        foreach ($yesterday->rows as $prev) {
            $estadoValue = $prev->lista_estado instanceof ListaLleeEstado
                ? $prev->lista_estado->value
                : (string) ($prev->lista_estado ?? '');
            if (in_array($estadoValue, $skip, true)) {
                continue;
            }

            $incident = Incident::query()
                ->with(['school', 'networkAssignment', 'sensor', 'managements' => fn ($q) => $q->orderByDesc('id')])
                ->find($prev->incident_id);
            if ($incident === null) {
                continue;
            }

            // Solo arrastra si sigue abierto (caído o incidencia abierta).
            if ($incident->recovered_at !== null && ! $incident->isOpenGrave()) {
                continue;
            }

            $row = new ListaLleeDayRow([
                'lista_llee_day_id' => $today->id,
                'incident_id' => $incident->id,
            ]);
            $this->fillRowFromIncident(
                $row,
                $incident,
                $prev->lista_estado instanceof ListaLleeEstado ? $prev->lista_estado : null
            );
            // Detalle del día nuevo: vacío (se gestiona de cero); estado sí puede heredar.
            $row->detalle = null;
            if ($incident->isOpenGrave()) {
                $row->lista_estado = ListaLleeEstado::Averias;
                $incident->lista_llee_estado = ListaLleeEstado::Averias;
                $incident->lista_detalle = null;
                $incident->save();
            } elseif ($incident->isOpenRequirement()) {
                $row->lista_estado = ListaLleeEstado::Requerimiento;
                $incident->lista_llee_estado = ListaLleeEstado::Requerimiento;
                $incident->lista_detalle = null;
                $incident->save();
            }
            $row->save();
        }
    }

    private function syncLiveRows(ListaLleeDay $day): void
    {
        $incidents = $this->operational->baseQuery(['active_only' => true])
            ->with(['school', 'networkAssignment', 'sensor', 'managements' => fn ($q) => $q->orderByDesc('id')])
            ->get();

        $existing = ListaLleeDayRow::query()
            ->where('lista_llee_day_id', $day->id)
            ->get()
            ->keyBy('incident_id');

        $activeIds = [];
        foreach ($incidents as $incident) {
            $activeIds[] = (int) $incident->id;

            /** @var ListaLleeDayRow $row */
            $row = $existing->get($incident->id) ?? new ListaLleeDayRow([
                'lista_llee_day_id' => $day->id,
                'incident_id' => $incident->id,
            ]);

            // Prioridad: opción desde gestión / incidente. Manual del día solo si aún no hay estado.
            $estado = $incident->lista_llee_estado instanceof ListaLleeEstado
                ? $incident->lista_llee_estado
                : ($row->lista_estado instanceof ListaLleeEstado ? $row->lista_estado : null);

            if ($incident->isOpenGrave() && ($estado === null || $estado === ListaLleeEstado::DescartesEnCurso)) {
                $estado = ListaLleeEstado::Averias;
                if ($incident->lista_llee_estado !== ListaLleeEstado::Averias) {
                    $incident->lista_llee_estado = ListaLleeEstado::Averias;
                    $incident->save();
                }
            } elseif ($incident->isOpenRequirement() && $this->shouldAutoMarkRequerimiento($estado)) {
                $estado = ListaLleeEstado::Requerimiento;
                if ($incident->lista_llee_estado !== ListaLleeEstado::Requerimiento) {
                    $incident->lista_llee_estado = ListaLleeEstado::Requerimiento;
                    $incident->save();
                }
            }

            $keepDetalle = $row->exists ? $row->detalle : ($incident->lista_detalle ?: null);
            $this->fillRowFromIncident($row, $incident, $estado);
            $row->detalle = $keepDetalle;
            $row->lista_estado = $estado;
            $row->save();
        }

        // Filas recuperadas del día: refrescar PRTG + ESTADO desde el incidente (Refrescar).
        $this->refreshStaleDayRows($day, $activeIds);

        // Si ya hay caída activa del CID, no dejar la recuperada tapando el ESTADO de gestión.
        $this->pruneRecoveredRowsWhenActiveExists($day, $activeIds);
        $this->dedupeDayRowsByCid($day);
    }

    /**
     * Actualiza filas del día que no entraron en el sync de activos (p. ej. recuperadas),
     * para que Refrescar mueva ESTADO/PRTG según la gestión del incidente.
     *
     * @param  list<int>  $activeIncidentIds
     */
    private function refreshStaleDayRows(ListaLleeDay $day, array $activeIncidentIds): void
    {
        $rows = ListaLleeDayRow::query()
            ->where('lista_llee_day_id', $day->id)
            ->when($activeIncidentIds !== [], fn ($q) => $q->whereNotIn('incident_id', $activeIncidentIds))
            ->with([
                'incident.school',
                'incident.networkAssignment',
                'incident.sensor',
                'incident.managements' => fn ($q) => $q->orderByDesc('id'),
            ])
            ->get();

        foreach ($rows as $row) {
            $incident = $row->incident;
            if ($incident === null) {
                continue;
            }

            $estado = $incident->lista_llee_estado instanceof ListaLleeEstado
                ? $incident->lista_llee_estado
                : ($row->lista_estado instanceof ListaLleeEstado ? $row->lista_estado : null);

            $keepDetalle = $row->detalle;
            $this->fillRowFromIncident($row, $incident, $estado);
            $row->detalle = $keepDetalle;
            $row->lista_estado = $estado;
            $row->save();
        }
    }

    /**
     * Quita filas recuperadas del día cuando ya existe otra caída activa del mismo CID.
     * Evita que un "Descartes…" viejo tape el ESTADO puesto en gestión de la nueva caída.
     *
     * @param  list<int>  $activeIncidentIds
     */
    private function pruneRecoveredRowsWhenActiveExists(ListaLleeDay $day, array $activeIncidentIds): void
    {
        if ($activeIncidentIds === []) {
            return;
        }

        $activeCids = ListaLleeDayRow::query()
            ->where('lista_llee_day_id', $day->id)
            ->whereIn('incident_id', $activeIncidentIds)
            ->whereNotNull('cid')
            ->where('cid', '!=', '')
            ->pluck('cid')
            ->map(fn ($cid) => (string) $cid)
            ->unique()
            ->values()
            ->all();

        if ($activeCids === []) {
            return;
        }

        $candidates = ListaLleeDayRow::query()
            ->where('lista_llee_day_id', $day->id)
            ->whereIn('cid', $activeCids)
            ->whereNotIn('incident_id', $activeIncidentIds)
            ->with('incident')
            ->get();

        foreach ($candidates as $row) {
            $incident = $row->incident;
            if ($incident === null) {
                $row->delete();
                continue;
            }
            if ($incident->recovered_at === null) {
                continue;
            }
            if ($incident->isOpenGrave() || $incident->isOpenRequirement() || $incident->isOpenMaintenance()) {
                continue;
            }
            $row->delete();
        }
    }

    /**
     * Una fila por CID en el día. Si hubo incidencia duplicada (mismo colegio),
     * se conserva la más completa / abierta y se elimina la otra.
     */
    private function dedupeDayRowsByCid(ListaLleeDay $day): void
    {
        $groups = ListaLleeDayRow::query()
            ->where('lista_llee_day_id', $day->id)
            ->whereNotNull('cid')
            ->where('cid', '!=', '')
            ->with('incident')
            ->orderBy('id')
            ->get()
            ->groupBy(fn (ListaLleeDayRow $row) => (string) $row->cid);

        foreach ($groups as $group) {
            if ($group->count() < 2) {
                continue;
            }

            $sorted = $group->sort(function (ListaLleeDayRow $a, ListaLleeDayRow $b): int {
                $score = function (ListaLleeDayRow $row): array {
                    $incident = $row->incident;
                    $points = 0;
                    $started = 0;
                    if ($incident !== null) {
                        // Sticky abierto (aunque PRTG ya subió) gana a una caída paralela del CID.
                        if ($incident->isOpenGrave()) {
                            $points += 10000;
                        }
                        if ($incident->isOpenRequirement()) {
                            $points += 9000;
                        }
                        if ($incident->isOpenMaintenance()) {
                            $points += 8000;
                        }
                        // Caída aún abierta gana a una recuperada no-sticky del mismo CID.
                        if ($incident->recovered_at === null) {
                            $points += 5000;
                        }
                        if ($incident->followup_status !== FollowupStatus::Cerrado) {
                            $points += 200;
                        }
                        $started = $incident->started_at?->getTimestamp() ?? 0;
                    }
                    if (filled($row->root_cause_code)) {
                        $points += 50;
                    }
                    if (filled($row->detalle)) {
                        $points += 20;
                    }
                    if ($row->lista_estado === ListaLleeEstado::Averias
                        || $row->lista_estado === ListaLleeEstado::Averias->value) {
                        $points += 10;
                    }

                    return [$points, $started, (int) $row->id];
                };

                return $score($b) <=> $score($a);
            })->values();

            $keepId = (int) $sorted->first()->id;
            foreach ($sorted as $row) {
                if ((int) $row->id === $keepId) {
                    continue;
                }
                $row->delete();
            }
        }
    }

    private function fillRowFromIncident(ListaLleeDayRow $row, Incident $incident, ?ListaLleeEstado $estado): void
    {
        $mapped = $this->operational->mapRow($incident, 0);
        $row->tss = is_numeric($mapped['n'] ?? null) ? (int) $mapped['n'] : null;
        $row->cid = $mapped['cid'] ?? null;
        $row->local_educativo = $mapped['local_educativo'] ?? null;
        $row->presentacion_nombre_prtg = $mapped['presentacion_nombre_prtg'] ?? null;
        $row->estado_prtg = $mapped['estado_prtg'] ?? null;
        $row->lista_estado = $estado;
        $row->root_cause_code = $mapped['root_cause_code'] ?? null;
        $row->root_cause = $mapped['root_cause'] ?? null;
        $row->outage_at = $incident->started_at;
        $row->caida = $mapped['caida'] ?? null;
        $row->provincia = $mapped['provincia'] ?? null;
        $row->distrito = $mapped['distrito'] ?? null;
        $row->zona = $mapped['zona'] ?? null;
        $row->color_key = $mapped['color_key'] ?? null;
    }

    /**
     * @return array<string, mixed>
     */
    private function rowToArray(ListaLleeDayRow $row): array
    {
        $estado = $row->lista_estado instanceof ListaLleeEstado ? $row->lista_estado : null;
        $base = $row->incident
            ? $this->operational->mapRow($row->incident, (int) $row->id)
            : [
                'n' => $row->tss,
                'ordinal' => $row->id,
                'incident_id' => $row->incident_id,
                'cid' => $row->cid,
                'local_educativo' => $row->local_educativo,
                'presentacion_nombre_prtg' => $row->presentacion_nombre_prtg,
                'estado_prtg' => $row->estado_prtg,
                'root_cause_code' => $row->root_cause_code,
                'root_cause' => $row->root_cause,
                'outage_at' => $row->outage_at?->toIso8601String(),
                'caida' => $row->caida,
                'provincia' => $row->provincia,
                'distrito' => $row->distrito,
                'zona' => $row->zona,
                'color_key' => $row->color_key,
                'tipo' => null,
                'technology_type' => null,
            ];

        // ESTADO y DETALLE del día (congelados en historial; editables hoy).
        $base['lista_estado'] = $estado?->value;
        $base['lista_estado_tone'] = $estado?->tone();
        $base['lista_estado_group'] = $estado?->group();
        $dayDetalle = trim((string) ($row->detalle ?? ''));
        $base['detalle'] = $dayDetalle !== ''
            ? $dayDetalle
            : ($base['detalle'] ?? $row->incident?->lista_detalle);
        $base['activa'] = $estado !== ListaLleeEstado::Restablecido && $estado !== ListaLleeEstado::Activo;

        return $base;
    }

    /**
     * Autocompleta Requerimiento solo si aún no hay estado operativo manual,
     * o si quedó Averías/Descartes al pasar de Incidencias a Requerimientos.
     */
    private function shouldAutoMarkRequerimiento(?ListaLleeEstado $estado): bool
    {
        return $estado === null
            || $estado === ListaLleeEstado::Averias
            || $estado === ListaLleeEstado::DescartesEnCurso;
    }

    /**
     * @return list<array{key: string, color: string, label: string}>
     */
    private function legend(): array
    {
        return collect(ListaLleeEstado::legendOrder())->map(fn (ListaLleeEstado $e) => [
            'key' => $e->value,
            'color' => $e->tone(),
            'label' => $e->value,
        ])->values()->all();
    }

    /**
     * @return list<array{value: string, label: string, group: string, tone: string}>
     */
    private function listaEstados(): array
    {
        return collect(ListaLleeEstado::legendOrder())->map(fn (ListaLleeEstado $e) => [
            'value' => $e->value,
            'label' => $e->value,
            'group' => $e->group(),
            'tone' => $e->tone(),
        ])->values()->all();
    }
}
