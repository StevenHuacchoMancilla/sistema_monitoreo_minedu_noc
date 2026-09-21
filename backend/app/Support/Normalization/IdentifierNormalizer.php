<?php

namespace App\Support\Normalization;

class IdentifierNormalizer
{
    public static function text(?string $value): ?string
    {
        if ($value === null) {
            return null;
        }

        $trimmed = trim($value);

        return $trimmed === '' ? null : $trimmed;
    }

    public static function identifier(mixed $value): ?string
    {
        if ($value === null) {
            return null;
        }

        if (is_int($value)) {
            return (string) $value;
        }

        if (is_float($value)) {
            return self::fromNumeric($value);
        }

        $raw = trim((string) $value);
        if ($raw === '') {
            return null;
        }

        $raw = str_replace(["\u{00A0}", ','], ['', ''], $raw);

        if (preg_match('/^-?\d+\.0+$/', $raw) === 1) {
            return substr($raw, 0, strpos($raw, '.'));
        }

        if (preg_match('/^-?\d+$/', $raw) === 1) {
            return $raw;
        }

        if (preg_match('/^-?\d+\.\d+E[+-]?\d+$/i', $raw) === 1) {
            return self::fromScientific($raw) ?? self::fromNumeric((float) $raw);
        }

        if (preg_match('/^0\.(\d+)$/', $raw) === 1) {
            return substr($raw, 2);
        }

        if (preg_match('/^-?\d+\.\d+$/', $raw) === 1) {
            return self::fromNumeric((float) $raw);
        }

        return $raw;
    }

    private static function fromScientific(string $raw): ?string
    {
        if (preg_match('/^([0-9]+)(?:\.([0-9]+))?E([+-]?\d+)$/i', $raw, $matches) !== 1) {
            return null;
        }

        $integer = $matches[1];
        $fraction = $matches[2] ?? '';
        $exponent = (int) $matches[3];
        $digits = $integer.$fraction;
        $point = strlen($integer) + $exponent;

        if ($point <= 0) {
            return str_pad($digits, strlen($digits) + (1 - $point) - 1, '0', STR_PAD_LEFT);
        }

        if ($point >= strlen($digits)) {
            return $digits.str_repeat('0', $point - strlen($digits));
        }

        return $digits;
    }

    public static function phone(mixed $value): ?string
    {
        $normalized = self::identifier($value);
        if ($normalized === null) {
            return null;
        }

        if (str_contains(strtolower($normalized), 'e')) {
            $normalized = self::fromNumeric((float) $normalized) ?? $normalized;
        }

        $digits = preg_replace('/[^\d]/', '', $normalized) ?? '';

        return $digits === '' ? $normalized : $digits;
    }

    public static function sequence(?string $nro): array
    {
        $raw = self::identifier($nro);
        if ($raw === null) {
            return ['current_sequence' => null, 'legacy_reference' => null];
        }

        if (preg_match('/^(\d+)\s*\/\s*(\d+)$/', $raw, $matches) === 1) {
            return [
                'current_sequence' => (int) $matches[1],
                'legacy_reference' => $matches[2],
            ];
        }

        if (preg_match('/^\d+$/', $raw) === 1) {
            return [
                'current_sequence' => (int) $raw,
                'legacy_reference' => null,
            ];
        }

        return ['current_sequence' => null, 'legacy_reference' => $raw];
    }

    public static function normalizeName(?string $value): string
    {
        $text = self::text($value) ?? '';
        $upper = mb_strtoupper($text, 'UTF-8');
        $translated = strtr($upper, [
            'Á' => 'A', 'É' => 'E', 'Í' => 'I', 'Ó' => 'O', 'Ú' => 'U', 'Ü' => 'U', 'Ñ' => 'N',
        ]);
        $clean = preg_replace('/[^A-Z0-9]+/', ' ', $translated) ?? '';

        return trim(preg_replace('/\s+/', ' ', $clean) ?? '');
    }

    private static function fromNumeric(float $number): ?string
    {
        if (! is_finite($number)) {
            return null;
        }

        if ($number == 0.0) {
            return '0';
        }

        if ($number > 0 && $number < 1) {
            $formatted = rtrim(rtrim(sprintf('%.10f', $number), '0'), '.');
            if (preg_match('/^0\.(\d+)$/', $formatted) === 1) {
                return substr($formatted, 2);
            }
        }

        if (floor($number) == $number && abs($number) < 1e15) {
            return sprintf('%.0f', $number);
        }

        return rtrim(rtrim(sprintf('%.15F', $number), '0'), '.');
    }
}
