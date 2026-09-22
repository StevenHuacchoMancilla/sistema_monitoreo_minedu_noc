<?php

namespace App\Enums;

enum UserRole: string
{
    case Admin = 'ADMIN';
    case NocOperator = 'NOC_OPERATOR';
    case Viewer = 'VIEWER';

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
            self::Admin => 'Administrador',
            self::NocOperator => 'Operador NOC',
            self::Viewer => 'Solo lectura',
        };
    }

    public function canWrite(): bool
    {
        return $this === self::Admin || $this === self::NocOperator;
    }

    public function isAdmin(): bool
    {
        return $this === self::Admin;
    }
}
