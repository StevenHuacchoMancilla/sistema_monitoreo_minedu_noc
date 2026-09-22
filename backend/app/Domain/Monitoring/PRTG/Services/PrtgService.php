<?php

namespace App\Domain\Monitoring\PRTG\Services;

use Illuminate\Support\Facades\Http;
use RuntimeException;

class PrtgService
{
    /**
     * @param  array<string, mixed>  $query
     * @return array<int, array<string, mixed>>
     */
    public function fetchTable(string $content, array $query): array
    {
        $base = rtrim((string) config('prtg.base_url'), '/');
        $token = (string) config('prtg.api_token');

        if ($base === '' || $token === '') {
            throw new RuntimeException('PRTG_BASE_URL o PRTG_API_TOKEN no configurados');
        }

        $response = Http::withoutVerifying()
            ->timeout(90)
            ->get("{$base}/api/table.json", array_merge($query, [
                'content' => $content,
                'apitoken' => $token,
            ]));

        if (! $response->successful()) {
            throw new RuntimeException("PRTG HTTP {$response->status()} para {$content}");
        }

        $json = $response->json();

        return $json[$content] ?? [];
    }

    /**
     * Localiza el root allowlist: probe + group exactos.
     *
     * @return array{objid: int, name: string, probe: string, parentid: int|null}
     */
    public function findAllowedRootGroup(): array
    {
        $allowedProbe = (string) config('prtg.allowed_probe');
        $allowedRoot = (string) config('prtg.allowed_root_group');

        $groups = $this->fetchTable('groups', [
            'columns' => 'objid,group,probe,parentid,status',
            'count' => (int) config('prtg.table_count', 10000),
        ]);

        foreach ($groups as $group) {
            $probe = (string) ($group['probe'] ?? '');
            $name = (string) ($group['group'] ?? '');
            if ($probe === $allowedProbe && $name === $allowedRoot) {
                return [
                    'objid' => (int) ($group['objid'] ?? 0),
                    'name' => $name,
                    'probe' => $probe,
                    'parentid' => isset($group['parentid']) ? (int) $group['parentid'] : null,
                ];
            }
        }

        throw new RuntimeException(
            "PRTG_ALLOWED_ROOT_NOT_FOUND: no se encontró [{$allowedRoot}] bajo probe [{$allowedProbe}]. ".
            'No se consultará Sonda local completa ni el scope anterior.'
        );
    }

    /**
     * @deprecated Use findAllowedRootGroup()
     */
    public function findLoretoGroupId(): int
    {
        return $this->findAllowedRootGroup()['objid'];
    }

    /**
     * @param  array<int, array<string, mixed>>  $groups
     * @return array<int, array<string, mixed>> keyed by objid
     */
    public function indexGroupsById(array $groups): array
    {
        $index = [];
        foreach ($groups as $group) {
            $id = (int) ($group['objid'] ?? 0);
            if ($id > 0) {
                $index[$id] = $group;
            }
        }

        return $index;
    }

    /**
     * Camina parentid hacia la raíz con protección de ciclos.
     *
     * @param  array<int, array<string, mixed>>  $groupIndex
     * @return array{ancestors: array<int, array<string, mixed>>, reached_root: bool, cycle: bool, broken: bool}
     */
    public function walkAncestors(int $startObjId, int $allowedRootObjId, array $groupIndex): array
    {
        $ancestors = [];
        $seen = [];
        $current = $startObjId;
        $reachedRoot = false;
        $cycle = false;
        $broken = false;
        $maxHops = 64;

        for ($hop = 0; $hop < $maxHops; $hop++) {
            if ($current === $allowedRootObjId) {
                $reachedRoot = true;
                break;
            }

            if (isset($seen[$current])) {
                $cycle = true;
                break;
            }
            $seen[$current] = true;

            if (! isset($groupIndex[$current])) {
                $broken = true;
                break;
            }

            $node = $groupIndex[$current];
            $ancestors[] = $node;
            $parent = isset($node['parentid']) ? (int) $node['parentid'] : 0;
            if ($parent <= 0) {
                $broken = true;
                break;
            }
            $current = $parent;

            if ($hop === $maxHops - 1 && $current !== $allowedRootObjId) {
                $cycle = true;
            }
        }

        return [
            'ancestors' => $ancestors,
            'reached_root' => $reachedRoot,
            'cycle' => $cycle,
            'broken' => $broken,
        ];
    }

