<?php

namespace App\Domain\Reports\Support;

use App\Enums\ListaLleeEstado;
use App\Enums\MonitoringStatus;
use App\Models\Incident;

/**
 * ESTADO de la LISTA DE LLEE: lo define el operador en Vista de reporte.
 * Si aún no eligió, se infiere Requerimiento / Averías desde colas sticky.
 */
final class ListaLleeEstadoResolver
{
    public static function resolve(Incident $incident): ?ListaLleeEstado
    {
        if ($incident->lista_llee_estado instanceof ListaLleeEstado) {
            return $incident->lista_llee_estado;
        }

        $raw = $incident->getAttributes()['lista_llee_estado'] ?? null;
        if (is_string($raw) && $raw !== '') {
            return ListaLleeEstado::tryFrom($raw);
        }

        if ($incident->isOpenRequirement()) {
            return ListaLleeEstado::Requerimiento;
        }
        if ($incident->isOpenGrave()) {
            return ListaLleeEstado::Averias;
        }

        return null;
    }

    /**
     * ✔ = PRTG operativo · ✖ = caído / parcial / sin dato.
     */
    public static function prtgMark(Incident $incident): string
    {
        return self::prtgStatus($incident) === MonitoringStatus::Operativo ? '✔' : '✖';
    }

    public static function prtgStatus(Incident $incident): ?MonitoringStatus
    {
        $raw = $incident->sensor?->normalized_status
            ?? $incident->current_status
            ?? null;

        if ($raw instanceof MonitoringStatus) {
            return $raw;
        }

        return MonitoringStatus::tryFrom((string) $raw);
    }

    public static function zona(?string $provincia, ?string $distrito = null): ?string
    {
        $hay = mb_strtoupper(trim((string) $provincia).' '.trim((string) $distrito));
        if (trim($hay) === '') {
            return null;
        }

        if (str_contains($hay, 'NAUTA') || str_contains($hay, 'YURIMAGUAS') || str_contains($hay, 'ALTO AMAZONAS')) {
            return 'YURIMAGUAS';
        }
        if (
            str_contains($hay, 'REQUENA')
            || str_contains($hay, 'UCAYALI')
            || str_contains($hay, 'CONTAMANA')
            || str_contains($hay, 'SARAYACU')
            || str_contains($hay, 'PAMPA HERMOSA')
        ) {
            return 'PUCALLPA';
        }

        return 'IQUITOS';
    }
}
