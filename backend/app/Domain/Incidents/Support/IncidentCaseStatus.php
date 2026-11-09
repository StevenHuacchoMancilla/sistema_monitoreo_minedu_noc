<?php

namespace App\Domain\Incidents\Support;

use App\Enums\FollowupStatus;
use App\Models\Incident;
use App\Models\ServiceTicket;
use App\Models\TrackingRecord;

/**
 * Estado consolidado del caso para lectura humana (caída + ticket / gestión).
 * No expone el módulo Tracking al operador.
 */
final class IncidentCaseStatus
{
    /**
     * @return array{code: string, label: string, tone: string}
     */
    public static function resolve(Incident $incident, ?TrackingRecord $tracking = null): array
    {
        unset($tracking); // legacy arg; el estado ya no depende de Tracking

        $followup = $incident->followup_status instanceof FollowupStatus
            ? $incident->followup_status
            : FollowupStatus::tryFrom((string) $incident->followup_status);

        $ticket = $incident->relationLoaded('serviceTicket')
            ? $incident->serviceTicket
            : ServiceTicket::query()->where('incident_id', $incident->id)->first();

        if ($incident->recovered_at === null) {
            $managing = $followup !== null
                && in_array($followup->value, FollowupStatus::managingValues(), true);

            if ($managing) {
                return [
                    'code' => 'ACTIVE_MANAGING',
                    'label' => 'Caída · '.$followup->label(),
                    'tone' => 'warning',
                ];
            }

            if ($ticket !== null) {
                return [
                    'code' => 'ACTIVE_TICKET',
                    'label' => 'En atención · '.$ticket->ticket_code,
                    'tone' => 'warning',
                ];
            }

            return [
                'code' => 'ACTIVE_UNMANAGED',
                'label' => 'Caída sin gestión',
                'tone' => 'danger',
            ];
        }

        if ($ticket !== null && $ticket->status === ServiceTicket::STATUS_CLOSED) {
            return ['code' => 'CLOSED', 'label' => 'Cerrado', 'tone' => 'neutral'];
        }

        if ($followup === FollowupStatus::PendienteCierre) {
            return [
                'code' => 'RECOVERED_PENDING_CLOSE',
                'label' => 'Recuperado · Pendiente de cierre',
                'tone' => 'info',
            ];
        }

        if ($ticket !== null && $ticket->status === ServiceTicket::STATUS_OPEN) {
            return [
                'code' => 'RECOVERED_TICKET_OPEN',
                'label' => 'Recuperado · Ticket abierto',
                'tone' => 'info',
            ];
        }

        return ['code' => 'RECOVERED', 'label' => 'Recuperado', 'tone' => 'success'];
    }
}
