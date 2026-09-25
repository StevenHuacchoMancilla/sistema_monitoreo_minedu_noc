<?php

namespace Tests\Unit\Tracking;

use App\Domain\Tracking\Support\TrackingCodigoNormalizer;
use Tests\TestCase;

class TrackingCodigoNormalizerTest extends TestCase
{
    public function test_normalizes_letters_unique_sorted(): void
    {
        $this->assertSame('A,C,F', TrackingCodigoNormalizer::normalize(['f', 'A', 'c', 'A']));
        $this->assertSame(['A', 'C', 'F'], TrackingCodigoNormalizer::toLetters('f, a; C'));
        $this->assertNull(TrackingCodigoNormalizer::normalize([]));
        $this->assertNull(TrackingCodigoNormalizer::normalize('123'));
    }
}
