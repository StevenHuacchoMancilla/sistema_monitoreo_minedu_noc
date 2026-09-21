<?php

namespace App\Enums;

enum FollowupStatus: string
{
    case PendienteContacto = 'PENDIENTE_CONTACTO';
    case EnGestion = 'EN_GESTION';
    case EnDescarte = 'EN_DESCARTE';
    case EnEspera = 'EN_ESPERA';
    case Escalado = 'ESCALADO';
    case TecnicoEnCampo = 'TECNICO_EN_CAMPO';
    case Recuperado = 'RECUPERADO';
    case Cerrado = 'CERRADO';

    /**
     * @return list<string>
     */
    public static function values(): array
    {
        return array_column(self::cases(), 'value');
    }

    /**
     * Estados activos en gestión (no pendientes ni cerrados).
     *
     * @return list<string>
     */
    public static function managingValues(): array
    {
        return [
            self::EnGestion->value,
            self::EnDescarte->value,
            self::EnEspera->value,
            self::Escalado->value,
            self::TecnicoEnCampo->value,
        ];
    }

    public function label(): string
    {
        return match ($this) {
            self::PendienteContacto => 'Pendiente contacto',
            self::EnGestion => 'En gestión',
            self::EnDescarte => 'En descarte',
            self::EnEspera => 'En espera',
            self::Escalado => 'Escalado',
            self::TecnicoEnCampo => 'Técnico en campo',
            self::Recuperado => 'Recuperado',
            self::Cerrado => 'Cerrado',
        };
    }
}
