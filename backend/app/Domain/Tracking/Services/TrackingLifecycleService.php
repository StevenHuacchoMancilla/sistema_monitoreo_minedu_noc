<?php

namespace App\Domain\Tracking\Services;

use App\Domain\Tracking\Exceptions\TrackingLifecycleConflict;
use App\Enums\AuditModule;
use App\Enums\AuditSource;
use App\Enums\DatePrecision;
use App\Enums\TrackingEventType;
use App\Enums\TrackingStatus;
use App\Models\TrackingRecord;
use App\Models\TrackingUpdate;
use App\Services\AuditLogger;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class TrackingLifecycleService
{
    public function __construct(
        private readonly AuditLogger $audit,
        private readonly TrackingDetailService $detail,
    ) {}

    /**
     * @param  array{lock_version: int, closing_note?: string|null}  $payload
     * @return array<string, mixed>
     */
    public function close(TrackingRecord $tracking, array $payload, int $userId): array
    {
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

            $before = [
                'status' => $locked->status instanceof TrackingStatus
                    ? $locked->status->value
                    : (string) $locked->status,
                'closed_at' => $locked->closed_at?->toIso8601String(),
                'closed_by_user_id' => $locked->closed_by_user_id,
                'lock_version' => (int) $locked->lock_version,
            ];

            $locked->status = TrackingStatus::Closed;
            $locked->closed_at = $now;
            $locked->closed_at_precision = DatePrecision::DateTime;
            $locked->closed_by_user_id = $userId;
            $locked->closed_by_legacy_name = null;
            $locked->closing_note = $note;
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

            $this->audit->record(
                $locked,
                'CLOSE_TRACKING',
                $before,
                [
                    'status' => TrackingStatus::Closed->value,
                    'closed_at' => $now->toIso8601String(),
                    'closed_by_user_id' => $userId,
                    'closing_note' => $note,
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
            ];

            $locked->status = TrackingStatus::InProgress;
            $locked->closed_at = null;
            $locked->closed_at_precision = null;
            $locked->closed_by_user_id = null;
            $locked->closed_by_legacy_name = null;
            // Conservar closing_note histórico en actividad vía update; limpiar campo cabecera.
            $previousNote = $locked->closing_note;
            $locked->closing_note = null;
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
        $when = $locked->closed_at?->timezone(config('app.timezone'))->format('H:i') ?? '—';

        return "Este Tracking ya fue cerrado por {$who} a las {$when}.";
    }
}
