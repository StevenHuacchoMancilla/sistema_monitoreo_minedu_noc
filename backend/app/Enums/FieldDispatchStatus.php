<?php

namespace App\Enums;

enum FieldDispatchStatus: string
{
    case Planned = 'PLANNED';
    case Dispatched = 'DISPATCHED';
    case OnSite = 'ON_SITE';
    case Cancelled = 'CANCELLED';
    case Completed = 'COMPLETED';

    /**
     * @return list<string>
     */
    public static function values(): array
    {
        return array_column(self::cases(), 'value');
    }

    /**
     * @return list<string>
     */
    public static function activeValues(): array
    {
        return [
            self::Planned->value,
            self::Dispatched->value,
            self::OnSite->value,
        ];
    }

    public function label(): string
    {
        return match ($this) {
            self::Planned => 'Planificado',
            self::Dispatched => 'Despachado',
            self::OnSite => 'En sitio',
            self::Cancelled => 'Cancelado',
            self::Completed => 'Completado',
        };
    }

    public function isActive(): bool
    {
        return in_array($this->value, self::activeValues(), true);
    }
}
