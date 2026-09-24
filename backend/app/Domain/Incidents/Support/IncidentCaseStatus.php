<?php

namespace App\Domain\Incidents\Support;

use App\Enums\FollowupStatus;
use App\Models\Incident;
use App\Models\TrackingRecord;

/**
 * Estado consolidado del caso (incidencia + seguimiento + Tracking) para lectura humana.
 */
final class IncidentCaseStatus
{
    /**
     * @return array{code: string, label: string, tone: string}
     */
    public static function resolve(Incident $incident, ?TrackingRecord $tracking): array
    {
        $followup = $incident->followup_status instanceof FollowupStatus
            ? $incident->followup_status
            : FollowupStatus::tryFrom((string) $incident->followup_status);

        if ($incident->recovered_at === null) {
            $managing = $followup !== null
                && in_array($followup->value, FollowupStatus::managingValues(), true);

            return $managing
                ? ['code' => 'ACTIVE_MANAGING', 'label' => 'Caída · '.$followup->label(), 'tone' => 'warning']
                : ['code' => 'ACTIVE_UNMANAGED', 'label' => 'Caída sin gestión', 'tone' => 'danger'];
        }

        if ($tracking !== null && $tracking->isClosed()) {
            return ['code' => 'CLOSED', 'label' => 'Cerrado', 'tone' => 'neutral'];
        }

        if ($tracking !== null) {
            $label = 'Recuperado · Tracking abierto';
            $managing = $followup !== null
                && in_array($followup->value, FollowupStatus::managingValues(), true);
            if ($managing) {
                $label .= ' · '.$followup->label();
            }

            return [
                'code' => 'RECOVERED_TRACKING_OPEN',
                'label' => $label,
                'tone' => $managing ? 'warning' : 'info',
            ];
        }

        return ['code' => 'RECOVERED', 'label' => 'Recuperado', 'tone' => 'success'];
    }
}
