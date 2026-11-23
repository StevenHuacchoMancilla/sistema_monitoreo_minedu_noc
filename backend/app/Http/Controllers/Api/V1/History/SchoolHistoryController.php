<?php

namespace App\Http\Controllers\Api\V1\History;

use App\Domain\Incidents\Services\IncidentCaseFileService;
use App\Domain\Incidents\Services\IncidentHistoryService;
use App\Domain\Incidents\Services\SlaClockService;
use App\Enums\ManagementClassification;
use App\Enums\ManagementScope;
use App\Enums\MonitoringStatus;
use App\Http\Controllers\Controller;
use App\Models\Incident;
use App\Models\School;
use App\Models\ServiceTicket;
use App\Support\OperationalTime;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class SchoolHistoryController extends Controller
{
    public function __construct(
        private readonly IncidentHistoryService $history,
        private readonly SlaClockService $sla,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $filters = $request->validate([
            'q' => ['nullable', 'string', 'max:200'],
            'search' => ['nullable', 'string', 'max:200'],
            'provincia' => ['nullable', 'string', 'max:120'],
            'distrito' => ['nullable', 'string', 'max:120'],
            'tecnologia' => ['nullable', 'string', 'max:120'],
            'current_status' => ['nullable', 'string', Rule::in(array_column(MonitoringStatus::cases(), 'value'))],
            'page' => ['nullable', 'integer', 'min:1'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);

        return response()->json($this->history->listSchools($filters));
    }

    public function show(School $school): JsonResponse
    {
        return response()->json($this->history->schoolOverview($school));
    }

    public function incidents(Request $request, School $school): JsonResponse
    {
        $filters = $request->validate([
            'q' => ['nullable', 'string', 'max:120'],
            'search' => ['nullable', 'string', 'max:120'],
            'date_from' => ['nullable', 'date'],
            'date_to' => ['nullable', 'date', 'after_or_equal:date_from'],
            'status' => ['nullable', 'string', Rule::in(['ALL', 'RECOVERED', 'ACTIVE', 'RECUPERADOS', 'ACTIVOS'])],
            'classification' => ['nullable', 'string', Rule::in(ManagementClassification::values())],
            'scope' => ['nullable', 'string', Rule::in(ManagementScope::values())],
            'category' => ['nullable', 'string', Rule::in([
                'caidas_normales', 'averias', 'requerimientos', 'mantenimientos', 'enlace_parcial',
            ])],
            'page' => ['nullable', 'integer', 'min:1'],
            'per_page' => ['nullable', 'integer', Rule::in([10, 25, 50])],
        ]);

        $page = $this->history->schoolIncidents($school, $filters);

        return response()->json([
            'data' => $page->items(),
            'meta' => [
                'current_page' => $page->currentPage(),
                'last_page' => $page->lastPage(),
                'per_page' => $page->perPage(),
                'total' => $page->total(),
            ],
        ]);
    }

    /**
     * SLA mensual del colegio: consumo por caída y si se superó el cupo (se reinicia cada mes).
     */
    public function slaMonthly(Request $request, School $school): JsonResponse
    {
        $data = $request->validate([
            'month' => ['nullable', 'string', 'regex:/^\d{4}-\d{2}$/'],
        ]);
        $month = $data['month'] ?? OperationalTime::now()->format('Y-m');

        return response()->json($this->sla->monthlyBreakdown((int) $school->id, $month));
    }

    public function incidentCaseFile(Incident $incident, IncidentCaseFileService $caseFile): JsonResponse
    {
        return response()->json($caseFile->build($incident));
    }

    public function ticketCaseFile(string $ticketCode, IncidentCaseFileService $caseFile): JsonResponse
    {
        $code = strtoupper(trim($ticketCode));
        $ticket = ServiceTicket::query()
            ->whereRaw('UPPER(ticket_code) = ?', [$code])
            ->first();

        if ($ticket === null || $ticket->incident_id === null) {
            return response()->json(['message' => 'Ticket no encontrado.'], 404);
        }

        $incident = Incident::query()->findOrFail($ticket->incident_id);

        return response()->json($caseFile->build($incident));
    }

    /**
     * Solo ADMIN: corrige categoría, causa raíz y detalle en el historial.
     */
    public function updateCategory(Request $request, Incident $incident): JsonResponse
    {
        $data = $request->validate([
            'category' => ['required', 'string', Rule::in([
                'caidas_normales', 'averias', 'requerimientos', 'mantenimientos', 'enlace_parcial',
            ])],
            'root_cause_group_code' => ['nullable', 'string', 'max:8'],
            'root_cause_code' => ['nullable', 'string', 'max:16'],
            'detail' => ['nullable', 'string', 'max:5000'],
        ]);

        $userId = (int) ($request->user()?->id ?? 0);
        if ($userId < 1) {
            return response()->json(['message' => 'No autenticado.'], 401);
        }

        try {
            $result = $this->history->reclassifyCategory($incident, $data, $userId);
        } catch (\InvalidArgumentException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json(['data' => $result]);
    }
}
