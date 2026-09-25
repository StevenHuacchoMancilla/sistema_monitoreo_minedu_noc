<?php

namespace App\Enums;

enum AffectedWanNode: string
{
    case Principal = 'PRINCIPAL';
    case Secundario = 'SECUNDARIO';

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
            self::Principal => 'Nodo principal (WAN A)',
            self::Secundario => 'Nodo secundario (WAN B)',
        };
    }
}
