<?php

namespace App\Enums;

/**
 * Estados de la LISTA DE LLEE (columna ESTADO del Excel operativo).
 */
enum ListaLleeEstado: string
{
    case Averias = 'Averias';
    case DescartesEnCurso = 'Descartes en curso';
    case SinRespuesta = 'Sin respuesta';
    case EquiposApagados = 'Equipos apagados';
    case Energia = 'Energia';
    case Restablecido = 'Restablecido';
    case Requerimiento = 'Requerimiento';
    case EnlaceParcial = 'Enlace parcial';
    case Activo = 'Activo';

    /**
     * @return list<string>
     */
    public static function values(): array
    {
        return array_column(self::cases(), 'value');
    }

    /**
     * Orden del tablero RESUMEN PRTG.
     *
     * @return list<self>
     */
    public static function resumenOrder(): array
    {
        return [
            self::Averias,
            self::DescartesEnCurso,
            self::SinRespuesta,
            self::EquiposApagados,
            self::Energia,
            self::Restablecido,
            self::Requerimiento,
            self::EnlaceParcial,
        ];
    }

    public function group(): string
    {
        return match ($this) {
            self::Averias,
            self::DescartesEnCurso,
            self::SinRespuesta,
            self::EquiposApagados,
            self::Energia => 'Caídos',
            self::Restablecido => 'Levantamiento',
            self::Requerimiento,
            self::EnlaceParcial => 'Adicionales',
            self::Activo => 'Activos',
        };
    }

    public function tone(): string
    {
        return match ($this) {
            self::Averias => 'red',
            self::DescartesEnCurso => 'orange',
            self::SinRespuesta => 'blue',
            self::EquiposApagados => 'violet',
            self::Energia => 'amber',
            self::Restablecido => 'green',
            self::Requerimiento => 'slate',
            self::EnlaceParcial => 'stone',
            self::Activo => 'white',
        };
    }

    /**
     * Orden de las tarjetas / lista desplegable (como en el Excel).
     *
     * @return list<self>
     */
    public static function legendOrder(): array
    {
        return [
            self::Averias,
            self::DescartesEnCurso,
            self::SinRespuesta,
            self::EquiposApagados,
            self::Energia,
            self::Requerimiento,
            self::EnlaceParcial,
            self::Restablecido,
            self::Activo,
        ];
    }

    /**
     * Rank para ordenar la Lista para reporte (menor = más arriba).
     * Sin estado queda al final (después de Activo).
     */
    public static function listSortRank(mixed $value): int
    {
        $raw = $value instanceof self ? $value->value : trim((string) ($value ?? ''));
        if ($raw === '') {
            return count(self::legendOrder());
        }

        foreach (self::legendOrder() as $index => $estado) {
            if ($estado->value === $raw) {
                return $index;
            }
        }

        return count(self::legendOrder());
    }
}
