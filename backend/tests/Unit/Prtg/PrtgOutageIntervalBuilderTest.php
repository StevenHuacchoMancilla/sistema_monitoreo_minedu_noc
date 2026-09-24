<?php

namespace Tests\Unit\Prtg;

use App\Domain\Monitoring\PRTG\Support\PrtgOutageIntervalBuilder;
use Carbon\CarbonImmutable;
use PHPUnit\Framework\TestCase;

class PrtgOutageIntervalBuilderTest extends TestCase
{
    private function ev(string $at, string $kind): array
    {
        return [
            'at' => CarbonImmutable::parse($at, 'UTC'),
            'kind' => $kind,
            'status' => $kind,
        ];
    }

    public function test_single_outage(): void
    {
        $out = PrtgOutageIntervalBuilder::build([
            $this->ev('2026-09-22 13:00:00', 'UP'),
            $this->ev('2026-09-22 08:00:00', 'DOWN'),
            $this->ev('2026-09-22 10:00:00', 'UP'),
        ]);

        $this->assertCount(1, $out);
        $this->assertSame('2026-09-22T08:00:00+00:00', $out[0]['started_at']->toIso8601String());
        $this->assertSame('2026-09-22T10:00:00+00:00', $out[0]['recovered_at']->toIso8601String());
    }

    public function test_repeated_down_keeps_one_outage(): void
    {
        $out = PrtgOutageIntervalBuilder::build([
            $this->ev('2026-09-22 08:00:00', 'DOWN'),
            $this->ev('2026-09-22 08:05:00', 'DOWN'),
            $this->ev('2026-09-22 08:10:00', 'DOWN'),
            $this->ev('2026-09-22 10:00:00', 'UP'),
        ]);

        $this->assertCount(1, $out);
    }

    public function test_two_outages_same_hour(): void
    {
        $out = PrtgOutageIntervalBuilder::build([
            $this->ev('2026-09-23 14:10:00', 'DOWN'),
            $this->ev('2026-09-23 14:12:00', 'UP'),
            $this->ev('2026-09-23 14:14:00', 'DOWN'),
            $this->ev('2026-09-23 14:15:00', 'UP'),
        ]);

        $this->assertCount(2, $out);
    }

    public function test_open_outage_without_up(): void
    {
        $out = PrtgOutageIntervalBuilder::build([
            $this->ev('2026-09-22 08:00:00', 'DOWN'),
        ]);

        $this->assertCount(1, $out);
        $this->assertNull($out[0]['recovered_at']);
    }

    public function test_warn_does_not_open_or_close(): void
    {
        $out = PrtgOutageIntervalBuilder::build([
            $this->ev('2026-09-22 08:00:00', 'WARN'),
            $this->ev('2026-09-22 08:01:00', 'DOWN'),
            $this->ev('2026-09-22 08:02:00', 'WARN'),
            $this->ev('2026-09-22 08:05:00', 'UP'),
        ]);

        $this->assertCount(1, $out);
        $this->assertSame('08:01:00', $out[0]['started_at']->format('H:i:s'));
    }

    public function test_case_9053_day_22_two_outages(): void
    {
        // Fixture exacta del audit real sensor 9053 (mensajes Fallo/OK, Lima = UTC-5).
        $out = PrtgOutageIntervalBuilder::build([
            $this->ev('2026-09-22 10:57:49', 'DOWN'), // 05:57:49 Lima
            $this->ev('2026-09-22 16:40:25', 'UP'),   // 11:40:25 Lima
            $this->ev('2026-09-22 19:42:49', 'DOWN'), // 14:42:49 Lima
            $this->ev('2026-09-22 19:46:24', 'UP'),   // 14:46:24 Lima
        ]);

        $this->assertCount(2, $out);
        // 05:57:49 → 11:40:25 Lima = 5h 42m 36s
        $this->assertSame(5 * 3600 + 42 * 60 + 36, $out[0]['recovered_at']->getTimestamp() - $out[0]['started_at']->getTimestamp());
        $this->assertSame(3 * 60 + 35, $out[1]['recovered_at']->getTimestamp() - $out[1]['started_at']->getTimestamp());
    }
}
