<?php

namespace App\Domain\Monitoring\PRTG\Support;

/**
 * Convierte lecturas PRTG ("0,53 Mbit/s", "< 0,01 Mbit/s", "120 kbit/s") a Mbit/s.
 */
final class TrafficValue
{
    public static function toMbps(?string $raw): ?float
    {
        $text = trim((string) $raw);
        if ($text === '' || $text === '-') {
            return null;
        }
        if (! preg_match('/([0-9]+(?:[.,][0-9]+)?)/', $text, $match)) {
            return null;
        }
        $number = (float) str_replace(',', '.', $match[1]);
        $upper = mb_strtoupper($text);
        if (str_contains($upper, 'GBIT') || str_contains($upper, 'GB/S')) {
            return $number * 1000;
        }
        if (str_contains($upper, 'KBIT') || str_contains($upper, 'KB/S') || str_contains($upper, 'KBYTE')) {
            return $number / 1000;
        }
        if (str_contains($upper, 'BIT/S') && ! str_contains($upper, 'MBIT') && ! str_contains($upper, 'KBIT')) {
            return $number / 1_000_000;
        }

        return $number;
    }

    public static function format(?float $mbps): ?string
    {
        if ($mbps === null) {
            return null;
        }

        return number_format($mbps, 2, '.', '').' Mbit/s';
    }
}
