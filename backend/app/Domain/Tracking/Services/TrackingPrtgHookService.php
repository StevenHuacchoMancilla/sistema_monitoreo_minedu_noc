<?php

namespace App\Domain\Tracking\Services;

use App\Enums\AuditModule;
use App\Enums\AuditSource;
use App\Enums\FollowupStatus;
use App\Enums\TrackingEventType;
use App\Enums\TrackingStatus;
use App\Enums\TrackingTechnicalStatus;
use App\Models\Incident;
use App\Models\TrackingRecord;
use App\Models\TrackingUpdate;
use App\Services\AuditLogger;
use Illuminate\Support\Facades\DB;
use Throwable;

/**
 * Puente PRTG → Tracking General.
 * La recuperación técnica NUNCA cierra el Tracking.
 */
class TrackingPrtgHookService
{
    public function __construct(
        private readonly AuditLogger $audit,
        private readonly TrackingOpenService $trackingOpen,
    ) {}

    /**
     * PRTG reportó OPERATIVO: marca recuperación técnica si hay Tracking abierto.
     */
    public function onIncidentTechnicallyRecovered(Incident $incident): void
    {
        $tracking = $this->findOpenTrackingForIncident($incident);
        if (! $tracking) {
            return;
        }

        if (
            $tracking->status === TrackingStatus::TechnicallyRecovered
            && $tracking->technical_status === TrackingTechnicalStatus::Recovered
            && (int) $tracking->incident_id === (int) $incident->id
        ) {
            return;
        }

        DB::transaction(function () use ($tracking, $incident) {
            $tracking = TrackingRecord::query()->whereKey($tracking->id)->lockForUpdate()->first();
            if (! $tracking || $tracking->isClosed()) {
                return;
            }

            $now = now();

            TrackingUpdate::query()->create([
                'tracking_record_id' => $tracking->id,
                'event_type' => TrackingEventType::TechnicalRecovery,
                'body' => 'PRTG reportó recuperación técnica (Ping OPERATIVO). El Tracking permanece abierto (Pendiente de cierre) hasta cierre operativo.',
                'created_by_user_id' => null,
                'legacy_actor_name' => null,
                'occurred_on' => $now->toDateString(),
                'occurred_at' => $now,
            ]);

            $before = [
                'status' => $tracking->status instanceof TrackingStatus
                    ? $tracking->status->value
                    : (string) $tracking->status,
                'technical_status' => $tracking->technical_status instanceof TrackingTechnicalStatus
                    ? $tracking->technical_status->value
                    : $tracking->technical_status,
                'incident_id' => $tracking->incident_id,
            ];

            $tracking->status = TrackingStatus::TechnicallyRecovered;
            $tracking->technical_status = TrackingTechnicalStatus::Recovered;
            $tracking->technical_recovered_at = $now;
            if ((int) $tracking->incident_id !== (int) $incident->id) {
                $tracking->incident_id = $incident->id;
            }
            $tracking->bumpLockVersion();
            $tracking->save();

            $this->audit->record(
                $tracking,
                'TRACKING_TECHNICAL_RECOVERY',
                $before,
                [
                    'status' => TrackingStatus::TechnicallyRecovered->value,
                    'technical_status' => TrackingTechnicalStatus::Recovered->value,
                    'technical_recovered_at' => $now->toIso8601String(),
                    'incident_id' => $tracking->incident_id,
                ],
                AuditModule::TrackingGeneral,
                AuditSource::System
            );
        });
    }

