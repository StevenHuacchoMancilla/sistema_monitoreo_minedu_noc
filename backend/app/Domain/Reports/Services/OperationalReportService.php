<?php

namespace App\Domain\Reports\Services;

use App\Domain\Incidents\Support\RootCauseLegend;
use App\Domain\Monitoring\PRTG\Support\PrtgOperationalLocation;
use App\Domain\Reports\Support\ListaLleeEstadoResolver;
use App\Enums\ListaLleeEstado;
use App\Enums\ManagementClassification;
use App\Enums\ManagementScope;
use App\Enums\RecoveryReviewStatus;
use App\Models\Incident;
use App\Support\OperationalTime;
use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;

class OperationalReportService
{
    /**
     * @param  array{
     *   classification?: ?string,
     *   province?: ?string,
     *   district?: ?string,
     *   scope?: ?string,
     *   technology?: ?string,
     *   search?: ?string,
     *   active_only?: bool,
     *   lista_estado?: ?string
     * }  $filters
     * @return array{rows: list<array<string, mixed>>, total: int, legend: list<array<string, string>>, resumen_prtg: array<string, mixed>}
     */
    public function list(array $filters = []): array
    {
        $query = $this->baseQuery($filters);
        $incidents = $query->get();

        $rows = $incidents->values()->map(fn (Incident $incident, int $index) => $this->mapRow($incident, $index + 1))->all();

        // Resumen usa todas las filas (salvo filtro de zona); la lista puede acotar por ESTADO.
        $resumenRows = $rows;
        if (! empty($filters['zona'])) {
            $zona = mb_strtoupper(trim((string) $filters['zona']));
            $resumenRows = array_values(array_filter(
                $resumenRows,
                fn (array $row) => mb_strtoupper((string) ($row['zona'] ?? '')) === $zona
            ));
        }

        $listRows = $resumenRows;
        if (! empty($filters['lista_estado'])) {
            $wanted = (string) $filters['lista_estado'];
            $listRows = array_values(array_filter(
                $listRows,
                fn (array $row) => ($row['lista_estado'] ?? null) === $wanted
            ));
        }

        usort($listRows, function (array $a, array $b): int {
            $rank = ListaLleeEstado::listSortRank($a['lista_estado'] ?? null)
                <=> ListaLleeEstado::listSortRank($b['lista_estado'] ?? null);
            if ($rank !== 0) {
                return $rank;
            }

            $caida = strcmp((string) ($a['caida'] ?? ''), (string) ($b['caida'] ?? ''));
            if ($caida !== 0) {
                return $caida;
            }

            return strcmp((string) ($a['cid'] ?? ''), (string) ($b['cid'] ?? ''));
        });

        $zonas = collect($rows)
            ->pluck('zona')
            ->filter(fn ($z) => is_string($z) && trim($z) !== '')
            ->unique()
            ->sort()
            ->values()
            ->all();

        return [
            'rows' => $listRows,
            'total' => count($listRows),
            'legend' => collect(ListaLleeEstado::legendOrder())->map(fn (ListaLleeEstado $e) => [
                'key' => $e->value,
                'color' => $e->tone(),
                'label' => $e->value,
            ])->values()->all(),
            'filters_applied' => $filters,
            'columns' => self::officialColumns(),
            'lista_estados' => collect(ListaLleeEstado::legendOrder())->map(fn (ListaLleeEstado $e) => [
                'value' => $e->value,
                'label' => $e->value,
                'group' => $e->group(),
                'tone' => $e->tone(),
            ])->values()->all(),
            'zonas' => $zonas,
            'resumen_prtg' => $this->buildResumenPrtg($resumenRows),
        ];
    }

    /**
     * Columnas del reporte LISTA DE LLEE: desde TSS hasta ZONA (sin PEXT/PINT).
     *
     * @return list<string>
     */
    public static function officialColumns(): array
    {
        return [
            'TSS',
            'CID',
            'LOCAL EDUCATIVO',
            'PRESENTACION NOMBRE PRTG',
            'ESTADO PRTG',
            'ESTADO',
            'CODIGO',
            'CAUSA RAIZ',
            'CAÍDA',
            'DETALLE',
            'PROVINCIA',
            'DISTRITO',
            'ZONA',
        ];
    }

