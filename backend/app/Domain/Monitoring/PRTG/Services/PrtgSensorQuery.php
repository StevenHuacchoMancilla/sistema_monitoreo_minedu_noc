<?php

namespace App\Domain\Monitoring\PRTG\Services;

use App\Enums\FollowupStatus;
use App\Enums\MonitoringStatus;
use App\Models\Incident;
use App\Models\PrtgSensor;
use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Throwable;

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
            ->with('sensor')
            ->get();

        foreach ($open as $incident) {
            $upSince = self::resolvePruneRecoveryFromPrtg($incident);
            $note = $upSince !== null
                ? 'Incidencia cerrada: sensor PRTG obsoleto tras cambio de scope; recovered_at según OK PRTG (messages).'
                : 'Incidencia cerrada: sensor PRTG obsoleto tras cambio de scope (rama anterior); sin evidencia OK PRTG.';

            app(\App\Domain\Incidents\Services\IncidentService::class)->applyTechnicalRecovery(
                $incident,
                $note,
                $upSince,
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

    /**
     * Busca el OK PRTG del intervalo Fallo→OK más cercano al started_at de la incidencia.
     * Evita cerrar con wall-clock del prune cuando el enlace ya estaba UP hace días.
     */
    private static function resolvePruneRecoveryFromPrtg(Incident $incident): ?CarbonInterface
    {
        $sensor = $incident->sensor;
        $startedAt = $incident->started_at;
        if ($sensor === null || $startedAt === null || ! $sensor->prtg_sensor_id) {
            return null;
        }

        try {
            $fromUtc = CarbonImmutable::instance($startedAt)->subHours(6)->utc();
            $toUtc = CarbonImmutable::now('UTC');
            $outages = app(PrtgHistoricOutageReader::class)
                ->intervalsForSensor((int) $sensor->prtg_sensor_id, $fromUtc, $toUtc)['outages'];

            $best = null;
            $bestDelta = PHP_INT_MAX;
            foreach ($outages as $outage) {
                $end = $outage['recovered_at'] ?? null;
                if ($end === null) {
                    continue;
                }
                $delta = abs($startedAt->getTimestamp() - $outage['started_at']->getTimestamp());
                if ($delta < $bestDelta) {
                    $bestDelta = $delta;
                    $best = $end;
                }
            }

            // Solo confiar si el Fallo PRTG está cerca del started_at operativo (±12 h).
            if ($best === null || $bestDelta > 12 * 3600) {
                return null;
            }

            return $best;
        } catch (Throwable $e) {
            Log::warning('prune: no se pudo leer OK histórico PRTG', [
                'incident_id' => $incident->id,
                'prtg_sensor_id' => $sensor->prtg_sensor_id,
                'error' => $e->getMessage(),
            ]);

            return null;
        }
    }
}