    /**
     * Nueva caída PRTG.
     * - Si el ticket previo estaba en Pendiente de cierre → nuevo Tracking (ticket distinto).
     * - Si no → relink al Tracking abierto existente.
     */
    public function onIncidentTechnicallyDown(Incident $incident): void
    {
        $tracking = $this->findOpenTrackingForAssignment($incident);

        if ($tracking && $this->shouldOpenFreshTicket($tracking, $incident)) {
            $this->openFreshTicketForRefall($incident, $tracking);

            return;
        }

        if (! $tracking) {
            return;
        }

        if (
            (int) $tracking->incident_id === (int) $incident->id
            && $tracking->technical_status === TrackingTechnicalStatus::Down
        ) {
            return;
        }

        DB::transaction(function () use ($tracking, $incident) {
            $tracking = TrackingRecord::query()->whereKey($tracking->id)->lockForUpdate()->first();
            if (! $tracking || $tracking->isClosed()) {
                return;
            }

            $now = now();
            $previousIncidentId = $tracking->incident_id;

            TrackingUpdate::query()->create([
                'tracking_record_id' => $tracking->id,
                'event_type' => TrackingEventType::SystemEvent,
                'body' => $previousIncidentId && (int) $previousIncidentId !== (int) $incident->id
                    ? "PRTG reportó nueva caída (re-caída). Se vinculó la incidencia #{$incident->id} (antes #{$previousIncidentId}). El Tracking sigue abierto."
                    : "PRTG reportó caída. Se vinculó la incidencia #{$incident->id}. El Tracking sigue abierto.",
                'created_by_user_id' => null,
                'legacy_actor_name' => null,
                'occurred_on' => $now->toDateString(),
                'occurred_at' => $now,
            ]);

            $before = [
                'status' => $tracking->status instanceof TrackingStatus
                    ? $tracking->status->value
                    : (string) $tracking->status,
                'technical_status' => $tracking->technical_status instanceof TrackingTechnicalStatus
                    ? $tracking->technical_status->value
                    : $tracking->technical_status,
                'incident_id' => $tracking->incident_id,
            ];

            $tracking->incident_id = $incident->id;
            $tracking->technical_status = TrackingTechnicalStatus::Down;
            if (
                $tracking->status === TrackingStatus::TechnicallyRecovered
                || $tracking->status === TrackingStatus::Open
            ) {
                $tracking->status = TrackingStatus::InProgress;
            }
            $tracking->bumpLockVersion();
            $tracking->save();

            $this->audit->record(
                $tracking,
                'TRACKING_TECHNICAL_OUTAGE',
                $before,
                [
                    'status' => $tracking->status instanceof TrackingStatus
                        ? $tracking->status->value
                        : (string) $tracking->status,
                    'technical_status' => TrackingTechnicalStatus::Down->value,
                    'incident_id' => $tracking->incident_id,
                    'previous_incident_id' => $previousIncidentId,
                ],
                AuditModule::TrackingGeneral,
                AuditSource::System
            );
        });
    }

    private function shouldOpenFreshTicket(TrackingRecord $tracking, Incident $newIncident): bool
    {
        if ((int) $tracking->incident_id === (int) $newIncident->id) {
            return false;
        }

        $previous = $tracking->incident_id
            ? Incident::query()->find($tracking->incident_id)
            : null;

        if (! $previous) {
            return false;
        }

        // Ticket en pendiente de cierre (recuperado en gestión) → nuevo ticket al recaer.
        return $previous->followup_status === FollowupStatus::PendienteCierre
            && $previous->recovered_at !== null;
    }

    private function openFreshTicketForRefall(Incident $incident, TrackingRecord $previousTracking): void
    {
        $now = now();

        TrackingUpdate::query()->create([
            'tracking_record_id' => $previousTracking->id,
            'event_type' => TrackingEventType::SystemEvent,
            'body' => "Re-caída con ticket en Pendiente de cierre. Se abre un nuevo ticket para la incidencia #{$incident->id}. Este Tracking permanece para cierre operativo del ciclo anterior.",
            'created_by_user_id' => null,
            'legacy_actor_name' => null,
            'occurred_on' => $now->toDateString(),
            'occurred_at' => $now,
        ]);

        try {
            $userId = (int) ($previousTracking->opened_by_user_id ?? 0);
            if ($userId < 1) {
                $userId = (int) (\App\Models\User::query()->orderBy('id')->value('id') ?? 0);
            }
            if ($userId > 0) {
                $this->trackingOpen->openFromIncident($incident, $userId);
            }
        } catch (Throwable $e) {
            // No bloquear sync PRTG si falla la apertura del ticket.
            report($e);
        }
    }

    private function findOpenTrackingForIncident(Incident $incident): ?TrackingRecord
    {
        $byIncident = TrackingRecord::query()
            ->openForIncident((int) $incident->id)
            ->orderByDesc('id')
            ->first();

        if ($byIncident) {
            return $byIncident;
        }

        return $this->findOpenTrackingForAssignment($incident);
    }

    private function findOpenTrackingForAssignment(Incident $incident): ?TrackingRecord
    {
        if ($incident->network_assignment_id) {
            $byAssignment = TrackingRecord::query()
                ->notClosed()
                ->where('network_assignment_id', $incident->network_assignment_id)
                ->orderByDesc('id')
                ->first();

            if ($byAssignment) {
                return $byAssignment;
            }
        }

        if ($incident->school_id) {
            return TrackingRecord::query()
                ->notClosed()
                ->where('school_id', $incident->school_id)
                ->orderByDesc('id')
                ->first();
        }

        return null;
    }
}
