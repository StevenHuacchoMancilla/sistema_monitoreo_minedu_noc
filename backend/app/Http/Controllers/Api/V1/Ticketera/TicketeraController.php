<?php

namespace App\Http\Controllers\Api\V1\Ticketera;

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
}
