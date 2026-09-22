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
}
