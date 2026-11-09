<?php

namespace App\Http\Controllers\Api\V1\Notifications;

use App\Domain\Notifications\Services\OperationalAlertService;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class OperationalNotificationController extends Controller
{
    public function __construct(private readonly OperationalAlertService $alerts) {}

    public function index(Request $request): JsonResponse
    {
        $data = $request->validate([
            'limit' => ['nullable', 'integer', 'min:1', 'max:50'],
        ]);

        return response()->json(
            $this->alerts->recoveryAlerts((int) ($data['limit'] ?? 25))
        );
    }

    public function restorations(Request $request): JsonResponse
    {
        $data = $request->validate([
            'minutes' => ['nullable', 'integer', 'min:5', 'max:1440'],
            'limit' => ['nullable', 'integer', 'min:1', 'max:80'],
        ]);

        return response()->json(
            $this->alerts->recentRestorations(
                (int) ($data['minutes'] ?? 60),
                (int) ($data['limit'] ?? 40),
            )
        );
    }

    public function outages(Request $request): JsonResponse
    {
        $data = $request->validate([
            'minutes' => ['nullable', 'integer', 'min:5', 'max:1440'],
            'limit' => ['nullable', 'integer', 'min:1', 'max:80'],
        ]);

        return response()->json(
            $this->alerts->recentOutages(
                (int) ($data['minutes'] ?? 60),
                (int) ($data['limit'] ?? 40),
            )
        );
    }

    public function live(Request $request): JsonResponse
    {
        $data = $request->validate([
            'minutes' => ['nullable', 'integer', 'min:5', 'max:1440'],
            'limit' => ['nullable', 'integer', 'min:1', 'max:80'],
        ]);

        return response()->json(
            $this->alerts->liveEvents(
                (int) ($data['minutes'] ?? 60),
                (int) ($data['limit'] ?? 40),
            )
        );
    }
}
