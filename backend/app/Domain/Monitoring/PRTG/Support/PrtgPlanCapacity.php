<?php

namespace App\Domain\Monitoring\PRTG\Support;

/**
 * Extrae el plan contratado (Mbps) del nombre del sensor PRTG.
 * Ej.: "TRANSMISION 300Mbps", "RECEPCION 100 Mbps".
 */
final class PrtgPlanCapacity
{
    public static function mbpsFromName(?string $name): ?int
    {
        $raw = trim((string) $name);
        if ($raw === '') {
            return null;
        }

        if (preg_match('/(\d+)\s*Mbps\b/i', $raw, $m)) {
            $value = (int) $m[1];

            return $value > 0 ? $value : null;
        }

        if (preg_match('/(\d+)\s*Mb\b/i', $raw, $m)) {
            $value = (int) $m[1];

            return $value > 0 ? $value : null;
        }

        return null;
    }

    public static function label(?int $mbps): ?string
    {
        if ($mbps === null || $mbps <= 0) {
            return null;
        }

        return $mbps.' Mbps';
    }
}
