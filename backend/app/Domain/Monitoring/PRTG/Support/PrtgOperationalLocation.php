<?php

namespace App\Domain\Monitoring\PRTG\Support;

use App\Models\NetworkAssignment;
use App\Models\School;
use Illuminate\Database\Eloquent\Builder;

/**
 * Ubicación operativa = jerarquía PRTG persistida en network_assignments.
 * schools.provincia/distrito quedan como fuente admin/Excel (fallback).
 */
final class PrtgOperationalLocation
{
    public static function province(?NetworkAssignment $assignment, ?School $school = null): ?string
    {
        $prtg = self::clean($assignment?->prtg_province);
        if ($prtg !== null) {
            return $prtg;
        }

        return self::clean($school?->provincia);
    }

    public static function district(?NetworkAssignment $assignment, ?School $school = null): ?string
    {
        $prtg = self::clean($assignment?->prtg_district);
        if ($prtg !== null) {
            return $prtg;
        }

        return self::clean($school?->distrito);
    }

    /**
     * @return array{
     *   province: ?string,
     *   district: ?string,
     *   prtg_province: ?string,
     *   prtg_district: ?string,
     *   admin_province: ?string,
     *   admin_district: ?string,
     *   source: 'prtg'|'admin'|'none',
     *   mismatch: bool
     * }
     */
    public static function resolve(?NetworkAssignment $assignment, ?School $school = null): array
    {
        $prtgProvince = self::clean($assignment?->prtg_province);
        $prtgDistrict = self::clean($assignment?->prtg_district);
        $adminProvince = self::clean($school?->provincia);
        $adminDistrict = self::clean($school?->distrito);

        $hasPrtg = $prtgProvince !== null || $prtgDistrict !== null;

        return [
            'province' => $prtgProvince ?? $adminProvince,
            'district' => $prtgDistrict ?? $adminDistrict,
            'prtg_province' => $prtgProvince,
            'prtg_district' => $prtgDistrict,
            'admin_province' => $adminProvince,
            'admin_district' => $adminDistrict,
            'source' => $hasPrtg ? 'prtg' : (($adminProvince !== null || $adminDistrict !== null) ? 'admin' : 'none'),
            'mismatch' => self::isMismatch($prtgProvince, $prtgDistrict, $adminProvince, $adminDistrict),
        ];
    }

    /**
     * Campos listos para respuestas API operativas.
     *
     * @return array{
     *   provincia: ?string,
     *   distrito: ?string,
     *   prtg_province: ?string,
     *   prtg_district: ?string,
     *   admin_provincia: ?string,
     *   admin_distrito: ?string,
     *   location_source: 'prtg'|'admin'|'none',
     *   location_mismatch: bool
     * }
     */
    public static function apiFields(?NetworkAssignment $assignment, ?School $school = null): array
    {
        $location = self::resolve($assignment, $school);

        return [
            'provincia' => $location['province'],
            'distrito' => $location['district'],
            'prtg_province' => $location['prtg_province'],
            'prtg_district' => $location['prtg_district'],
            'admin_provincia' => $location['admin_province'],
            'admin_distrito' => $location['admin_district'],
            'location_source' => $location['source'],
            'location_mismatch' => $location['mismatch'],
        ];
    }

    /**
     * Filtra incidencias (u otros modelos con relation networkAssignment) por ubicación PRTG.
     */
    public static function constrainByAssignment(
        Builder $query,
        ?string $province,
        ?string $district,
        string $relation = 'networkAssignment'
    ): void {
        $province = self::clean($province);
        $district = self::clean($district);

        if ($province !== null) {
            $query->whereHas($relation, function (Builder $q) use ($province) {
                $q->whereRaw('UPPER(TRIM(COALESCE(prtg_province, \'\'))) = ?', [mb_strtoupper($province)]);
            });
        }

        if ($district !== null) {
            $query->whereHas($relation, function (Builder $q) use ($district) {
                $q->whereRaw('UPPER(TRIM(COALESCE(prtg_district, \'\'))) = ?', [mb_strtoupper($district)]);
            });
        }
    }

    public static function clean(mixed $value): ?string
    {
        $trimmed = trim((string) ($value ?? ''));

        return $trimmed !== '' ? $trimmed : null;
    }

    private static function isMismatch(
        ?string $prtgProvince,
        ?string $prtgDistrict,
        ?string $adminProvince,
        ?string $adminDistrict
    ): bool {
        if ($prtgProvince === null && $prtgDistrict === null) {
            return false;
        }

        if ($prtgProvince !== null && $adminProvince !== null && ! self::placesMatch($adminProvince, $prtgProvince)) {
            return true;
        }

        if ($prtgDistrict !== null && $adminDistrict !== null && ! self::placesMatch($adminDistrict, $prtgDistrict)) {
            return true;
        }

        return false;
    }

    private static function placesMatch(string $left, string $right): bool
    {
        return self::normalizePlaceName($left) === self::normalizePlaceName($right);
    }

    private static function normalizePlaceName(string $value): string
    {
        $value = mb_strtoupper(trim($value));
        $value = str_replace(['_', '-'], ' ', $value);
        $value = preg_replace('/\s+/u', ' ', $value) ?? $value;

        if (class_exists(\Normalizer::class)) {
            $decomposed = \Normalizer::normalize($value, \Normalizer::FORM_D);
            if (is_string($decomposed)) {
                $value = preg_replace('/\p{Mn}/u', '', $decomposed) ?? $value;
            }
        } else {
            $value = strtr($value, [
                'Á' => 'A', 'É' => 'E', 'Í' => 'I', 'Ó' => 'O', 'Ú' => 'U', 'Ñ' => 'N',
                'Ü' => 'U',
            ]);
        }

        return $value;
    }
}
