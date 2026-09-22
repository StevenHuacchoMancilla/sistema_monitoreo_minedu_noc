<?php

namespace App\Domain\Monitoring\Cloudnet\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Throwable;

class CloudnetService
{
    private ?bool $deviceApiAvailable = null;

    private ?string $deviceApiError = null;

    /**
     * @return array<int, array<string, mixed>>
     */
    public function fetchSites(): array
    {
        $base = rtrim((string) config('cloudnet.base_url'), '/');
        $key = (string) config('cloudnet.api_key');
        if ($base === '' || $key === '') {
            throw new \RuntimeException('CLOUDNET_BASE_URL o CLOUDNET_API_KEY no configurados');
        }

        $response = Http::withoutVerifying()
            ->timeout(60)
            ->withHeaders(['apikey' => $key, 'Accept' => 'application/json'])
            ->get("{$base}/user/shop");

        if (! $response->successful()) {
            throw new \RuntimeException("Cloudnet HTTP {$response->status()}");
        }

        $json = $response->json();
        if (($json['code'] ?? 1) !== 0) {
            throw new \RuntimeException('Cloudnet: '.($json['message'] ?? 'error'));
        }

        return $json['data'] ?? [];
    }

    /**
     * @return array{devices: array<int, array<string, mixed>>, aps: array<int, array<string, mixed>>, error: ?string}|null
     */
    public function fetchShopInventory(string $shopId): ?array
    {
        $base = rtrim((string) config('cloudnet.base_url'), '/');
        $key = (string) config('cloudnet.api_key');
        if ($base === '' || $key === '' || $shopId === '') {
            return null;
        }

        if ($this->deviceApiAvailable === false) {
            return [
                'devices' => [],
                'aps' => [],
                'error' => $this->deviceApiError ?? 'CLOUDNET_DEVICE_API_UNAVAILABLE',
            ];
        }

        $devices = $this->tryFetchDevices($base, $key, $shopId);
        if ($devices['items'] === null) {
            $this->deviceApiAvailable = false;
            $this->deviceApiError = $devices['error'];

            return [
                'devices' => [],
                'aps' => [],
                'error' => $devices['error'],
            ];
        }

        $this->deviceApiAvailable = true;
        $aps = $this->extractApsFromDevices($devices['items']);

        return [
            'devices' => $devices['items'],
            'aps' => $aps,
            'error' => null,
        ];
    }

    /**
     * @return array<int, array<string, mixed>>|null
     */
    public function fetchShopDevices(string $shopId): ?array
    {
        $inventory = $this->fetchShopInventory($shopId);
        if ($inventory === null) {
            return null;
        }
        if (($inventory['error'] ?? null) && $inventory['devices'] === []) {
            return null;
        }

        return $inventory['devices'];
    }

    /**
     * @return array{items: ?array<int, array<string, mixed>>, error: ?string}
     */
    private function tryFetchDevices(string $base, string $key, string $shopId): array
    {
        $attempts = [
            fn () => Http::withoutVerifying()->timeout(8)->withHeaders(['apikey' => $key, 'Accept' => 'application/json'])
                ->asJson()->post("{$base}/shop/device", [
                    'shopId' => (int) $shopId,
                    'pageIndex' => 1,
                    'pageSize' => 100,
                ]),
            fn () => Http::withoutVerifying()->timeout(8)->withHeaders(['apikey' => $key, 'Accept' => 'application/json'])
                ->get("{$base}/shop/device", ['shopId' => (int) $shopId]),
        ];

        $lastError = null;
        foreach ($attempts as $attempt) {
            try {
                $response = $attempt();
            } catch (Throwable $e) {
                $lastError = $e->getMessage();

                continue;
            }

            if (! $response->successful()) {
                $lastError = 'HTTP '.$response->status();

                continue;
            }

            $json = $response->json();
            if (! is_array($json)) {
                $lastError = 'invalid_json';

                continue;
            }

            if ((int) ($json['code'] ?? 1) !== 0) {
                $lastError = (string) ($json['message'] ?? 'cloudnet_code_error');

                continue;
            }

            $items = $this->normalizeList($json['data'] ?? null);
            if ($items !== null) {
                return ['items' => $items, 'error' => null];
            }
            $lastError = 'empty_or_unexpected_data';
        }

        Log::warning('[Cloudnet] Device API unavailable', ['shopId' => $shopId, 'error' => $lastError]);

        return ['items' => null, 'error' => $lastError];
    }

    /**
     * @param  array<int, array<string, mixed>>  $devices
     * @return array<int, array<string, mixed>>
     */
    private function extractApsFromDevices(array $devices): array
    {
        return array_values(array_filter($devices, function (array $device): bool {
            $type = strtolower((string) ($device['devType'] ?? $device['type'] ?? $device['deviceType'] ?? ''));
            $model = strtolower((string) ($device['devModel'] ?? $device['model'] ?? ''));

            return str_contains($type, 'ap')
                || str_contains($model, 'ap')
                || str_contains($model, 'wa')
                || str_contains($model, 'wireless');
        }));
    }

    /**
     * @return array<int, array<string, mixed>>|null
     */
    private function normalizeList(mixed $data): ?array
    {
        if (! is_array($data)) {
            return null;
        }

        if ($data === []) {
            return [];
        }

        if (array_is_list($data)) {
            return array_values(array_filter($data, 'is_array'));
        }

        foreach (['list', 'deviceList', 'devices', 'apList', 'rows', 'records'] as $key) {
            if (isset($data[$key]) && is_array($data[$key])) {
                return array_values(array_filter($data[$key], 'is_array'));
            }
        }

        return null;
    }
}
