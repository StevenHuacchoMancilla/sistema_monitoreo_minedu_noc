<?php

namespace App\Domain\Incidents\Services;

use App\Domain\Tracking\Services\TrackingLifecycleService;
use App\Enums\FollowupStatus;
use App\Enums\MonitoringStatus;
use App\Models\Incident;
use App\Models\IncidentUpdate;
use App\Models\TrackingRecord;
use Illuminate\Support\Facades\DB;
use Throwable;

/**
 * Cierre operativo unificado: Tracking (si existe) + incidencia CERRADO, con user_id.
 */
class IncidentOperativeCloseService
{
    public function __construct(
        private readonly TrackingLifecycleService $trackingLifecycle,
    ) {}

    /**
     * @return array{incident: Incident, tracking_closed: bool}
     */
    public function close(Incident $incident, ?string $observation, int $userId): array
    {
        return DB::transaction(function () use ($incident, $observation, $userId) {
            /** @var Incident $locked */
            $locked = Incident::query()->whereKey($incident->id)->lockForUpdate()->firstOrFail();

            $trackingClosed = false;
            $tracking = TrackingRecord::query()
                ->notClosed()
                ->where('incident_id', $locked->id)
                ->orderByDesc('id')
                ->first();

            if ($tracking && $userId > 0) {
                try {
                    $this->trackingLifecycle->close(
                        $tracking,
                        [
                            'lock_version' => (int) $tracking->lock_version,
                            'closing_note' => $observation,
                        ],
                        $userId,
                    );
                    $trackingClosed = true;
                } catch (Throwable $e) {
                    // Si ya estaba cerrado u otro conflicto, seguimos cerrando la incidencia.
                    report($e);
                }
            }

            $before = $locked->followup_status?->value;
            $payload = [
                'followup_status' => FollowupStatus::Cerrado,
            ];
            if ($locked->recovered_at === null) {
                $payload['recovered_at'] = now();
                $payload['current_status'] = MonitoringStatus::Operativo->value;
            }
            $locked->fill($payload);
            $locked->last_contact_at = now();
            $locked->save();

            IncidentUpdate::query()->create([
                'incident_id' => $locked->id,
                'type' => 'MANUAL',
                'status_before' => $before,
                'status_after' => FollowupStatus::Cerrado->value,
                'observation' => $observation ?: 'Ticket cerrado por el operador.',
                'user_id' => $userId > 0 ? $userId : null,
                'created_at' => now(),
            ]);

            return [
                'incident' => $locked->fresh() ?? $locked,
                'tracking_closed' => $trackingClosed,
            ];
        });
    }
}
