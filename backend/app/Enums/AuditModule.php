<?php

namespace App\Enums;

enum AuditModule: string
{
    case Auth = 'AUTH';
    case Schools = 'SCHOOLS';
    case NetworkAssignments = 'NETWORK_ASSIGNMENTS';
    case Contacts = 'CONTACTS';
    case Prtg = 'PRTG';
    case Cloudnet = 'CLOUDNET';
    case Incidents = 'INCIDENTS';
    case TrackingGeneral = 'TRACKING_GENERAL';
    case Reports = 'REPORTS';
    case Users = 'USERS';
    case Administration = 'ADMINISTRATION';

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
            self::Auth => 'Autenticación',
            self::Schools => 'Locales educativos',
            self::NetworkAssignments => 'Asignaciones de red',
            self::Contacts => 'Contactos',
            self::Prtg => 'PRTG',
            self::Cloudnet => 'Cloudnet',
            self::Incidents => 'Incidencias',
            self::TrackingGeneral => 'Tracking General',
            self::Reports => 'Reportes',
            self::Users => 'Usuarios',
            self::Administration => 'Administración',
        };
    }
}
