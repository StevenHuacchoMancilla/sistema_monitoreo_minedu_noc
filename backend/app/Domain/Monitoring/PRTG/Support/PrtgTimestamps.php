<?php

namespace App\Domain\Monitoring\PRTG\Support;

use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;

/**
 * Conversión única de tiempos PRTG (table.json) a instantes absolutos.
 *
 * - `*_raw` de columnas fecha (lastcheck, lastup, lastdown) = fecha OLE en UTC
 *   (días desde 1899-12-30). Los textos sin `_raw` vienen en la zona del servidor PRTG
 *   y NO se parsean.
 * - `downtimesince_raw` / `uptimesince_raw` = segundos transcurridos al momento del check.
 */
final class PrtgTimestamps
{
    /** Desfase de reloj tolerado entre PRTG y este servidor. */
    public const CLOCK_SKEW_SECONDS = 120;

    private const OLE_UNIX_EPOCH_DAYS = 25569;

    public static function fromOle(mixed $raw): ?CarbonImmutable
    {
        if (! is_numeric($raw) || (float) $raw <= 0) {
            return null;
        }

        return CarbonImmutable::createFromTimestampUTC(
            (int) round(((float) $raw - self::OLE_UNIX_EPOCH_DAYS) * 86400)
        );
    }

    /**
     * Instante del último check PRTG; null si no viene o está en el futuro.
     *
     * @param  array<string, mixed>  $row
     * @return array{at: ?CarbonImmutable, future: bool, raw: mixed, parsed: ?string}
     */
    public static function checkAt(array $row, CarbonInterface $now): array
    {
        $raw = $row['lastcheck_raw'] ?? null;
        $parsed = self::fromOle($raw);

        return self::guard($parsed, $now) + ['raw' => $raw, 'parsed' => $parsed?->toIso8601String()];
    }

    /**
     * Inicio del estado actual: check − {downtimesince|uptimesince}_raw.
     *
     * @param  array<string, mixed>  $row
     * @param  'downtimesince'|'uptimesince'  $field
     * @return array{at: ?CarbonImmutable, future: bool, raw: mixed, parsed: ?string}
     */
    public static function stateSince(array $row, string $field, CarbonInterface $now): array
    {
        $raw = $row[$field.'_raw'] ?? null;
        if (! is_numeric($raw) || (float) $raw < 0) {
            return ['at' => null, 'future' => false, 'raw' => $raw, 'parsed' => null];
        }

        $check = self::fromOle($row['lastcheck_raw'] ?? null) ?? CarbonImmutable::instance($now);
        $parsed = $check->subSeconds((int) round((float) $raw));

        return self::guard($parsed, $now) + ['raw' => $raw, 'parsed' => $parsed->toIso8601String()];
    }

    /**
     * @return array{at: ?CarbonImmutable, future: bool}
     */
    private static function guard(?CarbonImmutable $parsed, CarbonInterface $now): array
    {
        if ($parsed === null) {
            return ['at' => null, 'future' => false];
        }

        $diff = $parsed->getTimestamp() - $now->getTimestamp();
        if ($diff > self::CLOCK_SKEW_SECONDS) {
            return ['at' => null, 'future' => true];
        }

        // Dentro de la tolerancia de reloj: nunca guardar un instante posterior a "ahora".
        return ['at' => $diff > 0 ? CarbonImmutable::instance($now) : $parsed, 'future' => false];
    }
}
