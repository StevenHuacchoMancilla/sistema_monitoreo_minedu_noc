<?php

namespace App\Domain\Incidents\Services;

use App\Enums\AuditModule;
use App\Enums\AuditSource;
use App\Enums\FieldDispatchStatus;
use App\Enums\FollowupStatus;
use App\Models\FieldDispatch;
use App\Models\Incident;
use App\Models\IncidentUpdate;
use App\Services\AuditLogger;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;

class FieldDispatchService
{
    public const ACTION_PLAN = 'PLAN';

    public const ACTION_DISPATCH = 'DISPATCH';

    public const ACTION_ARRIVE = 'ARRIVE';

    public const ACTION_CANCEL = 'CANCEL';

    public const ACTION_COMPLETE = 'COMPLETE';

    /**
     * @return list<string>
     */
    public static function actions(): array
    {
        return [
            self::ACTION_PLAN,
            self::ACTION_DISPATCH,
            self::ACTION_ARRIVE,
            self::ACTION_CANCEL,
            self::ACTION_COMPLETE,
        ];
    }

    public function __construct(private readonly AuditLogger $audit) {}

    public function activeFor(Incident $incident): ?FieldDispatch
    {
        return FieldDispatch::query()
            ->where('incident_id', $incident->id)
            ->active()
            ->orderByDesc('id')
            ->first();
    }

    public function hasActive(Incident $incident): bool
    {
        return FieldDispatch::query()
            ->where('incident_id', $incident->id)
            ->active()
            ->exists();
    }

    /**
     * @param  array{action: string, technician_name?: ?string, observation?: ?string, created_by?: ?int}  $payload
     */
    public function apply(Incident $incident, array $payload): FieldDispatch
    {
        $action = strtoupper((string) $payload['action']);
        if (! in_array($action, self::actions(), true)) {
            throw new InvalidArgumentException('Acción de desplazamiento inválida.');
        }

        $observation = trim((string) ($payload['observation'] ?? ''));
        $technician = trim((string) ($payload['technician_name'] ?? ''));
        $userId = $payload['created_by'] ?? null;

        if ($action === self::ACTION_CANCEL && $observation === '') {
            throw new InvalidArgumentException('Indica el motivo de cancelación del desplazamiento.');
        }

        return DB::transaction(function () use ($incident, $action, $observation, $technician, $userId) {
            return match ($action) {
                self::ACTION_PLAN => $this->plan($incident, $technician, $observation, $userId),
                self::ACTION_DISPATCH => $this->transition(
                    $incident,
                    FieldDispatchStatus::Dispatched,
                    [FieldDispatchStatus::Planned],
                    'dispatched_at',
                    'Personal despachado a campo.',
                    $technician,
                    $observation,
                    $userId,
                ),
                self::ACTION_ARRIVE => $this->transition(
                    $incident,
                    FieldDispatchStatus::OnSite,
                    [FieldDispatchStatus::Planned, FieldDispatchStatus::Dispatched],
                    'on_site_at',
                    'Personal reportó llegada a sitio.',
                    $technician,
                    $observation,
                    $userId,
                ),
                self::ACTION_CANCEL => $this->cancel($incident, $observation, $userId),
                self::ACTION_COMPLETE => $this->transition(
                    $incident,
                    FieldDispatchStatus::Completed,
                    FieldDispatchStatus::activeValues(),
                    'completed_at',
                    'Desplazamiento completado.',
                    $technician,
                    $observation,
                    $userId,
                    syncFollowup: false,
                ),
                default => throw new InvalidArgumentException('Acción de desplazamiento inválida.'),
            };
        });
    }

    /**
     * Garantiza un desplazamiento activo (PLANNED) al marcar TECNICO_EN_CAMPO.
     */
    public function ensurePlanned(Incident $incident, ?int $userId = null, ?string $observation = null): FieldDispatch
    {
        $active = $this->activeFor($incident);
        if ($active) {
            return $active;
        }

        return $this->plan(
            $incident,
            null,
            $observation ?? 'Desplazamiento planificado (técnico en campo).',
            $userId,
        );
    }

    public function cancelActive(Incident $incident, string $reason, ?int $userId = null): ?FieldDispatch
    {
        if (! $this->hasActive($incident)) {
            return null;
        }

        return $this->cancel($incident, $reason !== '' ? $reason : 'Cancelado por decisión operativa.', $userId);
    }

    public function ensureOnSite(Incident $incident, ?int $userId = null, ?string $observation = null): ?FieldDispatch
    {
        $active = $this->activeFor($incident);
        if (! $active) {
            return $this->plan(
                $incident,
                null,
                $observation ?? 'Continuar atención en sitio.',
                $userId,
                FieldDispatchStatus::OnSite,
            );
        }

        if ($active->status === FieldDispatchStatus::OnSite) {
            return $active;
        }

        return $this->transition(
            $incident,
            FieldDispatchStatus::OnSite,
            [FieldDispatchStatus::Planned, FieldDispatchStatus::Dispatched],
            'on_site_at',
            $observation ?? 'Operador mantiene atención en sitio.',
            null,
            $observation,
            $userId,
        );
    }

