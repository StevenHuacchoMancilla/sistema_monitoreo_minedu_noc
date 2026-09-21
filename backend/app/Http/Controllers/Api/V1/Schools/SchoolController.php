<?php

namespace App\Http\Controllers\Api\V1\Schools;

use App\Http\Controllers\Controller;
use App\Models\Incident;
use App\Models\School;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SchoolController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = School::query()
            ->with(['activeAssignment', 'contacts'])
            ->where('active', true)
            ->orderBy('current_sequence');

        if ($request->filled('q')) {
            $term = '%'.mb_strtolower((string) $request->query('q')).'%';
            $query->where(function ($q) use ($term) {
                $q->whereRaw('LOWER(local_educativo) like ?', [$term])
                    ->orWhereRaw('LOWER(codigo_local) like ?', [$term])
                    ->orWhereRaw('LOWER(distrito) like ?', [$term])
                    ->orWhereHas('activeAssignment', fn ($a) => $a->whereRaw('LOWER(cid) like ?', [$term]));
            });
        }

        $schools = $query->paginate(50);

        return response()->json($schools);
    }

    public function show(School $school): JsonResponse
    {
        $school->load([
            'contacts',
            'networkAssignments' => fn ($q) => $q->orderByDesc('is_active')->orderByDesc('id'),
            'activeAssignment',
        ]);

        $assignment = $school->activeAssignment;
        $sensors = $assignment
            ? $assignment->sensors()->orderBy('name')->get()
            : collect();

        $ping = $sensors->firstWhere('name', 'Ping');
        $prtgSummary = [
            'sensor_count' => $sensors->count(),
            'ping_status' => $ping?->normalized_status?->value ?? $ping?->normalized_status,
            'ping_status_text' => $ping?->status_text,
            'last_check' => $ping?->last_check?->toIso8601String(),
            'device_name' => $ping?->device_name ?? $assignment?->prtg_device_name,
        ];

        $activeIncident = Incident::query()
            ->active()
            ->where('school_id', $school->id)
            ->with(['sensor', 'networkAssignment', 'updates'])
            ->orderByDesc('started_at')
            ->first();

        $history = $school->incidents()
            ->with(['sensor', 'networkAssignment', 'updates'])
            ->orderByDesc('started_at')
            ->limit(50)
            ->get();

        $cloudnet = $school->cloudnetSites()->with(['devices', 'aps'])->get();

        return response()->json([
            'school' => $school,
            'sensors' => $sensors,
            'prtg_summary' => $prtgSummary,
            'cloudnet_sites' => $cloudnet,
            'active_incident' => $activeIncident,
            'incident_history' => $history,
            'incidents' => $history,
        ]);
    }
}
