<?php

namespace App\Http\Controllers\Api\V1\History;

use App\Domain\Incidents\Services\IncidentCaseFileService;
use App\Domain\Incidents\Services\IncidentHistoryService;
use App\Enums\ManagementClassification;
use App\Enums\ManagementScope;
use App\Enums\MonitoringStatus;
use App\Http\Controllers\Controller;
use App\Models\Incident;
use App\Models\School;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class SchoolHistoryController extends Controller
{
    public function __construct(private readonly IncidentHistoryService $history) {}

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
            'date_from' => ['nullable', 'date'],
            'date_to' => ['nullable', 'date', 'after_or_equal:date_from'],
            'status' => ['nullable', 'string', Rule::in(['ALL', 'RECOVERED', 'ACTIVE', 'RECUPERADOS', 'ACTIVOS'])],
            'classification' => ['nullable', 'string', Rule::in(ManagementClassification::values())],
            'scope' => ['nullable', 'string', Rule::in(ManagementScope::values())],
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

    public function incidentCaseFile(Incident $incident, IncidentCaseFileService $caseFile): JsonResponse
    {
        return response()->json($caseFile->build($incident));
    }
}
