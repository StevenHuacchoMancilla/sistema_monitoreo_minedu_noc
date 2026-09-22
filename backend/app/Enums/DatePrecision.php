<?php

namespace App\Enums;

enum DatePrecision: string
{
    case Date = 'DATE';
    case DateTime = 'DATETIME';

    /**
     * @return list<string>
     */
    public static function values(): array
    {
        return array_column(self::cases(), 'value');
    }

    public function hasTime(): bool
    {
        return $this === self::DateTime;
    }
}
