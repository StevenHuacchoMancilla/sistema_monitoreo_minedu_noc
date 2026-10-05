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

    public function concentrationZone(Request $request): JsonResponse
    {
        $provincia = trim($request->string('provincia')->toString());
        $distrito = trim($request->string('distrito')->toString());
        if ($provincia === '' || $distrito === '' || strlen($provincia) > 120 || strlen($distrito) > 120) {
            return response()->json([
                'message' => 'Indica la provincia y el distrito de la zona PRTG.',
            ], 422);
        }

        return response()->json($this->dashboard->concentrationZone($provincia, $distrito));
    }

    public function schoolHistory(Request $request): JsonResponse
    {
        return response()->json([
            'data' => $this->dashboard->schoolHistory($request->string('q')->toString() ?: null),
        ]);
    }
}
