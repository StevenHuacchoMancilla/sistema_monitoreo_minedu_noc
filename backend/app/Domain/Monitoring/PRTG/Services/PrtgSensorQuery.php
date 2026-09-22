<?php

namespace App\Domain\Monitoring\PRTG\Services;

use App\Enums\FollowupStatus;
use App\Enums\MonitoringStatus;
use App\Models\Incident;
use App\Models\PrtgSensor;
use Illuminate\Support\Facades\DB;

/**
 * Consultas canónicas de Ping: 1 sensor por network_assignment (el más reciente).
 */
class PrtgSensorQuery
{
    /**
     * Subquery SQL (PostgreSQL DISTINCT ON) con un Ping por asignación.
     */
    public static function canonicalPingSubquery(): string
    {
        return <<<'SQL'
            SELECT DISTINCT ON (network_assignment_id)
                id,
                network_assignment_id,
                normalized_status,
                last_synced_at,
                prtg_sensor_id,
                prtg_device_id
            FROM prtg_sensors
            WHERE LOWER(name) = 'ping'
              AND network_assignment_id IS NOT NULL
            ORDER BY network_assignment_id, last_synced_at DESC NULLS LAST, id DESC
        SQL;
    }

    /**
     * @return array<string, int> status => count
     */
    public static function statusCounts(): array
    {
        $rows = DB::select(
            'SELECT normalized_status, COUNT(*)::int AS total FROM ('.self::canonicalPingSubquery().') canonical GROUP BY normalized_status'
        );

        $out = [];
        foreach ($rows as $row) {
            $out[(string) $row->normalized_status] = (int) $row->total;
        }

        return $out;
    }

    public static function monitoredAssignmentCount(): int
    {
        return (int) DB::selectOne(
            'SELECT COUNT(*)::int AS c FROM ('.self::canonicalPingSubquery().') canonical'
        )->c;
    }

    public static function currentScope(): string
    {
        $probe = (string) config('prtg.allowed_probe');
        $root = (string) config('prtg.allowed_root_group');

        return $probe.' > '.$root;
    }

    /**
     * Elimina sensores de scopes anteriores y cierra incidencias atadas a ellos.
     *
     * @return array{deleted_sensors: int, closed_incidents: int}
     */
    public static function pruneObsoleteScopeSensors(?string $scope = null): array
    {
        $scope ??= self::currentScope();

        $obsoleteIds = PrtgSensor::query()
            ->where(function ($q) use ($scope) {
                $q->whereRaw("(metadata->>'source_scope') IS NULL")
                    ->orWhereRaw("(metadata->>'source_scope') <> ?", [$scope]);
            })
            ->pluck('id');

        if ($obsoleteIds->isEmpty()) {
            return ['deleted_sensors' => 0, 'closed_incidents' => 0];
        }

        $closed = 0;
        $open = Incident::query()
            ->active()
            ->whereIn('prtg_sensor_id', $obsoleteIds)
            ->get();

        foreach ($open as $incident) {
            app(\App\Domain\Incidents\Services\IncidentService::class)->applyTechnicalRecovery(
                $incident,
                'Incidencia cerrada: sensor PRTG obsoleto tras cambio de scope (rama anterior).'
            );
            $closed++;
        }

        // También eventos que referencian sensores a borrar quedan con nullOnDelete.
        $deleted = PrtgSensor::query()->whereIn('id', $obsoleteIds)->delete();

        return [
            'deleted_sensors' => $deleted,
            'closed_incidents' => $closed,
        ];
    }
}
