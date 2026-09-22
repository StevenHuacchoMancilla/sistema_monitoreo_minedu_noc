<?php

namespace App\Domain\Tracking\Support;

/**
 * Separa la columna SEGUIMIENTO histórica en entradas de timeline.
 *
 * @phpstan-type FollowupItem array{occurred_on: ?string, body: string}
 */
class TrackingFollowupParser
{
    public function __construct(private readonly TrackingDateParser $dates) {}

    /**
     * @return list<FollowupItem>
     */
    public function parse(string $raw, int $year): array
    {
        $raw = trim(str_replace(["\r\n", "\r"], "\n", $raw));
        if ($raw === '') {
            return [];
        }

        $lines = explode("\n", $raw);
        $items = [];
        $current = null;

        foreach ($lines as $line) {
            $line = trim($line);
            if ($line === '') {
                continue;
            }

            $normalized = preg_replace('#(\d{1,2})/+(\d{1,2})#', '$1/$2', $line) ?? $line;

            if (preg_match('#^(\d{1,2}/\d{1,2}(?:/\d{2,4})?)\s+(.+)$#u', $normalized, $m) === 1) {
                if ($current !== null) {
                    $items[] = $current;
                }

                $parsed = $this->dates->parse($m[1], $m[1], $year);
                $current = [
                    'occurred_on' => $parsed !== null ? $parsed['at']->toDateString() : null,
                    'body' => trim($m[2]),
                ];

                continue;
            }

            // Línea sin fecha clara: no perder texto.
            if ($current !== null) {
                $current['body'] .= "\n".$line;
            } else {
                $current = [
                    'occurred_on' => null,
                    'body' => $line,
                ];
            }
        }

        if ($current !== null) {
            $items[] = $current;
        }

        return $items;
    }
}
