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
    /** Comentario / seguimiento sin razón MINEDU (no es incidencia). */
    case FollowUp = 'FOLLOW_UP';
    case Unclassified = 'UNCLASSIFIED';

    /**
     * @return list<string>
     */
    public static function values(): array
    {
        return array_column(self::cases(), 'value');
    }

    /**
     * Clasificaciones que aún pueden llegar desde gestión (derivadas de razón MINEDU o seguimiento).
     *
     * @return list<string>
     */
    public static function operableValues(): array
    {
        return [
            self::ContactConfirmed->value,
            self::LinkOutage->value,
            self::NoResponse->value,
            self::Complaint->value,
            self::FollowUp->value,
        ];
    }

    public function label(): string
    {
        return match ($this) {
            self::NewOutage => 'Nueva caída',
            self::ContactConfirmed => 'Caída de enlace',
            self::LinkOutage => 'Requerimiento',
            self::NoResponse => 'Sin respuesta',
            self::Complaint => 'Queja',
            self::FollowUp => 'Seguimiento',
            self::Unclassified => 'Sin clasificar',
        };
    }

    public function hint(): string
    {
        return match ($this) {
            self::ContactConfirmed => 'Incidencia / para reporte (rojo)',
            self::LinkOutage => 'Requerimiento MINEDU',
            self::NoResponse => 'Corte de energía u origen similar',
            self::NewOutage => 'Detectada automáticamente por PRTG',
            self::Complaint => 'Queja o reclamo',
            self::FollowUp => 'Comentario de seguimiento sin razón MINEDU',
            self::Unclassified => 'Sin clasificar',
        };
    }

    public function colorKey(): string
    {
        return match ($this) {
            self::ContactConfirmed => 'red',
            self::LinkOutage => 'orange',
            self::NoResponse => 'yellow',
            self::NewOutage => 'yellow',
            self::Complaint => 'blue',
            self::FollowUp => 'slate',
            self::Unclassified => 'slate',
        };
    }
}
