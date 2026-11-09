<?php

namespace App\Enums;

enum MineduReason: string
{
    case CaidaEnlace = 'CAIDA_ENLACE';
    case CaidaEnergia = 'CAIDA_ENERGIA';
    case Requerimiento = 'REQUERIMIENTO';
    case Queja = 'QUEJA';

    /**
     * @return list<string>
     */
    public static function values(): array
    {
        return array_column(self::cases(), 'value');
    }

    /**
     * Razones seleccionables en gestión (Anexo 30 / ticketera).
     * CAIDA_ENERGIA queda solo por compatibilidad con histórico.
     *
     * @return list<string>
     */
    public static function operableValues(): array
    {
        return [
            self::CaidaEnlace->value,
            self::Requerimiento->value,
            self::Queja->value,
        ];
    }

    public function label(): string
    {
        return match ($this) {
            self::CaidaEnlace => 'Caída de enlace',
            self::CaidaEnergia => 'Caída de energía',
            self::Requerimiento => 'Requerimiento',
            self::Queja => 'Queja',
        };
    }

    /**
     * Clasificación interna para reportes (rojo = incidencia / caída de enlace).
     */
    public function toManagementClassification(): ManagementClassification
    {
        return match ($this) {
            self::CaidaEnlace => ManagementClassification::ContactConfirmed,
            self::CaidaEnergia => ManagementClassification::NoResponse,
            self::Requerimiento => ManagementClassification::LinkOutage,
            self::Queja => ManagementClassification::Complaint,
        };
    }

    /** Caída de enlace y Queja se tratan como incidencia operativa. */
    public function marksAsIncident(): bool
    {
        return $this === self::CaidaEnlace || $this === self::Queja;
    }

    /** Requerimiento pasa al apartado Requerimientos (misma lógica sticky que Incidencias). */
    public function marksAsRequirement(): bool
    {
        return $this === self::Requerimiento;
    }
}
