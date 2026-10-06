<?php

namespace App\Domain\Ticketera\Services;

use App\Domain\Monitoring\PRTG\Services\PrtgHistoricOutageReader;
use App\Models\NetworkAssignment;
use App\Models\PrtgSensor;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Cache;
use Throwable;

/**
 * Historial PRTG de un CID para la línea de tiempo de Ticketera.
 * Una caída de menos de un minuto no cuenta como caída.
 */
class TicketeraPrtgTimelineService
{
    private const ZONE = 'America/Lima';

    public function __construct(private readonly PrtgHistoricOutageReader $reader) {}

    /**
     * @return array{
     *   source: string,
     *   cid: string,
     *   sensor: ?string,
     *   sensor_name: ?string,
     *   ignored_under_minute: int,
     *   outages: list<array{start: string, end: ?string, seconds: int}>,
     *   message: ?string
     * }
     */
    public function forCid(string $cid, string $from, string $to): array
    {
        $cacheKey = 'ticketera.prtg.timeline.v1.'.$cid.'.'.$from.'.'.$to;

        $cached = Cache::get($cacheKey);
        if (is_array($cached)) {
            return $cached;
        }

        try {
            $payload = $this->read($cid, $from, $to);
        } catch (Throwable $exception) {
            return [
                'source' => 'sheet',
                'cid' => $cid,
                'sensor' => null,
                'sensor_name' => null,
                'ignored_under_minute' => 0,
                'outages' => [],
                'message' => 'No se pudo consultar PRTG'
                    .($exception->getMessage() !== '' ? ': '.$exception->getMessage() : '.')
                    .' La línea de tiempo usa la ticketera y omite caídas de menos de 1 minuto.',
            ];
        }

        if ($payload['source'] === 'prtg') {
            Cache::put($cacheKey, $payload, 90);
        }

        return $payload;
    }

    /**
     * @return array{
     *   source: string,
     *   cid: string,
     *   sensor: ?string,
     *   sensor_name: ?string,
     *   ignored_under_minute: int,
     *   outages: list<array{start: string, end: ?string, seconds: int}>,
     *   message: ?string
     * }
     */
    private function read(string $cid, string $from, string $to): array
    {
        $empty = [
            'source' => 'sheet',
            'cid' => $cid,
            'sensor' => null,
            'sensor_name' => null,
            'ignored_under_minute' => 0,
            'outages' => [],
            'message' => null,
        ];

        $assignment = NetworkAssignment::query()->where('cid', $cid)->first();
        if ($assignment === null) {
            $empty['message'] = 'Este CID no está en el monitoreo PRTG. La línea de tiempo usa la ticketera y omite caídas de menos de 1 minuto.';

            return $empty;
        }

        $sensor = PrtgSensor::query()
            ->where('network_assignment_id', $assignment->id)
            ->whereRaw('LOWER(name) = ?', ['ping'])
            ->orderBy('id')
            ->first();

        if ($sensor === null || ! is_numeric($sensor->prtg_sensor_id)) {
            $empty['message'] = 'Este colegio no tiene sensor Ping en PRTG. La línea de tiempo usa la ticketera y omite caídas de menos de 1 minuto.';

            return $empty;
        }

        $start = CarbonImmutable::parse($from.' 00:00:00', self::ZONE);
        $end = CarbonImmutable::parse($to.' 00:00:00', self::ZONE)->addDay();
        $fetchFrom = $start->subDays(60);

        try {
            $result = $this->reader->intervalsForSensor(
                (int) $sensor->prtg_sensor_id,
                $fetchFrom->utc(),
                CarbonImmutable::now('UTC'),
                8000,
            );
        } catch (Throwable $exception) {
            $empty['message'] = 'PRTG no entregó el historial'
                .($exception->getMessage() !== '' ? ': '.$exception->getMessage() : '.')
                .' La línea de tiempo usa la ticketera y omite caídas de menos de 1 minuto.';

            return $empty;
        }

        $ignored = 0;
        $outages = [];
        foreach ($result['outages'] as $outage) {
            $started = $outage['started_at'];
            $recovered = $outage['recovered_at'];
            $until = $recovered ?? CarbonImmutable::now('UTC');
            $seconds = max(0, $until->getTimestamp() - $started->getTimestamp());
            if ($seconds < 60) {
                $ignored++;

                continue;
            }
            if ($until->lessThanOrEqualTo($start->utc()) || $started->greaterThanOrEqualTo($end->utc())) {
                continue;
            }
            $outages[] = [
                'start' => $started->timezone(self::ZONE)->toIso8601String(),
                'end' => $recovered?->timezone(self::ZONE)->toIso8601String(),
                'seconds' => $seconds,
            ];
        }

        usort($outages, fn (array $a, array $b): int => strcmp($a['start'], $b['start']));

        return [
            'source' => 'prtg',
            'cid' => $cid,
            'sensor' => (string) $sensor->prtg_sensor_id,
            'sensor_name' => (string) ($sensor->name ?? 'Ping'),
            'ignored_under_minute' => $ignored,
            'outages' => $outages,
            'message' => null,
        ];
    }
}
