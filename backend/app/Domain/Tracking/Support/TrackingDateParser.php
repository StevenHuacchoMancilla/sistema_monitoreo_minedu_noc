<?php

namespace App\Domain\Tracking\Support;

use App\Enums\DatePrecision;
use Carbon\Carbon;
use PhpOffice\PhpSpreadsheet\Shared\Date as ExcelDate;

class TrackingDateParser
{
    /**
     * @return array{at: Carbon, precision: DatePrecision}|null
     */
    public function parse(mixed $raw, ?string $formatted, int $year): ?array
    {
        if ($raw === null && ($formatted === null || trim($formatted) === '')) {
            return null;
        }

        $text = trim((string) ($formatted !== null && trim($formatted) !== '' ? $formatted : ''));
        if ($text === '' && $raw !== null && ! is_numeric($raw)) {
            $text = trim((string) $raw);
        }

        if ($text !== '') {
            // Preferir dd/mm del formateo visual (Excel Tracking usa día/mes).
            $text = preg_replace('#(\d{1,2})/+(\d{1,2})#', '$1/$2', $text) ?? $text;
            $text = preg_replace('/\s+/', ' ', $text) ?? $text;

            if (preg_match('#^(\d{1,2})/(\d{1,2})(?:/(\d{2,4}))?(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$#', $text, $m) === 1) {
                $day = (int) $m[1];
                $month = (int) $m[2];
                $y = isset($m[3]) && $m[3] !== '' ? (int) $m[3] : $year;
                if ($y < 100) {
                    $y += 2000;
                }

                $hasTime = isset($m[4]) && $m[4] !== '';
                if ($hasTime) {
                    $at = Carbon::create($y, $month, $day, (int) $m[4], (int) $m[5], (int) ($m[6] ?? 0));

                    return $at ? [
                        'at' => $at,
                        'precision' => DatePrecision::DateTime,
                    ] : null;
                }

                $at = Carbon::create($y, $month, $day, 0, 0, 0);

                return $at ? [
                    'at' => $at->startOfDay(),
                    'precision' => DatePrecision::Date,
                ] : null;
            }
        }

        // Fallback: serial Excel real (cuando no hay dd/mm legible).
        if (is_numeric($raw) && (float) $raw > 20000) {
            try {
                $dt = ExcelDate::excelToDateTimeObject((float) $raw);
                $carbon = Carbon::instance($dt)->startOfDay();

                return [
                    'at' => $carbon,
                    'precision' => DatePrecision::Date,
                ];
            } catch (\Throwable) {
                return null;
            }
        }

        return null;
    }
}
