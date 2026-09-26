<?php

namespace App\Domain\Tracking\Services;

use App\Domain\Tracking\Support\TrackingCodigoNormalizer;
use App\Enums\AuditModule;
use App\Enums\AuditSource;
use App\Enums\MonitoringStatus;
use App\Enums\TrackingEventType;
use App\Enums\TrackingStatus;
use App\Enums\TrackingTechnicalStatus;
use App\Models\PrtgSensor;
use App\Models\TrackingRecord;
use App\Models\TrackingUpdate;
use App\Services\AuditLogger;
use App\Support\OperationalTime;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class TrackingDetailService
{
    public function __construct(private readonly AuditLogger $audit) {}

    /**
     * @return array<string, mixed>
     */
    public function show(TrackingRecord $tracking): array
    {
        $tracking->load([
            'school:id,local_educativo,codigo_local,current_sequence,provincia,distrito',
            'networkAssignment:id,cid,tecnologia_acceso,prtg_province,prtg_district,prtg_device_name',
            'incident:id,started_at,recovered_at,current_status,followup_status',
            'openedBy:id,name,email',
            'closedBy:id,name,email',
            'updates' => fn ($q) => $q->with('createdBy:id,name')->orderBy('id'),
        ]);

        $prtg = $this->resolvePrtgStatus($tracking);

        return [
            'data' => array_merge($tracking->toSummaryArray(), [
                'school' => $tracking->school ? [
                    'id' => $tracking->school->id,
                    'local_educativo' => $tracking->school->local_educativo,
                    'codigo_local' => $tracking->school->codigo_local,
                    'current_sequence' => $tracking->school->current_sequence,
                    'provincia' => $tracking->school->provincia,
                    'distrito' => $tracking->school->distrito,
                ] : null,
                'network_assignment' => $tracking->networkAssignment ? [
                    'id' => $tracking->networkAssignment->id,
                    'cid' => $tracking->networkAssignment->cid,
                    'tecnologia_acceso' => $tracking->networkAssignment->tecnologia_acceso,
                    'prtg_province' => $tracking->networkAssignment->prtg_province,
                    'prtg_district' => $tracking->networkAssignment->prtg_district,
                    'prtg_device_name' => $tracking->networkAssignment->prtg_device_name,
                ] : null,
                'incident' => $tracking->incident ? [
                    'id' => $tracking->incident->id,
                    'started_at' => $tracking->incident->started_at?->toIso8601String(),
                    'recovered_at' => $tracking->incident->recovered_at?->toIso8601String(),
                    'current_status' => $tracking->incident->current_status,
                    'followup_status' => $tracking->incident->followup_status?->value
                        ?? $tracking->incident->followup_status,
                ] : null,
                'prtg' => $prtg,
                'duration_seconds' => $this->durationSeconds($tracking),
                'opened_at_display' => $this->formatDisplay($tracking->opened_at, $tracking->opened_at_precision),
                'closed_at_display' => $this->formatDisplay($tracking->closed_at, $tracking->closed_at_precision),
                'can_add_update' => $tracking->isOpen(),
                'can_close' => $tracking->isOpen(),
                'can_reopen' => $tracking->isClosed(),
                'can_acknowledge_recovery' => $tracking->isOpen()
                    && $tracking->status === TrackingStatus::TechnicallyRecovered,
                'updates' => $tracking->updates->map(fn (TrackingUpdate $u) => $u->toApiArray())->values()->all(),
                'activity' => $this->buildActivity($tracking),
            ]),
        ];
    }

    /**
     * @param  array{body: string, event_type?: string|null}  $payload
     * @return array<string, mixed>
     */
    public function addUpdate(TrackingRecord $tracking, array $payload, int $userId): array
    {
        if ($tracking->isClosed()) {
            throw ValidationException::withMessages([
                'body' => ['Este Tracking está cerrado. Reábrelo antes de agregar seguimiento.'],
            ]);
        }

        $body = trim((string) ($payload['body'] ?? ''));
        if ($body === '') {
            throw ValidationException::withMessages([
                'body' => ['El seguimiento no puede estar vacío.'],
            ]);
        }

        $eventType = TrackingEventType::tryFrom(strtoupper((string) ($payload['event_type'] ?? 'COMMENT')))
            ?? TrackingEventType::Comment;

        $update = DB::transaction(function () use ($tracking, $body, $eventType, $userId) {
            $update = TrackingUpdate::query()->create([
                'tracking_record_id' => $tracking->id,
                'event_type' => $eventType,
                'body' => $body,
                'created_by_user_id' => $userId,
                'legacy_actor_name' => null,
                'occurred_on' => now()->toDateString(),
                'occurred_at' => now(),
            ]);

            $dirty = false;
            if ($tracking->status === TrackingStatus::Open) {
                $tracking->status = TrackingStatus::InProgress;
                $dirty = true;
            }

            if ($dirty) {
                $tracking->bumpLockVersion();
                $tracking->save();
            }

            $this->audit->record(
                $tracking,
                'ADD_TRACKING_UPDATE',
                null,
                [
                    'update_id' => $update->id,
                    'event_type' => $eventType->value,
                    'body' => $body,
                    'status' => $tracking->status instanceof TrackingStatus
                        ? $tracking->status->value
                        : (string) $tracking->status,
                ],
                AuditModule::TrackingGeneral,
                AuditSource::Api
            );

            return $update;
        });

        return $this->show($tracking->fresh() ?? $tracking);
    }

    /**
     * Elimina un seguimiento humano (no eventos de sistema / PRTG).
     *
     * @return array<string, mixed>
     */
    public function deleteUpdate(TrackingRecord $tracking, TrackingUpdate $update, int $userId): array
    {
        if ((int) $update->tracking_record_id !== (int) $tracking->id) {
            throw ValidationException::withMessages([
                'update' => ['El seguimiento no pertenece a este Tracking.'],
            ]);
        }

        $type = $update->event_type instanceof TrackingEventType
            ? $update->event_type
            : TrackingEventType::tryFrom((string) $update->event_type);

        if ($type?->isSystem()) {
            throw ValidationException::withMessages([
                'update' => ['No se pueden eliminar eventos de sistema o recuperación técnica.'],
            ]);
        }

        DB::transaction(function () use ($tracking, $update, $userId, $type) {
            $before = [
                'update_id' => $update->id,
                'event_type' => $type?->value,
                'body' => $update->body,
                'created_by_user_id' => $update->created_by_user_id,
            ];

            $update->delete();

            $this->audit->record(
                $tracking,
                'DELETE_TRACKING_UPDATE',
                $before,
                null,
                AuditModule::TrackingGeneral,
                AuditSource::Api,
                $userId
            );
        });

        return $this->show($tracking->fresh() ?? $tracking);
    }

    /**
     * Actualiza CODIGO (letras A–Z multi) y/o CAUSA (texto) del Tracking.
     *
     * @param  array{codigo?: list<string>|string|null, causa?: string|null, lock_version: int}  $payload
     * @return array<string, mixed>
     */
    public function updateCodigoCausa(TrackingRecord $tracking, array $payload, int $userId): array
    {
        $expectedLock = (int) ($payload['lock_version'] ?? 0);
        if ($expectedLock < 1 || $expectedLock !== (int) $tracking->lock_version) {
            throw ValidationException::withMessages([
                'lock_version' => ['El Tracking fue modificado por otro usuario. Recarga e intenta de nuevo.'],
            ]);
        }

        $codigo = array_key_exists('codigo', $payload)
            ? TrackingCodigoNormalizer::normalize($payload['codigo'])
            : $tracking->codigo;

        $causa = array_key_exists('causa', $payload)
            ? (trim((string) ($payload['causa'] ?? '')) ?: null)
            : $tracking->causa;

        if ($causa !== null && mb_strlen($causa) > 2000) {
            throw ValidationException::withMessages([
                'causa' => ['La causa no puede superar 2000 caracteres.'],
            ]);
        }

        DB::transaction(function () use ($tracking, $codigo, $causa, $userId): void {
            $before = [
                'codigo' => $tracking->codigo,
                'causa' => $tracking->causa,
            ];

            $tracking->codigo = $codigo;
            $tracking->causa = $causa;
            $tracking->bumpLockVersion();
            $tracking->save();

            $this->audit->record(
                $tracking,
                'UPDATE_TRACKING_CODIGO_CAUSA',
                $before,
                [
                    'codigo' => $codigo,
                    'causa' => $causa,
                    'by_user_id' => $userId,
                ],
                AuditModule::TrackingGeneral,
                AuditSource::Api
            );
        });

        return $this->show($tracking->fresh() ?? $tracking);
    }

    /**
     * @return array{normalized_status: ?string, status_label: ?string, last_synced_at: ?string, technical_status: ?string}
     */
    private function resolvePrtgStatus(TrackingRecord $tracking): array
    {
        $sensor = null;
        if ($tracking->network_assignment_id) {
            $sensor = PrtgSensor::query()
                ->where('network_assignment_id', $tracking->network_assignment_id)
                ->where('name', 'Ping')
                ->orderByDesc('last_synced_at')
                ->first();
        }

        $normalized = $sensor?->normalized_status;
        $value = $normalized instanceof MonitoringStatus
            ? $normalized->value
            : ($normalized !== null ? (string) $normalized : null);

        $technical = $tracking->technical_status instanceof TrackingTechnicalStatus
            ? $tracking->technical_status
            : TrackingTechnicalStatus::tryFrom((string) ($tracking->technical_status ?? ''));

        if ($value === MonitoringStatus::Caido->value) {
            $technical = TrackingTechnicalStatus::Down;
        } elseif ($value === MonitoringStatus::Operativo->value) {
            $technical = TrackingTechnicalStatus::Recovered;
        }

        return [
            'normalized_status' => $value,
            'status_label' => $value === MonitoringStatus::Caido->value
                ? 'PRTG caído'
                : ($value === MonitoringStatus::Operativo->value ? 'PRTG operativo' : ($technical?->label())),
            'last_synced_at' => $sensor?->last_synced_at?->toIso8601String(),
            'technical_status' => $technical?->value,
        ];
    }

    private function durationSeconds(TrackingRecord $tracking): ?int
    {
        if (! $tracking->opened_at) {
            return null;
        }

        $end = $tracking->closed_at ?? now();

        return max(0, (int) $tracking->opened_at->diffInSeconds($end));
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function buildActivity(TrackingRecord $tracking): array
    {
        $items = [];

        $items[] = [
            'kind' => 'OPENED',
            'at' => $tracking->opened_at?->toIso8601String(),
            'display' => $this->formatDisplay($tracking->opened_at, $tracking->opened_at_precision),
            'actor' => $tracking->openedByDisplayName(),
            'label' => 'Tracking aperturado',
            'body' => $tracking->description,
        ];

        foreach ($tracking->updates as $update) {
            $items[] = [
                'kind' => 'UPDATE',
                'at' => $update->occurred_at?->toIso8601String()
                    ?? ($update->occurred_on?->toDateString()),
                'display' => $update->occurred_at
                    ? $update->occurred_at->format('d/m/Y H:i')
                    : ($update->occurred_on?->format('d/m/Y')),
                'actor' => $update->actorDisplayName(),
                'label' => $update->event_type instanceof TrackingEventType
                    ? $update->event_type->label()
                    : 'Seguimiento',
                'body' => $update->body,
                'is_system' => $update->event_type instanceof TrackingEventType
                    ? $update->event_type->isSystem()
                    : false,
            ];
        }

        if ($tracking->isClosed()) {
            $items[] = [
                'kind' => 'CLOSED',
                'at' => $tracking->closed_at?->toIso8601String(),
                'display' => $this->formatDisplay($tracking->closed_at, $tracking->closed_at_precision),
                'actor' => $tracking->closedByDisplayName(),
                'label' => 'Tracking cerrado',
                'body' => $tracking->closing_note,
            ];
        }

        return $items;
    }

    private function formatDisplay(mixed $at, mixed $precision): ?string
    {
        if (! $at instanceof \Illuminate\Support\Carbon && ! $at instanceof \Carbon\Carbon) {
            return null;
        }

        $isDateOnly = $precision === 'DATE'
            || $precision === \App\Enums\DatePrecision::Date;

        return $isDateOnly
            ? OperationalTime::format($at, 'd/m/Y')
            : OperationalTime::format($at, 'd/m/Y H:i');
    }
}
