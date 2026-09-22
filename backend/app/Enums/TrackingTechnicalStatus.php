<?php

namespace App\Enums;

enum TrackingTechnicalStatus: string
{
    case Down = 'DOWN';
    case Recovered = 'RECOVERED';

    /**
     * @return list<string>
     */
    public static function values(): array
    {
        return array_column(self::cases(), 'value');
    }

    public function label(): string
    {
        return match ($this) {
            self::Down => 'PRTG caído',
            self::Recovered => 'PRTG operativo',
        };
    }
}
