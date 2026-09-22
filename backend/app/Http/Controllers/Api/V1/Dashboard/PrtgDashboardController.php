<?php

namespace App\Http\Controllers\Api\V1\Dashboard;

use App\Domain\Dashboard\Services\PrtgDashboardService;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;

class PrtgDashboardController extends Controller
{
    public function __construct(private readonly PrtgDashboardService $dashboard) {}

    public function __invoke(): JsonResponse
    {
        return response()->json($this->dashboard->summary());
    }
}
