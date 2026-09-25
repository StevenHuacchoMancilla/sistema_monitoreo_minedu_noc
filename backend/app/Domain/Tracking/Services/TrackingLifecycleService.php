<?php

namespace App\Domain\Tracking\Services;

use App\Domain\Tracking\Exceptions\TrackingLifecycleConflict;
use App\Domain\Tracking\Support\TrackingTicketCodes;
use App\Enums\AuditModule;
use App\Enums\AuditSource;
use App\Enums\DatePrecision;
use App\Enums\TrackingEventType;
use App\Enums\TrackingStatus;
use App\Models\TrackingRecord;
use App\Models\TrackingUpdate;
use App\Models\User;
use App\Services\AuditLogger;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class TrackingLifecycleService
{
    public function __construct(
        private readonly AuditLogger $audit,
        private readonly TrackingDetailService $detail,
        private readonly TrackingTicketCodes $tickets,
    ) {}

    /**
     * @param  array{lock_version: int, closing_note?: string|null}  $payload
     * @return array<string, mixed>
     */
    public function close(TrackingRecord $tracking, array $payload, int $userId): array
    {
        if ($userId < 1) {
            throw ValidationException::withMessages([
                'user' => ['Se requiere un usuario autenticado para cerrar el Tracking.'],
            ]);
        }

        return DB::transaction(function () use ($tracking, $payload, $userId) {
            /** @var TrackingRecord $locked */
            $locked = TrackingRecord::query()->whereKey($tracking->id)->lockForUpdate()->firstOrFail();
            $locked->loadMissing(['closedBy:id,name', 'openedBy:id,name']);

            $this->assertLockVersion($locked, (int) $payload['lock_version']);

            if ($locked->isClosed()) {
                throw new TrackingLifecycleConflict(
                    'ALREADY_CLOSED',
                    $this->alreadyClosedMessage($locked),
                    $locked
                );
            }

            $note = isset($payload['closing_note']) ? trim((string) $payload['closing_note']) : '';
            $note = $note !== '' ? $note : null;
            $now = now();
            $closerName = User::query()->whereKey($userId)->value('name') ?: 'Operador';

            $before = [
                'status' => $locked->status instanceof TrackingStatus
                    ? $locked->status->value
                    : (string) $locked->status,
                'closed_at' => $locked->closed_at?->toIso8601String(),
                'closed_by_user_id' => $locked->closed_by_user_id,
                'opened_by_user_id' => $locked->opened_by_user_id,
                'lock_version' => (int) $locked->lock_version,
                'report_ticket' => $locked->report_ticket,
                'case_code' => $locked->case_code,
            ];

            $previousTicket = $locked->report_ticket ?? $locked->ticket;
            $finalTicket = $locked->case_code
                ? $this->tickets->reportTicketClosed((string) $locked->case_code, $now)
                : $previousTicket;

            $locked->status = TrackingStatus::Closed;
            $locked->closed_at = $now;
            $locked->closed_at_precision = DatePrecision::DateTime;
            $locked->closed_by_user_id = $userId;
            $locked->closed_by_legacy_name = null;
            $locked->closing_note = $note;
            $locked->report_ticket = $finalTicket;
            $locked->ticket = $finalTicket;
            $locked->bumpLockVersion();
            $locked->save();

            if ($note) {
                TrackingUpdate::query()->create([
                    'tracking_record_id' => $locked->id,
                    'event_type' => TrackingEventType::Comment,
                    'body' => 'Cierre: '.$note,
                    'created_by_user_id' => $userId,
                    'legacy_actor_name' => null,
                    'occurred_on' => $now->toDateString(),
                    'occurred_at' => $now,
                ]);
            }

            TrackingUpdate::query()->create([
                'tracking_record_id' => $locked->id,
                'event_type' => TrackingEventType::SystemEvent,
                'body' => "Tracking cerrado formalmente por {$closerName}.",
                'created_by_user_id' => $userId,
                'legacy_actor_name' => null,
                'occurred_on' => $now->toDateString(),
                'occurred_at' => $now,
            ]);

            $this->audit->record(
                $locked,
                'CLOSE_TRACKING',
                $before,
                [
                    'status' => TrackingStatus::Closed->value,
                    'closed_at' => $now->toIso8601String(),
                    'closed_by_user_id' => $userId,
                    'closed_by_name' => $closerName,
                    'opened_by_user_id' => $locked->opened_by_user_id,
                    'closing_note' => $note,
                    'lock_version' => (int) $locked->lock_version,
                    'previous_ticket_code' => $previousTicket,
                    'final_ticket_code' => $finalTicket,
                    'case_code' => $locked->case_code,
                    'public_id' => $locked->public_id,
                ],
                AuditModule::TrackingGeneral,
                AuditSource::Api,
                $userId
            );

            // Caída parcial de enlace: al cerrar Tracking se cierra la incidencia (Ping suele seguir OPERATIVO).
            if ($locked->incident_id) {
                $incident = \App\Models\Incident::query()->find($locked->incident_id);
                if ($incident && $incident->isManualPartial() && $incident->recovered_at === null) {
                    app(\App\Domain\Incidents\Services\IncidentService::class)->applyTechnicalRecovery(
                        $incident,
                        'Cierre operativo: Tracking cerrado (caída parcial de enlace).',
                    );
                }
            }

            return $this->detail->show($locked->fresh() ?? $locked);
        });
    }

    /**
     * @param  array{lock_version: int, note?: string|null}  $payload
     * @return array<string, mixed>
     */
    public function reopen(TrackingRecord $tracking, array $payload, int $userId): array
    {
        return DB::transaction(function () use ($tracking, $payload, $userId) {
            /** @var TrackingRecord $locked */
            $locked = TrackingRecord::query()->whereKey($tracking->id)->lockForUpdate()->firstOrFail();
            $locked->loadMissing(['closedBy:id,name', 'openedBy:id,name']);

            $this->assertLockVersion($locked, (int) $payload['lock_version']);

            if (! $locked->isClosed()) {
                throw new TrackingLifecycleConflict(
                    'NOT_CLOSED',
                    'Este Tracking ya está abierto.',
                    $locked
                );
            }

            if ($locked->incident_id) {
                $otherOpen = TrackingRecord::query()
                    ->openForIncident((int) $locked->incident_id)
                    ->where('id', '!=', $locked->id)
                    ->lockForUpdate()
                    ->first();

                if ($otherOpen) {
                    throw ValidationException::withMessages([
                        'tracking' => [
                            "Ya existe un Tracking abierto (#{$otherOpen->incident_number}) para la misma incidencia PRTG.",
                        ],
                    ]);
                }
            }

            $note = isset($payload['note']) ? trim((string) $payload['note']) : '';
            $note = $note !== '' ? $note : null;
            $now = now();

            $before = [
                'status' => TrackingStatus::Closed->value,
                'closed_at' => $locked->closed_at?->toIso8601String(),
                'closed_by_user_id' => $locked->closed_by_user_id,
                'closing_note' => $locked->closing_note,
                'lock_version' => (int) $locked->lock_version,
                'report_ticket' => $locked->report_ticket,
            ];

            $locked->status = TrackingStatus::InProgress;
            $locked->closed_at = null;
            $locked->closed_at_precision = null;
            $locked->closed_by_user_id = null;
            $locked->closed_by_legacy_name = null;
            // Conservar closing_note histórico en actividad vía update; limpiar campo cabecera.
            $previousNote = $locked->closing_note;
            $locked->closing_note = null;
            if ($locked->case_code) {
                $openTicket = $this->tickets->reportTicketOpen((string) $locked->case_code);
                $locked->report_ticket = $openTicket;
                $locked->ticket = $openTicket;
            }
            $locked->bumpLockVersion();
            $locked->save();

            $body = 'Tracking reabierto.';
            if ($previousNote) {
                $body .= ' Cierre anterior: '.$previousNote;
            }
            if ($note) {
                $body .= ' Motivo: '.$note;
            }

            TrackingUpdate::query()->create([
                'tracking_record_id' => $locked->id,
                'event_type' => TrackingEventType::SystemEvent,
                'body' => $body,
                'created_by_user_id' => $userId,
                'legacy_actor_name' => null,
                'occurred_on' => $now->toDateString(),
                'occurred_at' => $now,
            ]);

            $this->audit->record(
                $locked,
                'REOPEN_TRACKING',
                $before,
                [
                    'status' => TrackingStatus::InProgress->value,
                    'reopened_by_user_id' => $userId,
                    'note' => $note,
                    'lock_version' => (int) $locked->lock_version,
                ],
                AuditModule::TrackingGeneral,
                AuditSource::Api,
                $userId
            );

            return $this->detail->show($locked->fresh() ?? $locked);
        });
    }

    /**
     * Confirma recuperación técnica vista por el operador (no cierra).
     *
     * @param  array{lock_version: int, note?: string|null}  $payload
     * @return array<string, mixed>
     */
    public function acknowledgeRecovery(TrackingRecord $tracking, array $payload, int $userId): array
    {
        return DB::transaction(function () use ($tracking, $payload, $userId) {
            /** @var TrackingRecord $locked */
            $locked = TrackingRecord::query()->whereKey($tracking->id)->lockForUpdate()->firstOrFail();

            $this->assertLockVersion($locked, (int) $payload['lock_version']);

            if ($locked->isClosed()) {
                throw new TrackingLifecycleConflict(
                    'ALREADY_CLOSED',
                    $this->alreadyClosedMessage($locked),
                    $locked
                );
            }

            if ($locked->status !== TrackingStatus::TechnicallyRecovered) {
                throw ValidationException::withMessages([
                    'tracking' => ['Solo aplica cuando el Tracking está en recuperación técnica (PRTG).'],
                ]);
            }

            $note = isset($payload['note']) ? trim((string) $payload['note']) : '';
            $now = now();
            $body = 'Operador confirmó la recuperación técnica PRTG.';
            if ($note !== '') {
                $body .= ' '.$note;
            }

            TrackingUpdate::query()->create([
                'tracking_record_id' => $locked->id,
                'event_type' => TrackingEventType::Comment,
                'body' => $body,
                'created_by_user_id' => $userId,
                'legacy_actor_name' => null,
                'occurred_on' => $now->toDateString(),
                'occurred_at' => $now,
            ]);

            $locked->bumpLockVersion();
            $locked->save();

            $this->audit->record(
                $locked,
                'ACKNOWLEDGE_TRACKING_RECOVERY',
                null,
                [
                    'status' => TrackingStatus::TechnicallyRecovered->value,
                    'note' => $note !== '' ? $note : null,
                    'lock_version' => (int) $locked->lock_version,
                ],
                AuditModule::TrackingGeneral,
                AuditSource::Api,
                $userId
            );

            return $this->detail->show($locked->fresh() ?? $locked);
        });
    }

    private function assertLockVersion(TrackingRecord $locked, int $expected): void
    {
        if ((int) $locked->lock_version !== $expected) {
            throw new TrackingLifecycleConflict(
                'STALE_VERSION',
                'El Tracking fue modificado por otro usuario. Recarga e inténtalo de nuevo.',
                $locked
            );
        }
    }

    private function alreadyClosedMessage(TrackingRecord $locked): string
    {
        $who = $locked->closedByDisplayName() ?? 'otro operador';
        $when = \App\Support\OperationalTime::format($locked->closed_at, 'H:i') ?? '—';

        return "Este Tracking ya fue cerrado por {$who} a las {$when}.";
    }
}
