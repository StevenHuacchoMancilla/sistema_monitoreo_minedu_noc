<?php

namespace App\Domain\Monitoring\PRTG\Services;

use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use RuntimeException;

/**
 * Volumen de tráfico histórico PRTG (Tráfico total volumen) — igual que Sumas del reporte de 30 días.
 */
class PrtgTrafficVolumeReader
{
    /**
     * Suma bytes de "Tráfico total (volumen)" en el rango (promedio diario).
     * El número que PRTG muestra como ~337 en Sumas = bytes / (1024^2) / 1000 (etiqueta GB).
     */
    public function totalVolumeBytes(int $prtgSensorId, CarbonImmutable $from, CarbonImmutable $to): ?float
    {
        if ($prtgSensorId <= 0) {
            return null;
        }

        $cacheKey = sprintf(
            'prtg.traffic_volume.%d.%s.%s',
            $prtgSensorId,
            $from->format('Ymd'),
            $to->format('Ymd')
        );

        return Cache::remember($cacheKey, now()->addMinutes(10), function () use ($prtgSensorId, $from, $to) {
            return $this->fetchTotalVolumeBytes($prtgSensorId, $from, $to);
        });
    }

    private function fetchTotalVolumeBytes(int $prtgSensorId, CarbonImmutable $from, CarbonImmutable $to): ?float
    {
        $base = rtrim((string) config('prtg.base_url'), '/');
        $token = (string) config('prtg.api_token');
        if ($base === '' || $token === '') {
            throw new RuntimeException('PRTG_BASE_URL o PRTG_API_TOKEN no configurados');
        }

        $sdate = $from->format('Y-m-d').'-00-00-00';
        $edate = $to->addDay()->format('Y-m-d').'-00-00-00';

        try {
            $response = Http::withoutVerifying()
                ->connectTimeout(30)
                ->timeout(90)
                ->get("{$base}/api/historicdata.json", [
                    'id' => $prtgSensorId,
                    'avg' => 86400,
                    'sdate' => $sdate,
                    'edate' => $edate,
                    'usecaption' => 1,
                    'apitoken' => $token,
                ]);
        } catch (\Throwable $e) {
            Log::warning('[PRTG] historic volume fetch failed', [
                'sensor' => $prtgSensorId,
                'error' => $e->getMessage(),
            ]);

            return null;
        }

        if (! $response->successful()) {
            Log::warning('[PRTG] historic volume HTTP '.$response->status(), ['sensor' => $prtgSensorId]);

            return null;
        }

        $his = $response->json()['histdata'] ?? [];
        if (! is_array($his) || $his === []) {
            return null;
        }

        $sum = 0.0;
        $found = false;
        foreach ($his as $row) {
            if (! is_array($row)) {
                continue;
            }
            $raw = $this->volumeFromRow($row);
            if ($raw === null) {
                continue;
            }
            $sum += $raw;
            $found = true;
        }

        return $found ? $sum : null;
    }

    /**
     * @param  array<string, mixed>  $row
     */
    private function volumeFromRow(array $row): ?float
    {
        foreach ([
            'Tráfico total (volumen)',
            'Traffic Total (volume)',
            'Traffic total (volume)',
        ] as $key) {
            if (! array_key_exists($key, $row)) {
                continue;
            }

            return $this->parseNumeric($row[$key]);
        }

        return null;
    }

    private function parseNumeric(mixed $value): ?float
    {
        if ($value === null || $value === '' || $value === '-') {
            return null;
        }
        if (is_numeric($value)) {
            return (float) $value;
        }
        $text = trim((string) $value);
        if (! preg_match('/([0-9]+(?:[.,][0-9]+)?)/', $text, $m)) {
            return null;
        }

        return (float) str_replace(',', '.', $m[1]);
    }

    /**
     * Formato Sumas PRTG en MB (bytes / 1024² / 1000), p. ej. 337.01 MB.
     */
    public static function formatBytes(?float $bytes): ?string
    {
        if ($bytes === null || $bytes < 0) {
            return null;
        }

        $mb = ($bytes / (1024 * 1024)) / 1000;

        return number_format($mb, 2, '.', '').' MB';
    }
}
