<?php

namespace App\Http\Controllers\Api\V1\Schools;

use App\Domain\Monitoring\PRTG\Support\PrtgOperationalLocation;
use App\Domain\Schools\Services\SchoolCrudService;
use App\Http\Controllers\Controller;
use App\Models\Incident;
use App\Models\NetworkAssignment;
use App\Models\School;
use App\Models\SchoolContact;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class SchoolController extends Controller
{
    public function __construct(private readonly SchoolCrudService $schools) {}

    public function index(Request $request): JsonResponse
    {
        $filters = $request->validate([
            'q' => ['nullable', 'string', 'max:200'],
            'provincia' => ['nullable', 'string', 'max:120'],
            'distrito' => ['nullable', 'string', 'max:120'],
            'tecnologia' => ['nullable', 'string', 'max:120'],
            'active' => ['nullable', 'string', Rule::in(['1', '0', 'true', 'false', 'all'])],
            'per_page' => ['nullable', 'integer', 'min:10', 'max:200'],
        ]);

        $page = $this->schools->list($filters);
        $catalog = $this->schools->catalog(
            $filters['provincia'] ?? null,
            (string) ($filters['active'] ?? '1'),
        );

        return response()->json([
            'data' => collect($page->items())->map(fn (School $school) => $this->listRow($school))->values(),
            'meta' => [
                'current_page' => $page->currentPage(),
                'last_page' => $page->lastPage(),
                'per_page' => $page->perPage(),
                'total' => $page->total(),
            ],
            'filters' => [
                'provincias' => $catalog['provincias'],
                'distritos' => $catalog['distritos'],
                'tecnologias' => $catalog['tecnologias'],
            ],
            'stats' => $catalog['stats'],
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate($this->generalRules(requiredLocal: true) + [
            'cid' => ['nullable', 'string', 'max:64'],
            'prtg_device_name' => ['nullable', 'string', 'max:255'],
            'capacidad_mbps' => ['nullable', 'string', 'max:64'],
            'tecnologia_acceso' => ['nullable', 'string', 'max:120'],
            'nodo_pop' => ['nullable', 'string', 'max:120'],
            'ip_publica' => ['nullable', 'string', 'max:64'],
            'ip_loopback' => ['nullable', 'string', 'max:64'],
            'ip_wan_principal' => ['nullable', 'string', 'max:64'],
            'ip_lan' => ['nullable', 'string', 'max:64'],
            'gateway_wan' => ['nullable', 'string', 'max:64'],
            'vlan_internet' => ['nullable', 'string', 'max:64'],
            'vlan_uplink' => ['nullable', 'string', 'max:64'],
        ]);

        $school = $this->schools->create($data);

        return response()->json($this->showPayload($school), 201);
    }

    public function show(School $school): JsonResponse
    {
        return response()->json($this->showPayload($school));
    }

    public function update(Request $request, School $school): JsonResponse
    {
        $data = $request->validate($this->generalRules(requiredLocal: false));
        $school = $this->schools->updateGeneral($school, $data);

        return response()->json($this->showPayload($school));
    }

    public function deactivate(School $school): JsonResponse
    {
        return response()->json($this->showPayload($this->schools->deactivate($school)));
    }

    public function reactivate(School $school): JsonResponse
    {
        return response()->json($this->showPayload($this->schools->reactivate($school)));
    }

    public function updateAssignment(Request $request, School $school, NetworkAssignment $assignment): JsonResponse
    {
        abort_unless($assignment->school_id === $school->id, 404);

        $data = $request->validate($this->assignmentRules());
        $updated = $this->schools->updateAssignmentInPlace($assignment, $data);

        return response()->json([
            'assignment' => $updated,
            'school' => $this->showPayload($school->fresh()),
        ]);
    }

    public function reassignCid(Request $request, School $school): JsonResponse
    {
        $data = $request->validate([
            'cid' => ['required', 'string', 'max:64'],
            ...$this->assignmentRules(),
        ]);

        $assignment = $this->schools->reassignCid($school, $data);

        return response()->json([
            'assignment' => $assignment,
            'school' => $this->showPayload($school->fresh()),
        ], 201);
    }

    public function storeContact(Request $request, School $school): JsonResponse
    {
        $data = $request->validate($this->contactRules());
        $contact = $this->schools->upsertContact($school, $data);

        return response()->json($contact, 201);
    }

    public function updateContact(Request $request, School $school, SchoolContact $contact): JsonResponse
    {
        abort_unless($contact->school_id === $school->id, 404);
        $data = $request->validate($this->contactRules());
        $contact = $this->schools->upsertContact($school, $data, $contact);

        return response()->json($contact);
    }

    public function deactivateContact(School $school, SchoolContact $contact): JsonResponse
    {
        abort_unless($contact->school_id === $school->id, 404);
        $this->schools->deactivateContact($contact);

        return response()->json(['ok' => true]);
    }

    /**
     * @return array<string, mixed>
     */
    private function showPayload(School $school): array
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

        $ping = $sensors->first(fn ($s) => strcasecmp((string) $s->name, 'Ping') === 0);
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
            ->with(['sensor', 'networkAssignment', 'updates', 'managements'])
            ->orderByDesc('started_at')
            ->first();

        $history = $school->incidents()
            ->with(['sensor', 'networkAssignment', 'updates'])
            ->orderByDesc('started_at')
            ->limit(50)
            ->get();

        $cloudnet = $school->cloudnetSites()->with(['devices', 'aps'])->get();

        return [
            'school' => $school,
            'location' => PrtgOperationalLocation::apiFields($assignment, $school),
            'sensors' => $sensors,
            'prtg_summary' => $prtgSummary,
            'cloudnet_sites' => $cloudnet,
            'active_incident' => $activeIncident,
            'incident_history' => $history,
            'incidents' => $history,
            'audit_logs' => $this->schools->auditTrail($school),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function listRow(School $school): array
    {
        $a = $school->activeAssignment;
        $location = PrtgOperationalLocation::apiFields($a, $school);

        return [
            'id' => $school->id,
            'n' => $school->current_sequence,
            'cid' => $a?->cid,
            'codigo_local' => $school->codigo_local,
            'codigo_modular' => $school->codigo_modular,
            'local_educativo' => $school->local_educativo,
            'provincia' => $school->provincia,
            'distrito' => $school->distrito,
            'prtg_province' => $location['prtg_province'],
            'prtg_district' => $location['prtg_district'],
            'location_source' => $location['location_source'],
            'location_mismatch' => $location['location_mismatch'],
            'tecnologia' => $a?->tecnologia_acceso,
            'capacidad_mbps' => $a?->capacidad_mbps,
            'nodo_pop' => $a?->nodo_pop,
            'active' => $school->active,
            'prtg_device_name' => $a?->prtg_device_name,
        ];
    }

    /**
     * @return array<string, list<mixed>>
     */
    private function generalRules(bool $requiredLocal): array
    {
        $req = $requiredLocal ? 'required' : 'sometimes';

        return [
            'current_sequence' => ['nullable', 'integer', 'min:1'],
            'legacy_reference' => ['nullable', 'string', 'max:120'],
            'codigo_local' => [$req, 'string', 'max:32'],
            'codigo_modular' => ['nullable', 'string', 'max:32'],
            'local_educativo' => [$req, 'string', 'max:255'],
            'departamento' => ['nullable', 'string', 'max:120'],
            'provincia' => ['nullable', 'string', 'max:120'],
            'distrito' => ['nullable', 'string', 'max:120'],
            'centro_poblado' => ['nullable', 'string', 'max:120'],
            'clasificacion' => ['nullable', 'string', 'max:120'],
            'nivel_iiee' => ['nullable', 'string', 'max:120'],
            'latitud' => ['nullable', 'string', 'max:64'],
            'longitud' => ['nullable', 'string', 'max:64'],
            'active' => ['nullable', 'boolean'],
        ];
    }

    /**
     * @return array<string, list<mixed>>
     */
    private function assignmentRules(): array
    {
        return [
            'cid' => ['nullable', 'string', 'max:64'],
            'prtg_device_name' => ['nullable', 'string', 'max:255'],
            'capacidad_mbps' => ['nullable', 'string', 'max:64'],
            'tecnologia_acceso' => ['nullable', 'string', 'max:120'],
            'nodo_pop' => ['nullable', 'string', 'max:120'],
            'ip_publica' => ['nullable', 'string', 'max:64'],
            'ip_loopback' => ['nullable', 'string', 'max:64'],
            'ip_wan_principal' => ['nullable', 'string', 'max:64'],
            'netmask_wan_principal' => ['nullable', 'string', 'max:64'],
            'ip_lan' => ['nullable', 'string', 'max:64'],
            'gateway_wan' => ['nullable', 'string', 'max:64'],
            'vlan_internet' => ['nullable', 'string', 'max:64'],
            'vlan_uplink' => ['nullable', 'string', 'max:64'],
            'vlan_mgmt_ap' => ['nullable', 'string', 'max:64'],
            'ip_mgmt_ap' => ['nullable', 'string', 'max:64'],
            'observaciones' => ['nullable', 'string', 'max:5000'],
        ];
    }

    /**
     * @return array<string, list<mixed>>
     */
    private function contactRules(): array
    {
        return [
            'position' => ['required', 'integer', 'min:1', 'max:3'],
            'name' => ['nullable', 'string', 'max:255'],
            'role' => ['nullable', 'string', 'max:120'],
            'phone' => ['nullable', 'string', 'max:64'],
            'validation_status' => ['nullable', 'string', 'max:64'],
        ];
    }
}
