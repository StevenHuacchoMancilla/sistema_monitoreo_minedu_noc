<?php

namespace Tests\Unit;

use App\Support\CidTssSearch;
use PHPUnit\Framework\TestCase;

class CidTssSearchTest extends TestCase
{
    public function test_matches_cid_or_tss_only(): void
    {
        $row = ['cid' => '258438', 'tss' => 75, 'local_educativo' => 'RICARDO PALMA'];

        $this->assertTrue(CidTssSearch::matchesRowCidTss($row, '258438'));
        $this->assertTrue(CidTssSearch::matchesRowCidTss($row, '75'));
        $this->assertTrue(CidTssSearch::matchesRowCidTss($row, '438'));
        $this->assertFalse(CidTssSearch::matchesRowCidTss($row, 'RICARDO'));
        $this->assertFalse(CidTssSearch::matchesRowCidTss($row, 'PALMA'));
    }

    public function test_parse_extracts_digits_and_tss(): void
    {
        $p = CidTssSearch::parse(' 75 ');
        $this->assertSame('75', $p['needle']);
        $this->assertSame('75', $p['digits']);
        $this->assertSame(75, $p['tss']);
    }
}
