<?php

namespace App\Enums;

enum ContactConfirmedStatus: string
{
    case Si = 'SI';
    case No = 'NO';
    case SinRespuesta = 'SIN_RESPUESTA';
    case NumeroInvalido = 'NUMERO_INVALIDO';

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
            self::Si => 'Sí',
            self::No => 'No',
            self::SinRespuesta => 'Sin respuesta',
            self::NumeroInvalido => 'Número inválido',
        };
    }
}
