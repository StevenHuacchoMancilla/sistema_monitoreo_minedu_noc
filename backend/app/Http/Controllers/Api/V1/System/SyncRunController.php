<?php

namespace App\Http\Controllers\Api\V1\System;

use App\Http\Controllers\Controller;
use App\Models\SyncIssue;
use App\Models\SyncRun;
use Illuminate\Http\JsonResponse;

class SyncRunController extends Controller
{
    public function runs(): JsonResponse
    {
        return response()->json([
            'data' => SyncRun::query()->orderByDesc('id')->limit(50)->get(),
        ]);
    }

    public function issues(): JsonResponse
    {
        return response()->json([
            'data' => SyncIssue::query()->orderByDesc('id')->limit(100)->get(),
        ]);
    }
}
