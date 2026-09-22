<?php

namespace App\Enums;

enum ManagementScope: string
{
    case Pext = 'PEXT';
    case Pint = 'PINT';

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
            self::Pext => 'PEXT (externo)',
            self::Pint => 'PINT (interno)',
        };
    }
}
