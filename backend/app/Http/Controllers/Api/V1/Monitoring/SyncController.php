<?php

namespace App\Http\Controllers\Api\V1\Monitoring;

use App\Domain\Monitoring\Cloudnet\Services\CloudnetSyncService;
use App\Domain\Monitoring\PRTG\Services\PrtgSyncService;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Throwable;

class SyncController extends Controller
{
    public function prtg(PrtgSyncService $service): JsonResponse
    {
        try {
            return response()->json($service->sync());
        } catch (Throwable $exception) {
            return response()->json(['error' => $exception->getMessage()], 500);
        }
    }

    public function cloudnet(CloudnetSyncService $service): JsonResponse
    {
        try {
            return response()->json($service->sync());
        } catch (Throwable $exception) {
            return response()->json(['error' => $exception->getMessage()], 500);
        }
    }
}
