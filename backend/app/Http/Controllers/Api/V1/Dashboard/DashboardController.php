<?php

namespace App\Http\Controllers\Api\V1\Dashboard;

use App\Domain\Dashboard\Services\DashboardService;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DashboardController extends Controller
{
    public function __construct(private readonly DashboardService $dashboard) {}

    public function summary(): JsonResponse
    {
        return response()->json($this->dashboard->summary());
    }

    public function outages(Request $request): JsonResponse
    {
        return response()->json([
            'data' => $this->dashboard->activeOutages(
                $request->string('q')->toString() ?: null,
                $request->string('sort')->toString() ?: null,
                $request->string('direction')->toString() ?: null,
            ),
        ]);
    }

    public function concentrations(): JsonResponse
    {
        return response()->json([
            'data' => $this->dashboard->concentrations(),
        ]);
    }

    public function schoolHistory(Request $request): JsonResponse
    {
        return response()->json([
            'data' => $this->dashboard->schoolHistory($request->string('q')->toString() ?: null),
        ]);
    }
}