    /**
     * @param  array<string, mixed>  $filters
     */
    public function baseQuery(array $filters): Builder
    {
        $activeOnly = array_key_exists('active_only', $filters) ? (bool) $filters['active_only'] : true;

        $query = Incident::query()
            ->with([
                'school',
                'networkAssignment',
                'sensor',
                'managements' => fn ($q) => $q->orderByDesc('id'),
            ])
            ->when($activeOnly, function (Builder $q) {
                $q->where(function (Builder $inner) {
                    // Amarillo: caída todavía activa. Rojo: incidencia grave abierta aunque PRTG ya subió.
                    $inner->whereNull('recovered_at')
                        ->orWhere('recovery_review_status', RecoveryReviewStatus::ContinueMonitoring->value)
                        ->orWhere(function (Builder $grave) {
                            $grave->where('is_grave_incident', true)->whereNull('grave_closed_at');
                        });
                });
            })
            ->whereNotNull('management_classification')
            ->where('management_classification', '!=', ManagementClassification::Unclassified->value)
            ->orderByRaw('CASE WHEN is_grave_incident = true AND grave_closed_at IS NULL THEN 0 ELSE 1 END')
            ->orderBy('started_at');

        if (! empty($filters['classification'])) {
            $query->where('management_classification', (string) $filters['classification']);
        }

        if (! empty($filters['scope'])) {
            $query->where('management_scope', (string) $filters['scope']);
        }

        if (! empty($filters['technology'])) {
            $tech = $this->normalizeTechnology((string) $filters['technology']);
            if ($tech !== null) {
                $query->whereHas('networkAssignment', function (Builder $a) use ($tech) {
                    $a->whereRaw('UPPER(TRIM(COALESCE(tecnologia_acceso, \'\'))) = ?', [$tech]);
                });
            }
        }

        if (! empty($filters['province']) || ! empty($filters['district'])) {
            PrtgOperationalLocation::constrainByAssignment(
                $query,
                isset($filters['province']) ? (string) $filters['province'] : null,
                isset($filters['district']) ? (string) $filters['district'] : null,
            );
        }

        if (! empty($filters['search'])) {
            $term = '%'.mb_strtolower(trim((string) $filters['search'])).'%';
            $query->where(function (Builder $q) use ($term) {
                $q->whereHas('school', function (Builder $s) use ($term) {
                    $s->whereRaw('LOWER(local_educativo) like ?', [$term])
                        ->orWhereRaw('LOWER(codigo_local) like ?', [$term]);
                })->orWhereHas('networkAssignment', function (Builder $a) use ($term) {
                    $a->whereRaw('LOWER(cid) like ?', [$term])
                        ->orWhereRaw('LOWER(COALESCE(prtg_device_name, \'\')) like ?', [$term])
                        ->orWhereRaw('LOWER(COALESCE(prtg_province, \'\')) like ?', [$term])
                        ->orWhereRaw('LOWER(COALESCE(prtg_district, \'\')) like ?', [$term]);
                });
            });
        }

        return $query;
    }

