<?php

namespace Tests\Unit\Tracking;

use App\Domain\Tracking\Support\TrackingDateParser;
use App\Domain\Tracking\Support\TrackingFollowupParser;
use App\Enums\DatePrecision;
use Tests\TestCase;

class TrackingParsersTest extends TestCase
{
    public function test_parses_excel_serial_and_dd_mm_with_year(): void
    {
        $parser = new TrackingDateParser;

        // Formato visual dd/mm (prioridad) aunque el serial Excel diga otra cosa.
        $fromFmt = $parser->parse(46151, '05/09', 2026);
        $this->assertNotNull($fromFmt);
        $this->assertSame(DatePrecision::Date, $fromFmt['precision']);
        $this->assertSame('2026-09-05', $fromFmt['at']->toDateString());

        $text = $parser->parse('15/09', '15/09', 2026);
        $this->assertNotNull($text);
        $this->assertSame('2026-09-15', $text['at']->toDateString());

        $typo = $parser->parse('21//09', '21//09', 2026);
        $this->assertNotNull($typo);
        $this->assertSame('2026-09-21', $typo['at']->toDateString());

        // Fallback solo serial (sin texto dd/mm).
        $serialOnly = $parser->parse(46151, null, 2026);
        $this->assertNotNull($serialOnly);
        $this->assertSame('2026-05-09', $serialOnly['at']->toDateString());
    }

    public function test_followup_splits_by_date_and_keeps_orphan_lines(): void
    {
        $parser = new TrackingFollowupParser(new TrackingDateParser);
        $raw = "12/09 Se realizan descartes\n12/09 Se reporta en grupo\n21//09 Se levanto el servicio.\nsin fecha queda anexada";

        $items = $parser->parse($raw, 2026);
        $this->assertCount(3, $items);
        $this->assertSame('2026-09-12', $items[0]['occurred_on']);
        $this->assertSame('Se realizan descartes', $items[0]['body']);
        $this->assertSame('2026-09-21', $items[2]['occurred_on']);
        $this->assertStringContainsString('Se levanto el servicio.', $items[2]['body']);
        $this->assertStringContainsString('sin fecha queda anexada', $items[2]['body']);
    }
}
