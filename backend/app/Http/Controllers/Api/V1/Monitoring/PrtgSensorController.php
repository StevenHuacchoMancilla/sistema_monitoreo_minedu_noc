<?php

namespace App\Http\Controllers\Api\V1\Monitoring;

use App\Http\Controllers\Controller;
use App\Models\NetworkAssignment;
use App\Models\PrtgSensor;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PrtgSensorController extends Controller
{
    /**
     * Sensores PRTG de una asignación (Ping + tráfico) para reportes de consumo.
     */
    public function byAssignment(Request $request, NetworkAssignment $assignment): JsonResponse
    {
        $sensors = PrtgSensor::query()
            ->where('network_assignment_id', $assignment->id)
            ->orderByRaw("CASE sensor_role WHEN 'PING' THEN 0 WHEN 'TRANSMISION' THEN 1 WHEN 'RECEPCION' THEN 2 ELSE 3 END")
            ->orderBy('name')
            ->get()
            ->map(fn (PrtgSensor $s) => [
                'id' => $s->id,
                'prtg_sensor_id' => $s->prtg_sensor_id,
                'name' => $s->name,
                'type' => $s->type,
                'sensor_role' => $s->sensor_role,
                'normalized_status' => $s->normalized_status?->value ?? $s->normalized_status,
                'status_text' => $s->status_text,
                'last_value' => $s->last_value,
                'unit' => $s->unit,
                'down_since' => $s->down_since,
                'last_check' => $s->last_check?->toIso8601String(),
                'last_synced_at' => $s->last_synced_at?->toIso8601String(),
                'device_name' => $s->device_name,
                'source_scope' => $s->metadata['source_scope'] ?? null,
            ]);

        return response()->json([
            'assignment_id' => $assignment->id,
            'cid' => $assignment->cid,
            'data' => $sensors,
        ]);
    }
}
