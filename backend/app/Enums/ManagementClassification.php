<?php

namespace App\Enums;

enum ManagementClassification: string
{
    case NewOutage = 'NEW_OUTAGE';
    case ContactConfirmed = 'CONTACT_CONFIRMED';
    case NoResponse = 'NO_RESPONSE';
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
     * Clasificaciones operativas gestionables por el operador (sin UNCLASSIFIED).
     *
     * @return list<string>
     */
    public static function operableValues(): array
    {
        return [
            self::NewOutage->value,
            self::ContactConfirmed->value,
            self::NoResponse->value,
            self::Complaint->value,
        ];
    }

    public function label(): string
    {
        return match ($this) {
            self::NewOutage => 'Nueva caída',
            self::ContactConfirmed => 'Contacto confirmado',
            self::NoResponse => 'En espera',
            self::Complaint => 'Queja / reclamo',
            self::Unclassified => 'Sin clasificar',
        };
    }

    public function colorKey(): string
    {
        return match ($this) {
            self::NewOutage => 'yellow',
            self::ContactConfirmed => 'red',
            self::NoResponse => 'orange',
            self::Complaint => 'blue',
            self::Unclassified => 'slate',
        };
    }
}
