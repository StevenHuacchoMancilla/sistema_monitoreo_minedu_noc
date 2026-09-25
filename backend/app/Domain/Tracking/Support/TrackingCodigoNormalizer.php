<?php

namespace App\Domain\Tracking\Support;

/**
 * Normaliza letras de CODIGO Tracking (A–Z, multi-selección).
 * Persistencia: "A,C,F" (mayúsculas, únicas, ordenadas).
 */
final class TrackingCodigoNormalizer
{
    /**
     * @param  list<string>|string|null  $input
     */
    public static function normalize(array|string|null $input): ?string
    {
        $letters = self::toLetters($input);
        if ($letters === []) {
            return null;
        }

        return implode(',', $letters);
    }

    /**
     * @param  list<string>|string|null  $input
     * @return list<string>
     */
    public static function toLetters(array|string|null $input): array
    {
        if ($input === null || $input === '') {
            return [];
        }

        if (is_array($input)) {
            $parts = $input;
        } else {
            $split = preg_split('/[\s,;|]+/', (string) $input);
            $parts = is_array($split) ? $split : [];
        }
        $set = [];
        foreach ($parts as $part) {
            $letter = strtoupper(trim((string) $part));
            if (strlen($letter) === 1 && $letter >= 'A' && $letter <= 'Z') {
                $set[$letter] = true;
            }
        }

        $letters = array_keys($set);
        sort($letters, SORT_STRING);

        return $letters;
    }

    /**
     * @return list<string>
     */
    public static function alphabet(): array
    {
        return range('A', 'Z');
    }
}
