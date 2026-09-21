<?php

namespace App\Http\Controllers\Api\V1\System;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Throwable;

class HealthController extends Controller
{
    public function __invoke(): JsonResponse
    {
        $driver = (string) config('database.default');
        $connected = false;
        $error = null;

        try {
            DB::connection()->getPdo();
            DB::select('select 1 as ok');
            $connected = true;
        } catch (Throwable $exception) {
            $error = 'database_unreachable';
        }

        $connection = config('database.connections.'.$driver, []);

        return response()->json([
            'status' => $connected ? 'ok' : 'degraded',
            'app' => config('app.name'),
            'database' => [
                'connected' => $connected,
                'driver' => $driver,
                'host' => $connection['host'] ?? null,
                'port' => isset($connection['port']) ? (string) $connection['port'] : null,
                'name' => $connection['database'] ?? null,
                'error' => $error,
            ],
            'time' => now()->toIso8601String(),
        ], $connected ? 200 : 503);
    }
}