    /**
     * Fila canónica compartida por operativo, preview y XLSX.
     *
     * @return array<string, mixed>
     */
    public function mapRow(Incident $incident, int $ordinal): array
    {
        $school = $incident->school;
        $assignment = $incident->networkAssignment;
        $classification = $incident->management_classification;
        $snapshotSchool = is_array($incident->school_snapshot) ? $incident->school_snapshot : [];
        $snapshotNet = is_array($incident->network_snapshot) ? $incident->network_snapshot : [];

        $nombrePrtg = (string) ($assignment?->prtg_device_name ?? '');
        if ($nombrePrtg === '' || str_starts_with($nombrePrtg, '=')) {
            $nombrePrtg = (string) ($incident->sensor?->device_name ?? ($snapshotNet['prtg_device_name'] ?? ''));
        }

        $rawTech = (string) ($assignment?->tecnologia_acceso
            ?? ($snapshotNet['tecnologia_acceso'] ?? ''));
        $tipo = $this->normalizeTechnology($rawTech);

        $outageAt = $incident->started_at;
        $caida = $outageAt instanceof CarbonInterface
            ? \App\Support\OperationalTime::format($outageAt, 'd/m/Y H:i')
            : (filled($incident->outage_text) ? (string) $incident->outage_text : null);

        $snapshotProvince = is_string($snapshotSchool['provincia'] ?? null)
            ? PrtgOperationalLocation::clean($snapshotSchool['provincia'])
            : null;
        $snapshotDistrict = is_string($snapshotSchool['distrito'] ?? null)
            ? PrtgOperationalLocation::clean($snapshotSchool['distrito'])
            : null;
        $apiLocation = PrtgOperationalLocation::apiFields($assignment, $school);

        // DETALLE = solo lo que escribió el operador (con hora). Sin códigos ni causa raíz.
        $detail = filled($incident->lista_detalle)
            ? (string) $incident->lista_detalle
            : $this->operatorDetailOnly($incident);

        $listaEstado = ListaLleeEstadoResolver::resolve($incident);
        $provincia = $apiLocation['provincia'] ?? $snapshotProvince;
        $distrito = $apiLocation['distrito'] ?? $snapshotDistrict;
        $rootCode = $incident->root_cause_code ? strtoupper(trim((string) $incident->root_cause_code)) : null;
        $legendCause = $rootCode ? (RootCauseLegend::findByCode($rootCode)['cause'] ?? null) : null;
        $rootCause = trim((string) ($incident->cause ?: $legendCause)) ?: null;

        return [
            'n' => $school?->current_sequence,
            'ordinal' => $ordinal,
            'incident_id' => $incident->id,
            'cid' => $assignment?->cid ?? ($snapshotNet['cid'] ?? null),
            'local_educativo' => $school?->local_educativo ?? ($snapshotSchool['local_educativo'] ?? null),
            'presentacion_nombre_prtg' => $nombrePrtg !== '' ? $nombrePrtg : null,
            'estado_prtg' => ListaLleeEstadoResolver::prtgMark($incident),
            'lista_estado' => $listaEstado?->value,
            'lista_estado_tone' => $listaEstado?->tone(),
            'lista_estado_group' => $listaEstado?->group(),
            'root_cause_code' => $rootCode,
            'root_cause' => $rootCause,
            'outage_at' => $outageAt?->toIso8601String(),
            'caida' => $caida,
            'caida_source' => $outageAt ? 'started_at' : (filled($incident->outage_text) ? 'outage_text_legacy' : null),
            'tipo' => $tipo,
            'technology_type' => $tipo,
            'detalle' => $detail,
            'detection_source' => $incident->detection_source,
            'affected_wan_node' => $incident->affected_wan_node?->value,
            'is_link_outage' => $incident->isManualPartial(),
            'pext_pint' => $incident->management_scope?->value,
            'provincia' => $provincia,
            'distrito' => $distrito,
            'zona' => ListaLleeEstadoResolver::zona(
                is_string($provincia) ? $provincia : null,
                is_string($distrito) ? $distrito : null,
            ),
            'prtg_province' => $apiLocation['prtg_province'],
            'prtg_district' => $apiLocation['prtg_district'],
            'admin_provincia' => $apiLocation['admin_provincia'] ?? $snapshotProvince,
            'admin_distrito' => $apiLocation['admin_distrito'] ?? $snapshotDistrict,
            'location_source' => $apiLocation['location_source'],
            'location_mismatch' => $apiLocation['location_mismatch'],
            'codigo_local' => $school?->codigo_local ?? ($snapshotSchool['codigo_local'] ?? null),
            'clasificacion' => $school?->clasificacion,
            'ambito' => $school?->ambito,
            'energy_type' => $school?->energy_type,
            'implementation_zone' => $school?->implementation_zone,
            'installation_type' => $school?->installation_type,
            'capacidad' => $assignment?->capacidad_mbps,
            'management_classification' => $classification?->value,
            'management_classification_label' => $classification?->label(),
            'minedu_reason' => $incident->minedu_reason instanceof \App\Enums\MineduReason
                ? $incident->minedu_reason->value
                : $incident->minedu_reason,
            'color_key' => $incident->isOpenGrave()
                ? 'red'
                : ($incident->recovered_at === null ? 'yellow' : ($classification?->colorKey() ?? 'yellow')),
            'followup_status' => $incident->followup_status?->value,
            'started_at' => $incident->started_at?->toIso8601String(),
            'recovered_at' => $incident->recovered_at?->toIso8601String(),
            'activa' => $incident->recovered_at === null,
        ];
    }

