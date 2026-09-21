<?php

namespace App\Enums;

enum ContactResult: string
{
    case EquiposApagados = 'EQUIPOS_APAGADOS';
    case SinEnergiaElectrica = 'SIN_ENERGIA_ELECTRICA';
    case ConEnergiaSinServicio = 'CON_ENERGIA_SIN_SERVICIO';
    case ServicioOperativo = 'SERVICIO_OPERATIVO';
    case FallaFibraAtenuacion = 'FALLA_FIBRA_ATENUACION';
    case FallaRouterOntAp = 'FALLA_ROUTER_ONT_AP';
    case RequiereTecnico = 'REQUIERE_TECNICO';
    case Otro = 'OTRO';

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
            self::EquiposApagados => 'Equipos apagados',
            self::SinEnergiaElectrica => 'Sin energía eléctrica',
            self::ConEnergiaSinServicio => 'Con energía / sin servicio',
            self::ServicioOperativo => 'Servicio operativo',
            self::FallaFibraAtenuacion => 'Falla de fibra / atenuación',
            self::FallaRouterOntAp => 'Falla de router/ONT/AP',
            self::RequiereTecnico => 'Requiere técnico',
            self::Otro => 'Otro',
        };
    }
}
