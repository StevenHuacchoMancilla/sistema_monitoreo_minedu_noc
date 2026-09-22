<?php

namespace App\Http\Controllers\Api\V1\Tracking;

use App\Domain\Tracking\Services\TrackingDetailService;
use App\Domain\Tracking\Services\TrackingListService;
use App\Domain\Tracking\Services\TrackingOpenService;
use App\Enums\TrackingEventType;
use App\Enums\TrackingStatus;
use App\Http\Controllers\Controller;
use App\Models\Incident;
use App\Models\TrackingRecord;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class TrackingController extends Controller
{
    public function __construct(
        private readonly TrackingListService $list,
        private readonly TrackingDetailService $detail,
        private readonly TrackingOpenService $open,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $filters = $request->validate([
            'q' => ['nullable', 'string', 'max:200'],
            'search' => ['nullable', 'string', 'max:200'],
            'status' => ['nullable', 'string', Rule::in(TrackingStatus::values())],
            'provincia' => ['nullable', 'string', 'max:120'],
            'distrito' => ['nullable', 'string', 'max:120'],
            'opened_by' => ['nullable', 'string', 'max:120'],
            'closed_by' => ['nullable', 'string', 'max:120'],
            'opened_from' => ['nullable', 'date'],
            'opened_to' => ['nullable', 'date', 'after_or_equal:opened_from'],
            'closed_from' => ['nullable', 'date'],
            'closed_to' => ['nullable', 'date', 'after_or_equal:closed_from'],
            'period_from' => ['nullable', 'date'],
            'period_to' => ['nullable', 'date', 'after_or_equal:period_from'],
            'page' => ['nullable', 'integer', 'min:1'],
            'per_page' => ['nullable', 'integer', Rule::in([25, 50, 100])],
        ]);

        return response()->json($this->list->list($filters));
    }

    public function summary(Request $request): JsonResponse
    {
        $filters = $request->validate([
            'period_from' => ['nullable', 'date'],
            'period_to' => ['nullable', 'date', 'after_or_equal:period_from'],
        ]);

        return response()->json([
            'data' => $this->list->kpis($filters),
        ]);
    }

    public function show(TrackingRecord $tracking): JsonResponse
    {
        return response()->json($this->detail->show($tracking));
    }

    /**
     * Apertura operativa desde incidencia PRTG.
     * Body: { incident_id, ticket? }
     * Si ya hay Tracking abierto para esa incidencia, lo reutiliza (created=false).
     */
    public function store(Request $request): JsonResponse
    {
        $payload = $request->validate([
            'incident_id' => ['required', 'integer', 'exists:incidents,id'],
            'ticket' => ['nullable', 'string', 'max:120'],
        ]);

        /** @var \App\Models\User $user */
        $user = $request->user();
        $incident = Incident::query()->findOrFail((int) $payload['incident_id']);

        $result = $this->open->openFromIncident(
            $incident,
            (int) $user->id,
            $payload['ticket'] ?? null,
        );

        return response()->json(
            [
                'created' => $result['created'],
                'data' => $result['data'],
            ],
            $result['created'] ? 201 : 200
        );
    }

    public function storeUpdate(Request $request, TrackingRecord $tracking): JsonResponse
    {
        $payload = $request->validate([
            'body' => ['required', 'string', 'max:5000'],
            'event_type' => ['nullable', 'string', Rule::in(TrackingEventType::values())],
        ]);

        /** @var \App\Models\User $user */
        $user = $request->user();

        return response()->json(
            $this->detail->addUpdate($tracking, $payload, (int) $user->id),
            201
        );
    }
}
