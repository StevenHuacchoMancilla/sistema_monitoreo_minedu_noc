<?php

namespace App\Http\Controllers\Api\V1\Dashboard;

use App\Domain\Dashboard\Services\CloudnetDashboardService;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;

class CloudnetDashboardController extends Controller
{
    public function __construct(private readonly CloudnetDashboardService $dashboard) {}

    public function __invoke(): JsonResponse
    {
        return response()->json($this->dashboard->summary());
    }
}
