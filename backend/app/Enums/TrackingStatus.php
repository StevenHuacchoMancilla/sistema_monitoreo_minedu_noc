<?php

namespace App\Enums;

enum TrackingStatus: string
{
    case Open = 'OPEN';
    case InProgress = 'IN_PROGRESS';
    case TechnicallyRecovered = 'TECHNICALLY_RECOVERED';
    case Closed = 'CLOSED';

    /**
     * @return list<string>
     */
    public static function values(): array
    {
        return array_column(self::cases(), 'value');
    }

    /**
     * Estados que aún requieren gestión (no cerrados).
     *
     * @return list<string>
     */
    public static function openValues(): array
    {
        return [
            self::Open->value,
            self::InProgress->value,
            self::TechnicallyRecovered->value,
        ];
    }

    public function label(): string
    {
        return match ($this) {
            self::Open => 'Abierto',
            self::InProgress => 'En seguimiento',
            self::TechnicallyRecovered => 'Recuperado técnicamente',
            self::Closed => 'Cerrado',
        };
    }

    public function isClosed(): bool
    {
        return $this === self::Closed;
    }

    public function isOpen(): bool
    {
        return ! $this->isClosed();
    }
}
