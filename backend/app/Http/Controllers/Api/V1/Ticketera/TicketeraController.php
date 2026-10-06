<?php

namespace App\Http\Controllers\Api\V1\Ticketera;

use App\Domain\Ticketera\Services\TicketeraPrtgTimelineService;
use App\Domain\Ticketera\Services\TicketeraReadService;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Throwable;

class TicketeraController extends Controller
{
    public function __invoke(Request $request, TicketeraReadService $ticketera): JsonResponse
    {
        try {
            if ($request->boolean('fresh')) {
                $ticketera->forget();
            }

            return response()->json($ticketera->dashboard());
        } catch (Throwable $exception) {
            return response()->json([
                'message' => $exception->getMessage() !== ''
                    ? $exception->getMessage()
                    : 'No se pudo leer la hoja de Ticketera.',
            ], 502);
        }
    }

    public function timeline(Request $request, TicketeraPrtgTimelineService $timeline): JsonResponse
    {
        $cid = trim((string) $request->query('cid', ''));
        $from = (string) $request->query('from', '');
        $to = (string) $request->query('to', '');
        if ($cid === '' || ! preg_match('/^\d{4}-\d{2}-\d{2}$/', $from) || ! preg_match('/^\d{4}-\d{2}-\d{2}$/', $to)) {
            return response()->json(['message' => 'Indica el CID y el rango de fechas.'], 422);
        }

        return response()->json($timeline->forCid($cid, $from, $to));
    }
}
