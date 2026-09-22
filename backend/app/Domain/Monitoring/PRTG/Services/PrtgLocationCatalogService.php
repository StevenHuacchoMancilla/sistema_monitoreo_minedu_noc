<?php

namespace App\Domain\Monitoring\PRTG\Services;

use App\Enums\CidStatus;
use App\Models\NetworkAssignment;
use Illuminate\Database\Eloquent\Builder;

class PrtgLocationCatalogService
{
    /**
     * Catálogo de provincias operativas (jerarquía PRTG persistida).
     *
     * @return array{data: list<array{name: string, district_count: int, assignment_count: int}>, meta: array<string, mixed>}
     */
    public function provinces(): array
    {
        $rows = $this->eligibleQuery()
            ->whereNotNull('prtg_province')
            ->where('prtg_province', '!=', '')
            ->selectRaw('prtg_province as name')
            ->selectRaw('COUNT(*) as assignment_count')
            ->selectRaw("COUNT(DISTINCT NULLIF(TRIM(prtg_district), '')) as district_count")
            ->groupBy('prtg_province')
            ->orderBy('prtg_province')
            ->get();

        $data = $rows->map(fn ($row) => [
            'name' => (string) $row->name,
            'district_count' => (int) $row->district_count,
            'assignment_count' => (int) $row->assignment_count,
        ])->values()->all();

        return [
            'data' => $data,
            'meta' => [
                'source' => 'prtg',
                'count' => count($data),
            ],
        ];
    }

    /**
     * Catálogo de distritos operativos, opcionalmente filtrado por provincia.
     *
     * @return array{data: list<array{name: string, province: string, assignment_count: int}>, meta: array<string, mixed>}
     */
    public function districts(?string $province = null): array
    {
        $query = $this->eligibleQuery()
            ->whereNotNull('prtg_district')
            ->where('prtg_district', '!=', '');

        $normalizedProvince = $province !== null && trim($province) !== ''
            ? mb_strtoupper(trim($province))
            : null;

        if ($normalizedProvince !== null) {
            $query->whereRaw('UPPER(TRIM(prtg_province)) = ?', [$normalizedProvince]);
        }

        $rows = $query
            ->selectRaw('prtg_district as name')
            ->selectRaw('prtg_province as province')
            ->selectRaw('COUNT(*) as assignment_count')
            ->groupBy('prtg_province', 'prtg_district')
            ->orderBy('prtg_province')
            ->orderBy('prtg_district')
            ->get();

        $data = $rows->map(fn ($row) => [
            'name' => (string) $row->name,
            'province' => (string) ($row->province ?? ''),
            'assignment_count' => (int) $row->assignment_count,
        ])->values()->all();

        return [
            'data' => $data,
            'meta' => [
                'source' => 'prtg',
                'province' => $normalizedProvince,
                'count' => count($data),
            ],
        ];
    }

    /**
     * Árbol provincia → distritos para selects dependientes.
     *
     * @return array{data: list<array{province: string, districts: list<array{name: string, assignment_count: int}>, assignment_count: int}>, meta: array<string, mixed>}
     */
    public function tree(): array
    {
        $rows = $this->eligibleQuery()
            ->whereNotNull('prtg_province')
            ->where('prtg_province', '!=', '')
            ->selectRaw('prtg_province as province')
            ->selectRaw('NULLIF(TRIM(prtg_district), \'\') as district')
            ->selectRaw('COUNT(*) as assignment_count')
            ->groupBy('prtg_province', 'district')
            ->orderBy('prtg_province')
            ->orderBy('district')
            ->get();

        $tree = [];
        foreach ($rows as $row) {
            $province = (string) $row->province;
            if (! isset($tree[$province])) {
                $tree[$province] = [
                    'province' => $province,
                    'districts' => [],
                    'assignment_count' => 0,
                ];
            }

            $count = (int) $row->assignment_count;
            $tree[$province]['assignment_count'] += $count;

            $district = $row->district !== null ? (string) $row->district : '';
            if ($district !== '') {
                $tree[$province]['districts'][] = [
                    'name' => $district,
                    'assignment_count' => $count,
                ];
            }
        }

        $data = array_values($tree);
        $districtTotal = array_sum(array_map(
            static fn (array $node): int => count($node['districts']),
            $data
        ));

        return [
            'data' => $data,
            'meta' => [
                'source' => 'prtg',
                'provinces' => count($data),
                'districts' => $districtTotal,
            ],
        ];
    }

    private function eligibleQuery(): Builder
    {
        return NetworkAssignment::query()
            ->where('is_active', true)
            ->where('cid_status', CidStatus::Valid)
            ->where('monitoring_eligible', true);
    }
}
