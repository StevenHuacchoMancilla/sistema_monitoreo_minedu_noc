<?php

namespace App\Http\Controllers\Api\V1\Monitoring;

use App\Domain\Monitoring\PRTG\Services\PrtgLocationCatalogService;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PrtgLocationController extends Controller
{
    public function __construct(
        private readonly PrtgLocationCatalogService $catalog,
    ) {}

    public function provinces(): JsonResponse
    {
        return response()->json($this->catalog->provinces());
    }

    public function districts(Request $request): JsonResponse
    {
        $filters = $request->validate([
            'province' => ['nullable', 'string', 'max:120'],
            'provincia' => ['nullable', 'string', 'max:120'],
        ]);

        $province = $filters['province'] ?? $filters['provincia'] ?? null;

        return response()->json($this->catalog->districts($province));
    }

    public function tree(): JsonResponse
    {
        return response()->json($this->catalog->tree());
    }
}
