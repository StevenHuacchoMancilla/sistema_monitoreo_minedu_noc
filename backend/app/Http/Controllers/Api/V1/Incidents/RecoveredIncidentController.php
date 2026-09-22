<?php

namespace App\Http\Controllers\Api\V1\Incidents;

use App\Domain\Incidents\Services\IncidentRecoveryService;
use App\Enums\ManagementClassification;
use App\Enums\ManagementScope;
use App\Enums\RecoveryReviewStatus;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class RecoveredIncidentController extends Controller
{
    public function __construct(private readonly IncidentRecoveryService $recoveries) {}

    public function index(Request $request): JsonResponse
    {
        $filters = $request->validate([
            'preset' => ['nullable', 'string', Rule::in(['today', 'yesterday', 'last_7_days', 'this_month', 'custom'])],
            'date_from' => ['nullable', 'date'],
            'date_to' => ['nullable', 'date', 'after_or_equal:date_from'],
            'q' => ['nullable', 'string', 'max:200'],
            'search' => ['nullable', 'string', 'max:200'],
            'provincia' => ['nullable', 'string', 'max:120'],
            'distrito' => ['nullable', 'string', 'max:120'],
            'tecnologia' => ['nullable', 'string', 'max:120'],
            'classification' => ['nullable', 'string', Rule::in(ManagementClassification::values())],
            'scope' => ['nullable', 'string', Rule::in(ManagementScope::values())],
            'same_day' => ['nullable'],
            'during_management' => ['nullable'],
            'had_field_tech' => ['nullable'],
            'review_status' => ['nullable', 'string', Rule::in(RecoveryReviewStatus::values())],
            'page' => ['nullable', 'integer', 'min:1'],
            'per_page' => ['nullable', 'integer', Rule::in([10, 25, 50, 100])],
        ]);

        return response()->json($this->recoveries->list($filters));
    }

    public function summary(Request $request): JsonResponse
    {
        $filters = $request->validate([
            'preset' => ['nullable', 'string', Rule::in(['today', 'yesterday', 'last_7_days', 'this_month', 'custom'])],
            'date_from' => ['nullable', 'date'],
            'date_to' => ['nullable', 'date', 'after_or_equal:date_from'],
            'q' => ['nullable', 'string', 'max:200'],
            'search' => ['nullable', 'string', 'max:200'],
            'provincia' => ['nullable', 'string', 'max:120'],
            'distrito' => ['nullable', 'string', 'max:120'],
            'tecnologia' => ['nullable', 'string', 'max:120'],
            'classification' => ['nullable', 'string', Rule::in(ManagementClassification::values())],
            'scope' => ['nullable', 'string', Rule::in(ManagementScope::values())],
            'same_day' => ['nullable'],
            'during_management' => ['nullable'],
            'had_field_tech' => ['nullable'],
            'review_status' => ['nullable', 'string', Rule::in(RecoveryReviewStatus::values())],
        ]);

        return response()->json(['data' => $this->recoveries->summary($filters)]);
    }
}
