<?php

namespace App\Domain\Reports\Services;

use App\Domain\Monitoring\PRTG\Support\PrtgOperationalLocation;
use App\Enums\ManagementClassification;
use App\Enums\ManagementScope;
use App\Models\Incident;
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
     *   active_only?: bool
     * }  $filters
     * @return array{rows: list<array<string, mixed>>, total: int, legend: list<array<string, string>>}
     */
    public function list(array $filters = []): array
    {
        $query = $this->baseQuery($filters);
        $incidents = $query->get();

        $rows = $incidents->values()->map(fn (Incident $incident, int $index) => $this->mapRow($incident, $index + 1))->all();

        return [
            'rows' => $rows,
            'total' => count($rows),
            'legend' => [
                ['key' => ManagementClassification::NewOutage->value, 'color' => 'yellow', 'label' => 'Nueva caída'],
                ['key' => ManagementClassification::ContactConfirmed->value, 'color' => 'red', 'label' => 'Contacto confirmado'],
                ['key' => ManagementClassification::NoResponse->value, 'color' => 'orange', 'label' => 'Sin respuesta'],
                ['key' => ManagementClassification::Complaint->value, 'color' => 'blue', 'label' => 'Queja / reclamo'],
            ],
            'filters_applied' => $filters,
            'columns' => self::officialColumns(),
        ];
    }

    /**
     * @return list<string>
     */
    public static function officialColumns(): array
    {
        return [
            'N°',
            'CID',
            'LOCAL EDUCATIVO',
            'PRESENTACION NOMBRE PRTG',
            'CAÍDA',
            'TIPO',
            'DETALLE',
            'PEXT/PINT',
            'PROVINCIA',
            'DISTRITO',
            'CODIGO DE LOCAL',
        ];
    }

    /**
     * @param  array<string, mixed>  $filters
     */
    public function baseQuery(array $filters): Builder
    {
        $activeOnly = array_key_exists('active_only', $filters) ? (bool) $filters['active_only'] : true;

        $query = Incident::query()
            ->with(['school', 'networkAssignment', 'sensor'])
            ->when($activeOnly, fn (Builder $q) => $q->active())
            ->whereNotNull('management_classification')
            ->where('management_classification', '!=', ManagementClassification::Unclassified->value)
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

        return [
            'n' => $school?->current_sequence,
            'ordinal' => $ordinal,
            'incident_id' => $incident->id,
            'cid' => $assignment?->cid ?? ($snapshotNet['cid'] ?? null),
            'local_educativo' => $school?->local_educativo ?? ($snapshotSchool['local_educativo'] ?? null),
            'presentacion_nombre_prtg' => $nombrePrtg !== '' ? $nombrePrtg : null,
            'outage_at' => $outageAt?->toIso8601String(),
            'caida' => $caida,
            'caida_source' => $outageAt ? 'started_at' : (filled($incident->outage_text) ? 'outage_text_legacy' : null),
            'tipo' => $tipo,
            'technology_type' => $tipo,
            'detalle' => $incident->detail_text,
            'pext_pint' => $incident->management_scope?->value,
            'provincia' => $apiLocation['provincia'] ?? $snapshotProvince,
            'distrito' => $apiLocation['distrito'] ?? $snapshotDistrict,
            'prtg_province' => $apiLocation['prtg_province'],
            'prtg_district' => $apiLocation['prtg_district'],
            'admin_provincia' => $apiLocation['admin_provincia'] ?? $snapshotProvince,
            'admin_distrito' => $apiLocation['admin_distrito'] ?? $snapshotDistrict,
            'location_source' => $apiLocation['location_source'],
            'location_mismatch' => $apiLocation['location_mismatch'],
            'codigo_local' => $school?->codigo_local ?? ($snapshotSchool['codigo_local'] ?? null),
            'management_classification' => $classification?->value,
            'management_classification_label' => $classification?->label(),
            'color_key' => $classification?->colorKey() ?? 'slate',
            'followup_status' => $incident->followup_status?->value,
            'started_at' => $incident->started_at?->toIso8601String(),
            'recovered_at' => $incident->recovered_at?->toIso8601String(),
            'activa' => $incident->recovered_at === null,
        ];
    }

    /**
     * @return Collection<int, array<string, mixed>>
     */
    public function closingRows(): Collection
    {
        $incidents = Incident::query()
            ->forClosingReport()
            ->with(['school', 'networkAssignment', 'sensor'])
            ->orderBy('started_at')
            ->get();

        return $incidents->values()->map(fn (Incident $incident, int $index) => $this->mapRow($incident, $index + 1));
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
}
