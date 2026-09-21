<?php

namespace App\Support\Normalization;

use App\Enums\CidStatus;

class CidClassifier
{
    public static function classify(?string $cid): CidStatus
    {
        if ($cid === null || trim($cid) === '') {
            return CidStatus::Empty;
        }

        $value = trim($cid);

        if (preg_match('/baja\s*-?\s*impe/i', $value) === 1) {
            return CidStatus::BajaImpe;
        }

        if (preg_match('/^\d+$/', $value) === 1) {
            return CidStatus::Valid;
        }

        return CidStatus::Invalid;
    }

    public static function numericCid(?string $cid): ?string
    {
        $normalized = IdentifierNormalizer::identifier($cid);

        return self::classify($normalized) === CidStatus::Valid ? $normalized : null;
    }
}
