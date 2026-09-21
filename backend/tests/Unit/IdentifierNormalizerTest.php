<?php

namespace Tests\Unit;

use App\Support\Normalization\CidClassifier;
use App\Support\Normalization\IdentifierNormalizer;
use App\Enums\CidStatus;
use PHPUnit\Framework\TestCase;

class IdentifierNormalizerTest extends TestCase
{
    public function test_numeric_cid_strips_excel_decimal_suffix(): void
    {
        $this->assertSame('258364', IdentifierNormalizer::identifier('258364.0'));
        $this->assertSame('258364', CidClassifier::numericCid('258364.0'));
    }

    public function test_phone_does_not_remain_in_scientific_notation(): void
    {
        $this->assertSame('955076232', IdentifierNormalizer::phone('9.55076232E8'));
        $this->assertSame('974790036', IdentifierNormalizer::phone('9.74790036E8'));
    }

    public function test_slash_sequence_keeps_both_parts(): void
    {
        $this->assertSame(
            ['current_sequence' => 501, 'legacy_reference' => '481'],
            IdentifierNormalizer::sequence('501/481')
        );
        $this->assertSame(
            ['current_sequence' => 502, 'legacy_reference' => '81'],
            IdentifierNormalizer::sequence('502/81')
        );
        $this->assertSame(
            ['current_sequence' => 503, 'legacy_reference' => '488'],
            IdentifierNormalizer::sequence('503/488')
        );
    }

    public function test_leading_zero_modular_codes_are_recovered(): void
    {
        $this->assertSame('0720763', IdentifierNormalizer::identifier('7.20763E-2'));
        $this->assertSame('0720763', IdentifierNormalizer::identifier(0.0720763));
    }

    public function test_baja_impe_and_empty_cid(): void
    {
        $this->assertSame(CidStatus::BajaImpe, CidClassifier::classify('baja - impe'));
        $this->assertSame(CidStatus::Empty, CidClassifier::classify(''));
        $this->assertNull(CidClassifier::numericCid('baja - impe'));
    }
}