    /**
     * ALLOWLIST: el objeto (vía parent inmediato de grupo) debe descender del root permitido.
     *
     * @param  array<int, array<string, mixed>>  $groupIndex
     */
    public function isDescendantOfAllowedRoot(int $parentGroupId, int $allowedRootObjId, array $groupIndex): bool
    {
        if ($parentGroupId === $allowedRootObjId) {
            return true;
        }

        $walk = $this->walkAncestors($parentGroupId, $allowedRootObjId, $groupIndex);

        return $walk['reached_root'] && ! $walk['cycle'] && ! $walk['broken'];
    }

    /**
     * Extrae provincia/distrito desde la jerarquía bajo el root allowlist.
     *
     * Jerarquía esperada: Root → Provincia → Distrito → Device
     * (ancestors[0] = distrito, ancestors[1] = provincia cuando hay 2+ niveles).
     *
     * @param  array<int, array<string, mixed>>  $groupIndex
     * @return array{province: ?string, district: ?string, under_root: bool, warning: ?string}
     */
    public function resolveLocationFromHierarchy(int $deviceParentId, int $allowedRootObjId, array $groupIndex): array
    {
        if ($deviceParentId <= 0) {
            return [
                'province' => null,
                'district' => null,
                'under_root' => false,
                'warning' => 'missing_parent',
            ];
        }

        if ($deviceParentId === $allowedRootObjId) {
            return [
                'province' => null,
                'district' => null,
                'under_root' => true,
                'warning' => 'device_directly_under_root',
            ];
        }

        $walk = $this->walkAncestors($deviceParentId, $allowedRootObjId, $groupIndex);
        if ($walk['cycle']) {
            return [
                'province' => null,
                'district' => null,
                'under_root' => false,
                'warning' => 'hierarchy_cycle',
            ];
        }
        if ($walk['broken'] || ! $walk['reached_root']) {
            return [
                'province' => null,
                'district' => null,
                'under_root' => false,
                'warning' => 'hierarchy_incomplete',
            ];
        }

        $chain = $walk['ancestors'];
        $district = null;
        $province = null;

        if (count($chain) >= 2) {
            $district = (string) ($chain[0]['group'] ?? '');
            $province = (string) ($chain[1]['group'] ?? '');
        } elseif (count($chain) === 1) {
            // Solo un nivel bajo root: tratarlo como provincia (sin distrito).
            $province = (string) ($chain[0]['group'] ?? '');
        }

        return [
            'province' => $province !== '' ? $province : null,
            'district' => $district !== '' ? $district : null,
            'under_root' => true,
            'warning' => null,
        ];
    }

    public function extractCid(string $deviceName): ?string
    {
        $pattern = (string) config('prtg.device_cid_regex', '^CID(\\d+)');
        if ($pattern === '') {
            $pattern = '^CID(\\d+)';
        }

        if (@preg_match('#'.$pattern.'#', $deviceName, $matches) !== 1) {
            return null;
        }

        return $matches[1] ?? null;
    }

    /**
     * Contar grupos hijos directos del root (provincias) y nietos (distritos).
     *
     * @param  array<int, array<string, mixed>>  $groupIndex
     * @return array{provinces: int, districts: int, province_names: array<int, string>, district_names: array<int, string>}
     */
    public function countGeoGroups(int $allowedRootObjId, array $groupIndex): array
    {
        $provinces = [];
        $districts = [];

        foreach ($groupIndex as $id => $group) {
            $parent = (int) ($group['parentid'] ?? 0);
            $name = (string) ($group['group'] ?? '');
            if ($parent === $allowedRootObjId && $name !== '') {
                $provinces[$id] = $name;
            }
        }

        foreach ($groupIndex as $id => $group) {
            $parent = (int) ($group['parentid'] ?? 0);
            $name = (string) ($group['group'] ?? '');
            if (isset($provinces[$parent]) && $name !== '') {
                $districts[$id] = $name;
            }
        }

        return [
            'provinces' => count($provinces),
            'districts' => count($districts),
            'province_names' => array_values($provinces),
            'district_names' => array_values($districts),
        ];
    }
}
