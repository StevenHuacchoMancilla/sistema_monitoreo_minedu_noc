<?php

namespace App\Enums;

enum MonitoringStatus: string
{
    case Operativo = 'OPERATIVO';
    case Caido = 'CAIDO';
    case Parcial = 'PARCIAL';
    case Pausado = 'PAUSADO';
    case SinDatos = 'SIN_DATOS';
    case Desconocido = 'DESCONOCIDO';

    public static function fromPrtgRaw(?int $statusRaw): self
    {
        return match ($statusRaw) {
            3 => self::Operativo,
            5, 13 => self::Caido,
            4, 14 => self::Parcial,
            7, 8, 9, 11, 12 => self::Pausado,
            null => self::SinDatos,
            default => self::Desconocido,
        };
    }
}
