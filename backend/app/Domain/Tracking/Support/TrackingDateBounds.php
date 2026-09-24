<?php

namespace App\Domain\Tracking\Support;

use App\Support\OperationalTime;
use Illuminate\Support\Carbon;

/**
 * Bounds de filtros de fecha: el día se interpreta en zona operativa (America/Lima)
 * y el límite se devuelve en zona de almacenamiento (UTC) para comparar en SQL.
 * Frontend envía YYYY-MM-DD; cada extremo funciona por separado.
 */
final class TrackingDateBounds
{
    public static function timezone(): string
    {
        return OperationalTime::tz();
    }

    public static function startOfDay(mixed $value): ?Carbon
    {
        return self::isParseable($value) ? OperationalTime::dayStart(trim((string) $value)) : null;
    }

    public static function endOfDay(mixed $value): ?Carbon
    {
        return self::isParseable($value) ? OperationalTime::dayEnd(trim((string) $value)) : null;
    }

    private static function isParseable(mixed $value): bool
    {
        if ($value === null || trim((string) $value) === '') {
            return false;
        }

        try {
            Carbon::parse(trim((string) $value));

            return true;
        } catch (\Throwable) {
            return false;
        }
    }
}
