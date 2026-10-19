<?php

namespace App\Enums;

enum PrtgSensorRole: string
{
    case Ping = 'PING';
    case Transmision = 'TRANSMISION';
    case Recepcion = 'RECEPCION';
    case Other = 'OTHER';

    /**
     * @return list<string>
     */
    public static function values(): array
    {
        return array_column(self::cases(), 'value');
    }

    public static function fromSensorName(?string $name, ?string $type = null): self
    {
        $hay = mb_strtoupper(trim((string) $name.' '.(string) $type));

        if ($hay === '' ) {
            return self::Other;
        }

        if (preg_match('/\bPING\b/', $hay) || $hay === 'PING') {
            return self::Ping;
        }

        if (str_contains($hay, 'TRANSMISION') || str_contains($hay, 'TRANSMISI')) {
            return self::Transmision;
        }

        if (str_contains($hay, 'RECEPCION') || str_contains($hay, 'RECEPCI')) {
            return self::Recepcion;
        }

        return self::Other;
    }

    public function label(): string
    {
        return match ($this) {
            self::Ping => 'Ping',
            self::Transmision => 'Transmisión',
            self::Recepcion => 'Recepción',
            self::Other => 'Otro',
        };
    }
}
