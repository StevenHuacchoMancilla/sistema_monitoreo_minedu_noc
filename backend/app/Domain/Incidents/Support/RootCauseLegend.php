<?php

namespace App\Domain\Incidents\Support;

use InvalidArgumentException;

/**
 * Leyenda oficial de causa raíz (código de grupo + código → causa).
 */
final class RootCauseLegend
{
    /**
     * @return list<array{group_code: string, group_name: string, code: string, cause: string, attention: ?string}>
     */
    public static function all(): array
    {
        $path = resource_path('data/root_cause_legend.json');
        $raw = is_file($path) ? file_get_contents($path) : false;
        $rows = is_string($raw) ? json_decode($raw, true) : null;
        if (! is_array($rows)) {
            return [];
        }

        $out = [];
        foreach ($rows as $row) {
            if (! is_array($row)) {
                continue;
            }
            $code = trim((string) ($row['code'] ?? ''));
            $group = trim((string) ($row['group_code'] ?? ''));
            if ($code === '' || $group === '') {
                continue;
            }
            $attention = strtoupper(trim((string) ($row['attention'] ?? '')));
            $out[] = [
                'group_code' => $group,
                'group_name' => trim((string) ($row['group_name'] ?? '')),
                'code' => $code,
                'cause' => trim((string) ($row['cause'] ?? '')),
                'attention' => in_array($attention, ['PEXT', 'PINT'], true) ? $attention : null,
            ];
        }

        return $out;
    }

    /**
     * @return array{group_code: string, group_name: string, code: string, cause: string, attention: ?string}
     */
    public static function requirePair(string $groupCode, string $code): array
    {
        $groupCode = trim($groupCode);
        $code = trim($code);
        foreach (self::all() as $row) {
            if ($row['group_code'] === $groupCode && $row['code'] === $code) {
                return $row;
            }
        }

        throw new InvalidArgumentException('El código de causa raíz no existe en la leyenda para ese grupo.');
    }
}
