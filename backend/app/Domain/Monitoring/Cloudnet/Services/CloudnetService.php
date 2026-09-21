<?php

namespace App\Domain\Monitoring\Cloudnet\Services;

use Illuminate\Support\Facades\Http;
use Throwable;

class CloudnetService
{
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

        $response = Http::timeout(60)
            ->withHeaders(['apikey' => $key])
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
     * Equipos de un shop. null si el endpoint no está disponible.
     *
     * @return array<int, array<string, mixed>>|null
     */
    public function fetchShopDevices(string $shopId): ?array
    {
        $base = rtrim((string) config('cloudnet.base_url'), '/');
        $key = (string) config('cloudnet.api_key');
        if ($base === '' || $key === '' || $shopId === '') {
            return null;
        }

        try {
            $response = Http::timeout(20)
                ->withHeaders(['apikey' => $key])
                ->post("{$base}/shop/device", [
                    'shopId' => (int) $shopId,
                    'pageIndex' => 1,
                    'pageSize' => 50,
                ]);
        } catch (Throwable) {
            return null;
        }

        if (! $response->successful()) {
            return null;
        }

        $json = $response->json();
        if (! is_array($json) || ($json['code'] ?? 1) !== 0) {
            return null;
        }

        $data = $json['data'] ?? [];

        return is_array($data) ? $data : [];
    }
}
