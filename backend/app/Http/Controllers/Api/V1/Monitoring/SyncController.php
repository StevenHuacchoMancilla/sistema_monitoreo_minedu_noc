<?php

namespace App\Http\Controllers\Api\V1\Monitoring;

use App\Domain\Monitoring\PRTG\Services\PrtgSyncService;
use App\Domain\Monitoring\Support\SyncCoordinator;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Throwable;

class SyncController extends Controller
{
    /**
     * Dispara sync PRTG.
     *
     * Por defecto corre DESPUÉS de responder HTTP (afterResponse): evita que el
     * proxy de Vercel corte el sync largo (30–90s). Sin Cron de pago: el navegador
     * dispara y Render termina el trabajo en background.
     *
     * ?wait=1 fuerza modo síncrono (solo útil en local / debug).
     */
    public function prtg(Request $request, PrtgSyncService $service): JsonResponse
    {
        if ($request->boolean('wait')) {
            try {
                return response()->json($service->sync());
            } catch (Throwable $exception) {
                return response()->json(['error' => $exception->getMessage()], 500);
            }
        }

        return $this->enqueue('PRTG', fn () => $service->sync());
    }

    /**
     * @param  callable(): array<string, mixed>  $runner
     */
    private function enqueue(string $source, callable $runner): JsonResponse
    {
        $probe = SyncCoordinator::acquire($source, 5);
        if (! $probe) {
            return response()->json(SyncCoordinator::skippedResponse());
        }
        $probe->release();

        dispatch(function () use ($source, $runner) {
            ignore_user_abort(true);
            if (function_exists('set_time_limit')) {
                set_time_limit(300);
            }
            try {
                $runner();
            } catch (Throwable $exception) {
                Log::error("{$source} sync (afterResponse) failed", [
                    'message' => $exception->getMessage(),
                ]);
            }
        })->afterResponse();

        return response()->json([
            'accepted' => true,
            'status' => 'QUEUED',
            'source' => $source,
        ]);
    }
}
