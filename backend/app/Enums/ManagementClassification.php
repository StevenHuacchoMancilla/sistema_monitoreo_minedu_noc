<?php

namespace App\Enums;

enum ManagementClassification: string
{
    case NewOutage = 'NEW_OUTAGE';
    case ContactConfirmed = 'CONTACT_CONFIRMED';
    /** Caída de un solo enlace (doble WAN / P2P). */
    case LinkOutage = 'LINK_OUTAGE';
    case NoResponse = 'NO_RESPONSE';
    /** Histórico: ya no se ofrece en la UI de gestión. */
    case Complaint = 'COMPLAINT';
    case Unclassified = 'UNCLASSIFIED';

    /**
     * @return list<string>
     */
    public static function values(): array
    {
        return array_column(self::cases(), 'value');
    }

    /**
     * Opciones seleccionables al registrar gestión (TIPO 1 / 2 / 3).
     *
     * @return list<string>
     */
    public static function operableValues(): array
    {
        return [
            self::ContactConfirmed->value,
            self::LinkOutage->value,
            self::NoResponse->value,
        ];
    }

    public function label(): string
    {
        return match ($this) {
            self::NewOutage => 'Nueva caída',
            self::ContactConfirmed => 'TIPO 1',
            self::LinkOutage => 'TIPO 2',
            self::NoResponse => 'TIPO 3',
            self::Complaint => 'Queja / reclamo',
            self::Unclassified => 'Sin clasificar',
        };
    }

    public function hint(): string
    {
        return match ($this) {
            self::ContactConfirmed => 'Para reporte',
            self::LinkOutage => 'Caída solo de un enlace en P2P',
            self::NoResponse => 'Equipos apagados, corte de energía, sin respuesta, etc.',
            self::NewOutage => 'Detectada automáticamente por PRTG',
            self::Complaint => 'Histórico (ya no se usa)',
            self::Unclassified => 'Sin clasificar',
        };
    }

    public function colorKey(): string
    {
        return match ($this) {
            self::ContactConfirmed => 'red',
            self::LinkOutage => 'orange',
            self::NoResponse => 'yellow',
            self::NewOutage => 'slate',
            self::Complaint => 'blue',
            self::Unclassified => 'slate',
        };
    }
}
