<?php

namespace App\Http\Controllers\Api\V1\Tracking;

use App\Domain\Tracking\Exceptions\TrackingLifecycleConflict;
use App\Domain\Tracking\Services\TrackingDetailService;
use App\Domain\Tracking\Services\TrackingLifecycleService;
use App\Domain\Tracking\Services\TrackingListService;
use App\Domain\Tracking\Services\TrackingOpenService;
use App\Domain\Tracking\Services\TrackingReportService;
use App\Enums\TrackingEventType;
use App\Enums\TrackingStatus;
use App\Http\Controllers\Controller;
use App\Models\Incident;
use App\Models\TrackingRecord;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\StreamedResponse;

class TrackingController extends Controller
{
    public function __construct(
        private readonly TrackingListService $list,
        private readonly TrackingDetailService $detail,
        private readonly TrackingOpenService $open,
        private readonly TrackingLifecycleService $lifecycle,
        private readonly TrackingReportService $reportService,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $filters = $request->validate(
            [
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
            ],
            [
                'opened_to.after_or_equal' => 'La fecha inicial no puede ser posterior a la fecha final.',
                'closed_to.after_or_equal' => 'La fecha inicial no puede ser posterior a la fecha final.',
                'period_to.after_or_equal' => 'La fecha inicial no puede ser posterior a la fecha final.',
            ]
        );

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

    /**
     * Opciones mínimas para filtros Aperturado/Cerrado por (sin datos administrativos).
     */
    public function actors(): JsonResponse
    {
        return response()->json([
            'data' => $this->list->actors(),
        ]);
    }

    /**
     * Vista tipo Excel (10 columnas TRACKING GENERAL.xlsx).
     */
    public function report(Request $request): JsonResponse
    {
        return response()->json($this->reportService->report($this->reportFilters($request)));
    }

    /**
     * Descarga XLSX con las mismas columnas/filtros de la vista Excel.
     */
    public function reportXlsx(Request $request): StreamedResponse
    {
        return $this->reportService->downloadXlsx($this->reportFilters($request));
    }

    /**
     * @return array<string, mixed>
     */
    private function reportFilters(Request $request): array
    {
        return $request->validate(
            [
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
                'limit' => ['nullable', 'integer', 'min:1', 'max:5000'],
            ],
            [
                'opened_to.after_or_equal' => 'La fecha inicial no puede ser posterior a la fecha final.',
                'closed_to.after_or_equal' => 'La fecha inicial no puede ser posterior a la fecha final.',
            ]
        );
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

    /**
     * Actualiza columnas CODIGO / CAUSA del Tracking General.
     */
    public function updateCodigoCausa(Request $request, TrackingRecord $tracking): JsonResponse
    {
        $payload = $request->validate([
            'lock_version' => ['required', 'integer', 'min:1'],
            'codigo' => ['nullable'],
            'causa' => ['nullable', 'string', 'max:2000'],
        ]);

        if (array_key_exists('codigo', $payload) && is_string($payload['codigo'])) {
            // ok — normalizer acepta string
        } elseif (array_key_exists('codigo', $payload) && is_array($payload['codigo'])) {
            $payload['codigo'] = array_values(array_map('strval', $payload['codigo']));
        } elseif (array_key_exists('codigo', $payload) && $payload['codigo'] !== null) {
            abort(422, 'codigo debe ser lista de letras o string.');
        }

        /** @var \App\Models\User $user */
        $user = $request->user();

        return response()->json(
            $this->detail->updateCodigoCausa($tracking, $payload, (int) $user->id)
        );
    }

    public function close(Request $request, TrackingRecord $tracking): JsonResponse
    {
        $payload = $request->validate([
            'lock_version' => ['required', 'integer', 'min:1'],
            'closing_note' => ['nullable', 'string', 'max:5000'],
        ]);

        /** @var \App\Models\User $user */
        $user = $request->user();

        return $this->lifecycleResponse(
            fn () => $this->lifecycle->close($tracking, $payload, (int) $user->id)
        );
    }

    public function reopen(Request $request, TrackingRecord $tracking): JsonResponse
    {
        $payload = $request->validate([
            'lock_version' => ['required', 'integer', 'min:1'],
            'note' => ['nullable', 'string', 'max:5000'],
        ]);

        /** @var \App\Models\User $user */
        $user = $request->user();

        return $this->lifecycleResponse(
            fn () => $this->lifecycle->reopen($tracking, $payload, (int) $user->id)
        );
    }

    public function acknowledgeRecovery(Request $request, TrackingRecord $tracking): JsonResponse
    {
        $payload = $request->validate([
            'lock_version' => ['required', 'integer', 'min:1'],
            'note' => ['nullable', 'string', 'max:5000'],
        ]);

        /** @var \App\Models\User $user */
        $user = $request->user();

        return $this->lifecycleResponse(
            fn () => $this->lifecycle->acknowledgeRecovery($tracking, $payload, (int) $user->id)
        );
    }

    /**
     * @param  callable(): array<string, mixed>  $action
     */
    private function lifecycleResponse(callable $action): JsonResponse
    {
        try {
            return response()->json($action());
        } catch (TrackingLifecycleConflict $e) {
            return response()->json(
                [
                    'message' => $e->getMessage(),
                    'error' => $e->errorCode,
                    'data' => $this->detail->show($e->tracking->fresh() ?? $e->tracking)['data'],
                ],
                409
            );
        }
    }
}
