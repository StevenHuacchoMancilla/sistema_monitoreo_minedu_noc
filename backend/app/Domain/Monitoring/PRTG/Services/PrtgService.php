<?php

namespace App\Domain\Monitoring\PRTG\Services;

use Illuminate\Support\Facades\Http;

class PrtgService
{
    /**
     * @param  array<string, mixed>  $query
     * @return array<int, array<string, mixed>>
     */
    public function fetchTable(string $content, array $query): array
    {
        $base = rtrim((string) config('prtg.base_url'), '/');
        $token = (string) config('prtg.api_token');

        if ($base === '' || $token === '') {
            throw new \RuntimeException('PRTG_BASE_URL o PRTG_API_TOKEN no configurados');
        }

        $response = Http::withoutVerifying()
            ->timeout(90)
            ->get("{$base}/api/table.json", array_merge($query, [
                'content' => $content,
                'apitoken' => $token,
            ]));

        if (! $response->successful()) {
            throw new \RuntimeException("PRTG HTTP {$response->status()} para {$content}");
        }

        $json = $response->json();

        return $json[$content] ?? [];
    }

    public function findLoretoGroupId(): int
    {
        $allowedProbe = (string) config('prtg.allowed_probe');
        $allowedRoot = (string) config('prtg.allowed_root_group');

        $groups = $this->fetchTable('groups', [
            'columns' => 'objid,group,probe,parentid,status',
            'count' => 5000,
        ]);

        foreach ($groups as $group) {
            if (($group['probe'] ?? '') === $allowedProbe && ($group['group'] ?? '') === $allowedRoot) {
                return (int) $group['objid'];
            }
        }

        throw new \RuntimeException("No se encontró {$allowedRoot} bajo {$allowedProbe}");
    }

    public function extractCid(string $deviceName): ?string
    {
        if (preg_match('/^CID(\d+)/', $deviceName, $matches) !== 1) {
            return null;
        }

        return $matches[1];
    }
}
