<?php

namespace App\Http\Controllers\Api\V1\ExcelGoogle;

use App\Domain\ExcelGoogle\Services\ExcelGoogleComparacionService;
use App\Http\Controllers\Controller;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use RuntimeException;
use Throwable;

class ExcelGoogleController extends Controller
{
    public function comparar(Request $request, ExcelGoogleComparacionService $service): JsonResponse
    {
        $desde = $request->query('desde');

        if (! is_scalar($desde) || ! preg_match('/^\d+$/', (string) $desde)) {
            return response()->json([
                'message' => 'Indica el número de fila desde la que hay que leer hacia abajo.',
            ], 422);
        }

        $fila = (int) $desde;

        if ($fila < 1 || $fila > 200000) {
            return response()->json([
                'message' => 'La fila tiene que estar entre 1 y 200000.',
            ], 422);
        }

        $periodo = strtolower(trim((string) $request->query('periodo', 'hoy')));

        if (! in_array($periodo, ['hoy', 'desde', 'rango'], true)) {
            return response()->json([
                'message' => 'El horario tiene que ser hoy, desde una hora, o un rango.',
            ], 422);
        }

        try {
            $desdeHora = $this->hora($request->query('desde_hora'));
            $hastaHora = $this->hora($request->query('hasta_hora'));

            return response()->json($service->comparar($fila, $periodo, $desdeHora, $hastaHora));
        } catch (RuntimeException $exception) {
            return response()->json([
                'message' => $exception->getMessage() !== ''
                    ? $exception->getMessage()
                    : 'No se pudo comparar con el Excel de Google.',
            ], 502);
        } catch (Throwable) {
            return response()->json([
                'message' => 'No se pudo comparar con el Excel de Google.',
            ], 502);
        }
    }

    private function hora(mixed $value): ?Carbon
    {
        if ($value === null || $value === '') {
            return null;
        }

        if (! is_scalar($value)) {
            throw new RuntimeException('La fecha y hora no es válida.');
        }

        $text = trim((string) $value);
        $text = str_replace('T', ' ', $text);

        foreach (['Y-m-d H:i', 'Y-m-d H:i:s', 'd/m/Y H:i', 'd/m/Y H:i:s'] as $format) {
            try {
                $parsed = Carbon::createFromFormat($format, $text, 'America/Lima');
            } catch (\Throwable) {
                continue;
            }

            if ($parsed instanceof Carbon) {
                return $parsed;
            }
        }

        throw new RuntimeException('La fecha y hora no es válida.');
    }
}