    private function plan(
        Incident $incident,
        ?string $technician,
        string $observation,
        ?int $userId,
        FieldDispatchStatus $status = FieldDispatchStatus::Planned,
    ): FieldDispatch {
        if ($this->hasActive($incident)) {
            throw new InvalidArgumentException('Ya existe un desplazamiento activo para esta incidencia.');
        }

        $now = now();
        $dispatch = FieldDispatch::query()->create([
            'incident_id' => $incident->id,
            'status' => $status->value,
            'technician_name' => $technician !== '' ? $technician : null,
            'notes' => $observation !== '' ? $observation : null,
            'planned_at' => $now,
            'dispatched_at' => $status === FieldDispatchStatus::Dispatched ? $now : null,
            'on_site_at' => $status === FieldDispatchStatus::OnSite ? $now : null,
            'created_by' => $userId,
            'updated_by' => $userId,
        ]);

        $this->syncFollowupToField($incident, $userId);
        $this->writeUpdate(
            $incident,
            null,
            $status->value,
            '[FIELD_DISPATCH:PLAN] Desplazamiento '.$status->label().'.'.($observation !== '' ? ' '.$observation : ''),
            $userId,
        );
        $this->audit->record(
            $incident,
            'FIELD_DISPATCH_PLAN',
            null,
            $dispatch->toApiArray(),
            AuditModule::Incidents,
            AuditSource::Api
        );

        return $dispatch->fresh() ?? $dispatch;
    }

    /**
     * @param  list<string>|list<FieldDispatchStatus>  $allowedFrom
     */
    private function transition(
        Incident $incident,
        FieldDispatchStatus $to,
        array $allowedFrom,
        string $timestampField,
        string $title,
        ?string $technician,
        ?string $observation,
        ?int $userId,
        bool $syncFollowup = true,
    ): FieldDispatch {
        $dispatch = $this->activeFor($incident);
        if (! $dispatch) {
            throw new InvalidArgumentException('No hay desplazamiento activo.');
        }

        $allowed = array_map(
            fn ($s) => $s instanceof FieldDispatchStatus ? $s->value : (string) $s,
            $allowedFrom,
        );
        $from = $dispatch->status instanceof FieldDispatchStatus
            ? $dispatch->status->value
            : (string) $dispatch->status;

        if (! in_array($from, $allowed, true)) {
            throw new InvalidArgumentException("No se puede pasar de {$from} a {$to->value}.");
        }

        $before = $dispatch->toApiArray();
        $payload = [
            'status' => $to->value,
            'updated_by' => $userId,
            $timestampField => now(),
        ];
        if ($technician) {
            $payload['technician_name'] = $technician;
        }
        if ($observation) {
            $payload['notes'] = trim(($dispatch->notes ? $dispatch->notes."\n" : '').$observation);
        }

        $dispatch->fill($payload)->save();

        if ($syncFollowup && $to->isActive()) {
            $this->syncFollowupToField($incident, $userId);
        }

        $detail = $title.($observation ? ' '.$observation : '');
        $this->writeUpdate(
            $incident,
            $from,
            $to->value,
            '[FIELD_DISPATCH:'.$to->value.'] '.$detail,
            $userId,
        );
        $this->audit->record($incident, 'FIELD_DISPATCH_'.$to->value, $before, $dispatch->fresh()?->toApiArray(), AuditModule::Incidents, AuditSource::Api);

        return $dispatch->fresh() ?? $dispatch;
    }

    private function cancel(Incident $incident, string $reason, ?int $userId): FieldDispatch
    {
        $dispatch = $this->activeFor($incident);
        if (! $dispatch) {
            throw new InvalidArgumentException('No hay desplazamiento activo para cancelar.');
        }

        $before = $dispatch->toApiArray();
        $from = $dispatch->status instanceof FieldDispatchStatus
            ? $dispatch->status->value
            : (string) $dispatch->status;

        $dispatch->fill([
            'status' => FieldDispatchStatus::Cancelled->value,
            'cancellation_reason' => $reason,
            'cancelled_at' => now(),
            'updated_by' => $userId,
        ])->save();

        if ($incident->followup_status === FollowupStatus::TecnicoEnCampo
            && $incident->recovered_at === null) {
            $incident->fill([
                'followup_status' => FollowupStatus::EnGestion,
            ])->save();
        }

        $this->writeUpdate(
            $incident,
            $from,
            FieldDispatchStatus::Cancelled->value,
            '[FIELD_DISPATCH:CANCEL] Desplazamiento cancelado. '.$reason,
            $userId,
        );
        $this->audit->record($incident, 'FIELD_DISPATCH_CANCEL', $before, $dispatch->fresh()?->toApiArray(), AuditModule::Incidents, AuditSource::Api);

        return $dispatch->fresh() ?? $dispatch;
    }

    private function syncFollowupToField(Incident $incident, ?int $userId): void
    {
        if ($incident->recovered_at !== null) {
            return;
        }

        if ($incident->followup_status === FollowupStatus::TecnicoEnCampo) {
            return;
        }

        $before = $incident->followup_status?->value;
        $incident->fill([
            'followup_status' => FollowupStatus::TecnicoEnCampo,
            'last_contact_at' => now(),
        ])->save();

        $this->writeUpdate(
            $incident,
            $before,
            FollowupStatus::TecnicoEnCampo->value,
            'Seguimiento actualizado a Técnico en campo por desplazamiento.',
            $userId,
        );
    }

    private function writeUpdate(
        Incident $incident,
        ?string $before,
        ?string $after,
        string $observation,
        ?int $userId,
    ): void {
        IncidentUpdate::query()->create([
            'incident_id' => $incident->id,
            'type' => 'FIELD_DISPATCH',
            'status_before' => $before,
            'status_after' => $after,
            'observation' => $observation,
            'user_id' => $userId,
            'created_at' => now(),
        ]);
    }
}
