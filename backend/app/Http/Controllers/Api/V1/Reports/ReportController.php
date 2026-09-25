<?php

namespace App\Http\Controllers\Api\V1\Reports;

use App\Domain\Reports\Services\ClosingReportService;
use App\Domain\Reports\Services\GeneralReportService;
use App\Domain\Reports\Services\OperationalReportService;
use App\Enums\ManagementClassification;
use App\Enums\ManagementScope;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\StreamedResponse;

class ReportController extends Controller
{
    public function __construct(
        private readonly OperationalReportService $operational,
        private readonly ClosingReportService $closing,
        private readonly GeneralReportService $general,
    ) {}

    public function operational(Request $request): JsonResponse
    {
        $data = $request->validate([
            'classification' => ['nullable', Rule::in(ManagementClassification::operableValues())],
            'province' => ['nullable', 'string', 'max:120'],
            'district' => ['nullable', 'string', 'max:120'],
            'scope' => ['nullable', Rule::in(ManagementScope::values())],
            'technology' => ['nullable', 'string', 'max:32'],
            'search' => ['nullable', 'string', 'max:120'],
            'active_only' => ['nullable', 'boolean'],
        ]);

        return response()->json($this->operational->list($data));
    }

    public function general(Request $request): JsonResponse
    {
        return response()->json($this->general->report($this->generalFilters($request)));
    }

    public function generalXlsx(Request $request): StreamedResponse
    {
        return $this->general->downloadXlsx($this->generalFilters($request));
    }

    /**
     * @return array<string, mixed>
     */
    private function generalFilters(Request $request): array
    {
        return $request->validate([
            'period' => ['nullable', 'string', Rule::in(['today', 'yesterday', 'day', 'range', 'all'])],
            'day' => ['nullable', 'date_format:Y-m-d'],
            'from' => ['nullable', 'date_format:Y-m-d'],
            'to' => ['nullable', 'date_format:Y-m-d', 'after_or_equal:from'],
            'provincia' => ['nullable', 'string', 'max:120'],
            'distrito' => ['nullable', 'string', 'max:120'],
            'search' => ['nullable', 'string', 'max:120'],
            'limit' => ['nullable', 'integer', 'min:1', 'max:10000'],
        ]);
    }

    public function closingPreview(): JsonResponse
    {
        return response()->json($this->closing->preview());
    }

    public function closingXlsx(): StreamedResponse
    {
        return $this->closing->downloadXlsx();
    }
}
