<?php

namespace App\Domain\Reports\Support;

use App\Enums\FollowupStatus;
use App\Enums\ListaLleeEstado;
use App\Enums\MineduReason;
use App\Enums\MonitoringStatus;
use App\Models\Incident;

/**
 * Autocompleta ESTADO de la LISTA DE LLEE desde gestión + PRTG + causa raíz.
 *
 * Ejemplos: LE05 → Energia · LE07 → Equipos apagados · RM* / razón Requerimiento → Requerimiento
 */
final class ListaLleeEstadoResolver
{
    /** Códigos que implican corte / problema energético. */
    private const ENERGY_CODES = ['LE05', 'LE06', 'MN04', 'ND05'];

    /** Códigos de equipos apagados / manipulación. */
    private const POWERED_OFF_CODES = ['LE07'];

    public static function resolve(Incident $incident): ListaLleeEstado
    {
        $code = strtoupper(trim((string) ($incident->root_cause_code ?? '')));
        $code = preg_replace('/\s+.*/', '', $code) ?: '';

        $minedu = $incident->minedu_reason instanceof MineduReason
            ? $incident->minedu_reason
            : MineduReason::tryFrom((string) $incident->minedu_reason);

        $prtg = self::prtgStatus($incident);
        $recovered = $incident->recovered_at !== null;

        if ($minedu === MineduReason::Requerimiento || str_starts_with($code, 'RM')) {
            return ListaLleeEstado::Requerimiento;
        }

        if ($prtg === MonitoringStatus::Parcial || $incident->isManualPartial()) {
            return ListaLleeEstado::EnlaceParcial;
        }

        if ($recovered && $prtg === MonitoringStatus::Operativo) {
            return ListaLleeEstado::Restablecido;
        }

        if ($recovered) {
            return ListaLleeEstado::Restablecido;
        }

        if ($code !== '' && in_array($code, self::ENERGY_CODES, true)) {
            return ListaLleeEstado::Energia;
        }

        if ($code !== '' && in_array($code, self::POWERED_OFF_CODES, true)) {
            return ListaLleeEstado::EquiposApagados;
        }

        if (self::isDescartes($incident)) {
            return ListaLleeEstado::DescartesEnCurso;
        }

        if (self::isSinRespuesta($incident)) {
            return ListaLleeEstado::SinRespuesta;
        }

        if ($prtg === MonitoringStatus::Operativo && $incident->management_classification === null) {
            return ListaLleeEstado::Activo;
        }

        // Avería solo con causa raíz técnica ya definida (MN/ND/LE/TR/GS…).
        // Sin código todavía = descartes en curso (aún no se sabe la categoría).
        if ($code !== '') {
            return ListaLleeEstado::Averias;
        }

        return ListaLleeEstado::DescartesEnCurso;
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

    private static function isDescartes(Incident $incident): bool
    {
        $last = $incident->relationLoaded('managements')
            ? $incident->managements->first()
            : null;

        if ($last && (
            ($last->contact_role_snapshot ?? null) === 'DESCARTES'
            || ($last->contact_name_snapshot ?? null) === 'Según descartes realizados'
        )) {
            return true;
        }

        $detail = mb_strtolower((string) ($incident->detail_text ?? ''));

        return str_contains($detail, 'descartes');
    }

    private static function isSinRespuesta(Incident $incident): bool
    {
        if ($incident->followup_status === FollowupStatus::EnEspera) {
            $last = $incident->relationLoaded('managements')
                ? $incident->managements->first()
                : null;
            if ($last && $last->contact_id === null && ($last->contact_role_snapshot ?? null) !== 'DESCARTES') {
                $detail = mb_strtolower((string) ($last->detail ?? $incident->detail_text ?? ''));
                if (str_contains($detail, 'sin respuesta') || trim((string) ($last->detail ?? '')) === '') {
                    return true;
                }
            }
        }

        $detail = mb_strtolower((string) ($incident->detail_text ?? ''));

        return str_contains($detail, 'sin respuesta');
    }
}
