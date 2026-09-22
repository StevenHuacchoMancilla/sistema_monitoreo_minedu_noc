<?php

namespace App\Domain\Incidents\Support;

use Carbon\CarbonInterface;

final class OutageDuration
{
    public static function seconds(?CarbonInterface $startedAt, ?CarbonInterface $recoveredAt = null, ?CarbonInterface $now = null): ?int
    {
        if ($startedAt === null) {
            return null;
        }

        $end = $recoveredAt ?? ($now ?? now());
        if ($end->lt($startedAt)) {
            return 0;
        }

        return (int) $startedAt->diffInSeconds($end);
    }

    public static function human(?int $seconds): ?string
    {
        if ($seconds === null) {
            return null;
        }
        if ($seconds < 60) {
            return '< 1 min';
        }

        $days = intdiv($seconds, 86400);
        $hours = intdiv($seconds % 86400, 3600);
        $minutes = intdiv($seconds % 3600, 60);

        if ($days > 0) {
            return trim("{$days} d {$hours} h");
        }
        if ($hours > 0) {
            return trim("{$hours} h {$minutes} min");
        }

        return "{$minutes} min";
    }
}
