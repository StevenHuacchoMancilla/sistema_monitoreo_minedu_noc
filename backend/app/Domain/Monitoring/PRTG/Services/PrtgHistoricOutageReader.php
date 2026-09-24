<?php

namespace App\Domain\Monitoring\PRTG\Services;

use App\Domain\Monitoring\PRTG\Support\PrtgOutageIntervalBuilder;
use App\Domain\Monitoring\PRTG\Support\PrtgTimestamps;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Http;
use RuntimeException;

/**
 * Lectura READ-ONLY de historial PRTG (messages → intervalos DOWN/UP).
 */
class PrtgHistoricOutageReader
{
    /**
     * @return array{
     *   events: array<int, array{at: CarbonImmutable, kind: string, status: string, message: string}>,
     *   outages: array<int, array{started_at: CarbonImmutable, recovered_at: ?CarbonImmutable}>
     * }
     */
    public function intervalsForSensor(int $prtgSensorId, CarbonImmutable $fromUtc, CarbonImmutable $toUtc): array
    {
        $messages = $this->fetchMessages($prtgSensorId);
        $events = $this->messagesToEvents($messages, $fromUtc, $toUtc);
        $outages = PrtgOutageIntervalBuilder::build($events);

        return ['events' => $events, 'outages' => $outages];
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    public function fetchMessages(int $prtgSensorId): array
    {
        $base = rtrim((string) config('prtg.base_url'), '/');
        $token = (string) config('prtg.api_token');
        if ($base === '' || $token === '') {
            throw new RuntimeException('PRTG_BASE_URL o PRTG_API_TOKEN no configurados');
        }

        $response = Http::withoutVerifying()->timeout(120)->get("{$base}/api/table.json", [
            'content' => 'messages',
            'columns' => 'objid,datetime,parent,type,name,status,message',
            'id' => $prtgSensorId,
            'count' => 2000,
            'apitoken' => $token,
        ]);

        if (! $response->successful()) {
            throw new RuntimeException("PRTG HTTP {$response->status()} messages");
        }

        return $response->json()['messages'] ?? [];
    }

    /**
     * @param  array<int, array<string, mixed>>  $messages
     * @return array<int, array{at: CarbonImmutable, kind: string, status: string, message: string}>
     */
    public function messagesToEvents(array $messages, CarbonImmutable $fromUtc, CarbonImmutable $toUtc): array
    {
        $events = [];
        foreach ($messages as $row) {
            $at = PrtgTimestamps::fromOle($row['datetime_raw'] ?? null);
            if ($at === null) {
                continue;
            }
            if ($at->lt($fromUtc) || $at->gt($toUtc)) {
                continue;
            }

            $status = strip_tags((string) ($row['status'] ?? ''));
            $events[] = [
                'at' => $at,
                'kind' => PrtgOutageIntervalBuilder::classifyStatus($status),
                'status' => $status,
                'message' => strip_tags((string) ($row['message_raw'] ?? $row['message'] ?? '')),
            ];
        }

        usort($events, fn (array $a, array $b): int => $a['at']->getTimestamp() <=> $b['at']->getTimestamp());

        return $events;
    }

    public static function fingerprint(string $prtgSensorId, CarbonImmutable $startedAtUtc): string
    {
        return hash('sha256', $prtgSensorId.'|'.$startedAtUtc->utc()->format('Y-m-d\TH:i:s\Z'));
    }
}
