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
     * proxy de Vercel corte el sync largo (30–90s).
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

        // php artisan serve: si monitoring:watch está vivo, él hace el sync.
        // Si no hay watch, spawneamos `prtg:sync` en background para no mentir al UI.
        if (PHP_SAPI === 'cli-server' && config('prtg.sync_enabled')) {
            if (SyncCoordinator::watchIsAlive('PRTG')) {
                return response()->json([
                    'accepted' => true,
                    'status' => 'WATCH',
                    'source' => 'PRTG',
                    'watch_alive' => true,
                ]);
            }

            $spawned = $this->spawnCliSync();

            return response()->json([
                'accepted' => true,
                'status' => $spawned ? 'SPAWNED' : 'SPAWN_FAILED',
                'source' => 'PRTG',
                'watch_alive' => false,
            ], $spawned ? 202 : 500);
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
                set_time_limit(0);
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

    private function spawnCliSync(): bool
    {
        $probe = SyncCoordinator::acquire('PRTG', 5);
        if (! $probe) {
            return true; // ya corre
        }
        $probe->release();

        $php = PHP_BINARY ?: 'php';
        $artisan = base_path('artisan');
        $cmd = escapeshellarg($php).' '.escapeshellarg($artisan).' prtg:sync > /dev/null 2>&1 &';

        try {
            if (stripos(PHP_OS, 'WIN') === 0) {
                pclose(popen('start /B '.$php.' '.$artisan.' prtg:sync', 'r'));
            } else {
                exec($cmd);
            }

            return true;
        } catch (Throwable $e) {
            Log::error('PRTG spawn sync failed', ['message' => $e->getMessage()]);

            return false;
        }
    }
}
