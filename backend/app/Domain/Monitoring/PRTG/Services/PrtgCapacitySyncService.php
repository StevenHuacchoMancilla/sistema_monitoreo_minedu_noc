<?php

namespace App\Domain\Monitoring\PRTG\Services;

use App\Domain\Monitoring\PRTG\Support\PrtgPlanCapacity;
use App\Enums\PrtgSensorRole;
use App\Models\NetworkAssignment;
use App\Models\PrtgSensor;
use Illuminate\Support\Facades\DB;

/**
 * Actualiza capacidad_mbps del assignment desde sensores TRANSMISION / RECEPCION.
 */
class PrtgCapacitySyncService
{
    /**
     * @return array{scanned: int, updated: int, unchanged: int, without_plan: int}
     */
    public function syncAll(): array
    {
        $stats = ['scanned' => 0, 'updated' => 0, 'unchanged' => 0, 'without_plan' => 0];

        NetworkAssignment::query()
            ->orderBy('id')
            ->chunkById(200, function ($assignments) use (&$stats) {
                $ids = $assignments->pluck('id')->all();
                $sensors = PrtgSensor::query()
                    ->whereIn('network_assignment_id', $ids)
                    ->whereIn('sensor_role', [
                        PrtgSensorRole::Transmision->value,
                        PrtgSensorRole::Recepcion->value,
                    ])
                    ->get(['id', 'network_assignment_id', 'name', 'sensor_role'])
                    ->groupBy('network_assignment_id');

                foreach ($assignments as $assignment) {
                    $stats['scanned']++;
                    $group = $sensors->get($assignment->id) ?? collect();
                    $result = $this->applyFromSensors($assignment, $group);
                    $stats[$result]++;
                }
            });

        return $stats;
    }

    /**
     * Recalcula capacidad del assignment a partir de sus sensores TX/RX.
     *
     * @return 'updated'|'unchanged'|'without_plan'
     */
    public function syncAssignment(NetworkAssignment $assignment): string
    {
        $sensors = PrtgSensor::query()
            ->where('network_assignment_id', $assignment->id)
            ->whereIn('sensor_role', [
                PrtgSensorRole::Transmision->value,
                PrtgSensorRole::Recepcion->value,
            ])
            ->get(['id', 'network_assignment_id', 'name', 'sensor_role']);

        return $this->applyFromSensors($assignment, $sensors);
    }

    /**
     * Tras upsert de un sensor TX/RX, actualiza el plan del assignment.
     */
    public function syncFromSensor(PrtgSensor $sensor): void
    {
        $role = (string) ($sensor->sensor_role ?? '');
        if (! in_array($role, [PrtgSensorRole::Transmision->value, PrtgSensorRole::Recepcion->value], true)) {
            return;
        }
        $assignmentId = (int) ($sensor->network_assignment_id ?? 0);
        if ($assignmentId <= 0) {
            return;
        }
        $assignment = NetworkAssignment::query()->find($assignmentId);
        if ($assignment === null) {
            return;
        }
        $this->syncAssignment($assignment);
    }

    /**
     * @param  \Illuminate\Support\Collection<int, PrtgSensor>  $sensors
     * @return 'updated'|'unchanged'|'without_plan'
     */
    private function applyFromSensors(NetworkAssignment $assignment, $sensors): string
    {
        $tx = null;
        $rx = null;
        foreach ($sensors as $sensor) {
            $mbps = PrtgPlanCapacity::mbpsFromName($sensor->name);
            if ($mbps === null) {
                continue;
            }
            if ((string) $sensor->sensor_role === PrtgSensorRole::Transmision->value) {
                $tx = $mbps;
            } elseif ((string) $sensor->sensor_role === PrtgSensorRole::Recepcion->value) {
                $rx = $mbps;
            }
        }

        // Preferir TX; si no hay, RX. Si ambos existen y diferenn, conservar el mayor (plan).
        $plan = $tx ?? $rx;
        if ($tx !== null && $rx !== null) {
            $plan = max($tx, $rx);
        }

        if ($plan === null) {
            return 'without_plan';
        }

        $label = PrtgPlanCapacity::label($plan);
        $current = trim((string) ($assignment->capacidad_mbps ?? ''));
        $normalizedCurrent = preg_replace('/\s+/', '', mb_strtolower($current)) ?? '';
        $normalizedNew = preg_replace('/\s+/', '', mb_strtolower((string) $label)) ?? '';

        if ($normalizedCurrent === $normalizedNew) {
            return 'unchanged';
        }

        DB::table('network_assignments')
            ->where('id', $assignment->id)
            ->update(['capacidad_mbps' => $label]);

        $assignment->capacidad_mbps = $label;

        return 'updated';
    }
}
