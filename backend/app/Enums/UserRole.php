<?php

namespace App\Enums;

use App\Domain\Auth\PermissionCatalog;

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

    /**
     * @return list<string>
     */
    public function permissions(): array
    {
        return PermissionCatalog::forRole($this);
    }

    public function hasPermission(string $permission): bool
    {
        return PermissionCatalog::roleHas($this, $permission);
    }
}
