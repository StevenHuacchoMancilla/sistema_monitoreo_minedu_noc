<?php

namespace App\Domain\Incidents\Support;

use InvalidArgumentException;

/**
 * Leyenda oficial de causa raíz (código de grupo + código → causa).
 */
final class RootCauseLegend
{
    /**
     * @return list<array{group_code: string, group_name: string, code: string, segment: string, cause: string, when: string, attention: ?string, agent: string}>
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
            $attention = trim((string) ($row['attention'] ?? ''));
            if (in_array(strtoupper($attention), ['PEXT', 'PINT'], true)) {
                $attention = strtoupper($attention);
            }
            $out[] = [
                'group_code' => $group,
                'group_name' => trim((string) ($row['group_name'] ?? '')),
                'code' => $code,
                'segment' => trim((string) ($row['segment'] ?? '')),
                'cause' => trim((string) ($row['cause'] ?? '')),
                'when' => trim((string) ($row['when'] ?? '')),
                'attention' => $attention !== '' ? $attention : null,
                'agent' => trim((string) ($row['agent'] ?? '')),
            ];
        }

        return $out;
    }

    /**
     * @return array{group_code: string, group_name: string, code: string, segment: string, cause: string, when: string, attention: ?string, agent: string}
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

    /**
     * @return array{group_code: string, group_name: string, code: string, segment: string, cause: string, when: string, attention: ?string, agent: string}|null
     */
    public static function findByCode(string $code): ?array
    {
        $code = strtoupper(trim($code));
        if ($code === '') {
            return null;
        }
        foreach (self::all() as $row) {
            if (strtoupper($row['code']) === $code) {
                return $row;
            }
        }

        return null;
    }

    /** Código y texto juntos, para no dejar el código solo. */
    public static function display(?string $code, ?string $cause): ?string
    {
        $code = trim((string) $code);
        $cause = trim((string) $cause);
        if ($code === '' && $cause === '') {
            return null;
        }
        if ($code !== '' && $cause !== '' && ! str_starts_with(mb_strtoupper($cause), mb_strtoupper($code))) {
            return $code.' · '.$cause;
        }

        return $cause !== '' ? $cause : $code;
    }
}
