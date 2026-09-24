<?php

namespace App\Support;

use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Persistencia en app.timezone (UTC); calendario operativo (Hoy, mismo día, rangos) en
 * app.display_timezone. Eloquent y el query builder NO convierten zonas al guardar ni al
 * comparar: todo límite que llegue a SQL debe salir de aquí ya en zona de almacenamiento.
 */
final class OperationalTime
{
    public static function tz(): string
    {
        return (string) config('app.display_timezone', 'America/Lima');
    }

    public static function storageTz(): string
    {
        return (string) config('app.timezone', 'UTC');
    }

    public static function now(): Carbon
    {
        return Carbon::now(self::tz());
    }

    /** Fecha operativa local YYYY-MM-DD de un instante. */
    public static function localDate(?CarbonInterface $at): ?string
    {
        return $at?->copy()->setTimezone(self::tz())->toDateString();
    }

    public static function sameLocalDay(?CarbonInterface $a, ?CarbonInterface $b): bool
    {
        return $a !== null && $b !== null && self::localDate($a) === self::localDate($b);
    }

    public static function format(?CarbonInterface $at, string $format): ?string
    {
        return $at?->copy()->setTimezone(self::tz())->format($format);
    }

    /**
     * Inicio del día local (YYYY-MM-DD o instante) expresado en zona de almacenamiento.
     */
    public static function dayStart(CarbonInterface|string|null $day = null): Carbon
    {
        return self::localDay($day)->startOfDay()->setTimezone(self::storageTz());
    }

    /** Fin del día local (inclusivo) expresado en zona de almacenamiento. */
    public static function dayEnd(CarbonInterface|string|null $day = null): Carbon
    {
        return self::localDay($day)->endOfDay()->setTimezone(self::storageTz());
    }

    /** Convierte cualquier instante a zona de almacenamiento antes de persistir/comparar. */
    public static function toStorage(CarbonInterface $at): Carbon
    {
        return Carbon::instance($at)->setTimezone(self::storageTz());
    }

    /**
     * Expresión SQL de la fecha local de una columna timestamp naive (en storageTz).
     * sqlite no tiene zonas: usa el offset fijo actual (America/Lima no tiene DST).
     */
    public static function sqlLocalDate(string $column): string
    {
        if (DB::connection()->getDriverName() === 'pgsql') {
            return sprintf(
                "((%s AT TIME ZONE '%s') AT TIME ZONE '%s')::date",
                $column,
                self::storageTz(),
                self::tz(),
            );
        }

        $offsetSeconds = CarbonImmutable::now(self::tz())->getOffset()
            - CarbonImmutable::now(self::storageTz())->getOffset();

        return sprintf("date(%s, '%+d seconds')", $column, $offsetSeconds);
    }

    private static function localDay(CarbonInterface|string|null $day): Carbon
    {
        if ($day === null || $day === '') {
            return self::now();
        }

        if ($day instanceof CarbonInterface) {
            return Carbon::instance($day)->setTimezone(self::tz());
        }

        $raw = trim($day);
        if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $raw) === 1) {
            return Carbon::createFromFormat('Y-m-d', $raw, self::tz());
        }

        return Carbon::parse($raw, self::tz());
    }
}
