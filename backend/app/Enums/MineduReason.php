<?php

namespace App\Enums;

enum MineduReason: string
{
    case CaidaEnlace = 'CAIDA_ENLACE';
    case CaidaEnergia = 'CAIDA_ENERGIA';
    case Requerimiento = 'REQUERIMIENTO';

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
            self::CaidaEnlace => 'Caída de enlace',
            self::CaidaEnergia => 'Caída de energía',
            self::Requerimiento => 'Requerimiento',
        };
    }
}