    /**
     * Tablero RESUMEN PRTG (hoja del Excel LISTA DE LLEE).
     *
     * @param  list<array<string, mixed>>  $rows
     * @return array{
     *   date: string,
     *   groups: list<array<string, mixed>>,
     *   by_root_cause: list<array<string, mixed>>,
     *   totals: array{up: int, down: int, all: int}
     * }
     */
    public function buildResumenPrtg(array $rows): array
    {
        $byEstado = [];
        foreach (ListaLleeEstado::resumenOrder() as $estado) {
            $byEstado[$estado->value] = [
                'estado' => $estado->value,
                'group' => $estado->group(),
                'tone' => $estado->tone(),
                'up' => 0,
                'down' => 0,
                'total' => 0,
                'cids_up' => [],
                'cids_down' => [],
            ];
        }

        $byCode = [];
        foreach ($rows as $row) {
            $estado = (string) ($row['lista_estado'] ?? '');
            if ($estado === '' || $estado === ListaLleeEstado::Activo->value) {
                continue;
            }
            if (! isset($byEstado[$estado])) {
                $byEstado[$estado] = [
                    'estado' => $estado,
                    'group' => '',
                    'tone' => 'slate',
                    'up' => 0,
                    'down' => 0,
                    'total' => 0,
                    'cids_up' => [],
                    'cids_down' => [],
                ];
            }
            $up = ($row['estado_prtg'] ?? '') === '✔';
            $cid = (string) ($row['cid'] ?? $row['incident_id'] ?? '');
            if ($up) {
                $byEstado[$estado]['up']++;
                if ($cid !== '') {
                    $byEstado[$estado]['cids_up'][] = $cid;
                }
            } else {
                $byEstado[$estado]['down']++;
                if ($cid !== '') {
                    $byEstado[$estado]['cids_down'][] = $cid;
                }
            }
            $byEstado[$estado]['total']++;

            $code = (string) ($row['root_cause_code'] ?? '');
            if ($code === '') {
                continue;
            }
            $codeKey = $estado.'|'.$code;
            if (! isset($byCode[$codeKey])) {
                $byCode[$codeKey] = [
                    'code' => $code,
                    'cause' => (string) ($row['root_cause'] ?? $code),
                    'estado' => $estado,
                    'up' => 0,
                    'down' => 0,
                    'total' => 0,
                    'cids_up' => [],
                    'cids_down' => [],
                ];
            }
            if ($up) {
                $byCode[$codeKey]['up']++;
                if ($cid !== '') {
                    $byCode[$codeKey]['cids_up'][] = $cid;
                }
            } else {
                $byCode[$codeKey]['down']++;
                if ($cid !== '') {
                    $byCode[$codeKey]['cids_down'][] = $cid;
                }
            }
            $byCode[$codeKey]['total']++;
        }

        $groups = [];
        $subtotalUp = 0;
        $subtotalDown = 0;
        foreach (ListaLleeEstado::resumenOrder() as $estado) {
            $row = $byEstado[$estado->value];
            $row['cids_up'] = array_values(array_unique($row['cids_up']));
            $row['cids_down'] = array_values(array_unique($row['cids_down']));
            $groups[] = $row;
            if ($estado->group() === 'Caídos') {
                $subtotalUp += $row['up'];
                $subtotalDown += $row['down'];
            }
        }

        usort($byCode, fn ($a, $b) => $b['total'] <=> $a['total']);
        $byRoot = array_map(function (array $row) {
            $row['cids_up'] = array_values(array_unique($row['cids_up']));
            $row['cids_down'] = array_values(array_unique($row['cids_down']));

            return $row;
        }, array_values($byCode));

        $byZona = [];
        foreach ($rows as $row) {
            $estado = (string) ($row['lista_estado'] ?? '');
            if ($estado === '' || $estado === ListaLleeEstado::Activo->value) {
                continue;
            }
            $zona = trim((string) ($row['zona'] ?? 'Sin zona')) ?: 'Sin zona';
            if (! isset($byZona[$zona])) {
                $byZona[$zona] = ['zona' => $zona, 'up' => 0, 'down' => 0, 'total' => 0];
            }
            $up = ($row['estado_prtg'] ?? '') === '✔';
            if ($up) {
                $byZona[$zona]['up']++;
            } else {
                $byZona[$zona]['down']++;
            }
            $byZona[$zona]['total']++;
        }
        usort($byZona, fn ($a, $b) => $b['total'] <=> $a['total']);

        $totalUp = array_sum(array_column($groups, 'up'));
        $totalDown = array_sum(array_column($groups, 'down'));

        return [
            'date' => now('America/Lima')->format('d/m/Y'),
            'title' => 'TABLERO EJECUTIVO · CONECTIVIDAD DE LLEE',
            'groups' => $groups,
            'caidos_subtotal' => [
                'up' => $subtotalUp,
                'down' => $subtotalDown,
                'total' => $subtotalUp + $subtotalDown,
            ],
            'by_root_cause' => $byRoot,
            'by_zona' => array_values($byZona),
            'totals' => [
                'up' => $totalUp,
                'down' => $totalDown,
                'all' => $totalUp + $totalDown,
            ],
            'legend' => [
                'up' => '✔ EN VERDE: CONEXIÓN PRTG ACTIVA',
                'down' => '✖ EN ROJO: CAÍDO EN PRTG',
                'total' => 'TOTAL: ACTIVOS + CAÍDOS',
            ],
        ];
    }

