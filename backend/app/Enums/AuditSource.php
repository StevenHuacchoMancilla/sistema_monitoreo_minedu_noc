<?php

namespace App\Enums;

enum AuditSource: string
{
    case Api = 'API';
    case Import = 'IMPORT';
    case System = 'SYSTEM';
    case Cli = 'CLI';

    /**
     * @return list<string>
     */
    public static function values(): array
    {
        return array_column(self::cases(), 'value');
    }
}
