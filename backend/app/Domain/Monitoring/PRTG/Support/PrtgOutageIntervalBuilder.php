<?php

namespace App\Domain\Monitoring\PRTG\Support;

use Carbon\CarbonImmutable;

/**
 * Reconstruye intervalos DOWN→UP a partir de mensajes de estado PRTG (table.json content=messages).
 *
 * Fallo = DOWN, OK = UP. Advertencia / notificaciones no abren ni cierran por sí solas.
 */
final class PrtgOutageIntervalBuilder
{
    /**
     * @param  array<int, array{at: CarbonImmutable, kind: 'DOWN'|'UP'|'WARN', status: string, message?: string}>  $events
     * @return array<int, array{started_at: CarbonImmutable, recovered_at: ?CarbonImmutable}>
     */
    public static function build(array $events): array
    {
        usort($events, fn (array $a, array $b): int => $a['at']->getTimestamp() <=> $b['at']->getTimestamp());

        $outages = [];
        $open = null;
        $down = false;

        foreach ($events as $event) {
            $kind = $event['kind'];
            if ($kind === 'WARN') {
                continue;
            }

            if ($kind === 'DOWN' && ! $down) {
                $open = ['started_at' => $event['at'], 'recovered_at' => null];
                $down = true;
            } elseif ($kind === 'UP' && $down) {
                $open['recovered_at'] = $event['at'];
                $outages[] = $open;
                $open = null;
                $down = false;
            }
        }

        if ($open !== null) {
            $outages[] = $open;
        }

        return $outages;
    }

    /**
     * Clasifica status de messages PRTG.
     *
     * @return 'DOWN'|'UP'|'WARN'
     */
    public static function classifyStatus(string $status): string
    {
        $s = mb_strtolower(trim(strip_tags($status)));

        if ($s === 'ok' || str_contains($s, 'arriba') || $s === 'up') {
            return 'UP';
        }

        if (str_contains($s, 'fallo') || str_contains($s, 'down') || str_contains($s, 'error inusual')) {
            return 'DOWN';
        }

        return 'WARN';
    }
}