    /**
     * @return Collection<int, array<string, mixed>>
     */
    public function closingRows(): Collection
    {
        // El Excel / preview usa la lista del día y excluye Activo y Restablecido.
        return collect(app(ListaLleeDayService::class)->exportRowsForDate());
    }

    public function normalizeTechnology(?string $raw): ?string
    {
        if ($raw === null) {
            return null;
        }
        $value = mb_strtoupper(trim($raw));
        if ($value === '') {
            return null;
        }
        if (str_contains($value, 'GPON')) {
            return 'GPON';
        }
        if (str_contains($value, 'P2P') || str_contains($value, 'PTP') || $value === 'P2P') {
            return 'P2P';
        }

        return $value;
    }

    /**
     * Solo comentarios del operador, con hora Lima. Sin códigos ni causa raíz.
     */
    public function operatorDetailOnly(Incident $incident): ?string
    {
        if ($incident->relationLoaded('managements') && $incident->managements->isNotEmpty()) {
            $lines = [];
            foreach ($incident->managements->sortBy('id') as $management) {
                $text = trim((string) ($management->detail ?: $management->observation ?: ''));
                if ($text === '') {
                    continue;
                }
                // Quitar prefijos de sistema tipo "Caída de enlace · PINT ·"
                $text = preg_replace('/^(Caída de enlace|Queja|Requerimiento|Gestión)[^\n]*·\s*/iu', '', $text) ?: $text;
                $text = trim($text);
                if ($text === '' || in_array($text, $lines, true)) {
                    continue;
                }
                $at = $management->created_at ?? $management->contact_attempted_at ?? null;
                $stamp = $at ? OperationalTime::format($at, 'd/m/Y H:i') : null;
                $lines[] = $stamp ? $stamp.' · '.$text : $text;
            }
            if ($lines !== []) {
                return implode("\n", $lines);
            }
        }

        $fallback = trim((string) ($incident->detail_text ?? ''));
        if ($fallback === '') {
            return null;
        }
        // Si el detail_text parece solo causa/código, no mostrarlo.
        $code = strtoupper(trim((string) ($incident->root_cause_code ?? '')));
        $cause = trim((string) ($incident->cause ?? ''));
        if ($code !== '' && str_contains($fallback, $code)) {
            return null;
        }
        if ($cause !== '' && $fallback === $cause) {
            return null;
        }

        return $fallback;
    }
}
