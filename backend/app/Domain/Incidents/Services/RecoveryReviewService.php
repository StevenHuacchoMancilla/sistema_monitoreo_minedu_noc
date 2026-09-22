<?php

namespace App\Domain\Incidents\Services;

use App\Enums\AuditModule;
use App\Enums\AuditSource;
use App\Enums\RecoveryReviewStatus;
use App\Models\Incident;
use App\Models\IncidentUpdate;
use App\Services\AuditLogger;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;

class RecoveryReviewService
{
    public const ACTION_ACKNOWLEDGE = 'ACKNOWLEDGE';

    public const ACTION_CONTINUE_MONITORING = 'CONTINUE_MONITORING';

    public const ACTION_CONTINUE_ONSITE = 'CONTINUE_ONSITE';

    public const ACTION_CANCEL_DISPATCH = 'CANCEL_DISPATCH';

    public const ACTION_ADD_NOTE = 'ADD_NOTE';

    /**
     * @return list<string>
     */
    public static function actions(): array
    {
        return [
            self::ACTION_ACKNOWLEDGE,
            self::ACTION_CONTINUE_MONITORING,
            self::ACTION_CONTINUE_ONSITE,
            self::ACTION_CANCEL_DISPATCH,
            self::ACTION_ADD_NOTE,
        ];
    }

    public function __construct(
        private readonly AuditLogger $audit,
        private readonly FieldDispatchService $dispatches,
    ) {}

    /**
     * @param  array{action: string, observation?: ?string, created_by?: ?int}  $payload
     */
    public function apply(Incident $incident, array $payload): Incident
    {
        if ($incident->recovered_at === null) {
            throw new InvalidArgumentException('Solo se puede revisar una incidencia recuperada.');
        }

        $action = strtoupper((string) $payload['action']);
        if (! in_array($action, self::actions(), true)) {
            throw new InvalidArgumentException('Acción de revisión inválida.');
        }

        $observation = trim((string) ($payload['observation'] ?? ''));
        if ($action === self::ACTION_ADD_NOTE && $observation === '') {
            throw new InvalidArgumentException('La observación es obligatoria.');
        }
        if ($action === self::ACTION_CANCEL_DISPATCH && $observation === '') {
            throw new InvalidArgumentException('Indica el motivo de cancelación del desplazamiento.');
        }

        return DB::transaction(function () use ($incident, $action, $observation, $payload) {
            $beforeStatus = $incident->recovery_review_status instanceof RecoveryReviewStatus
                ? $incident->recovery_review_status->value
                : $incident->recovery_review_status;
            $before = [
                'recovery_review_status' => $beforeStatus,
                'recovered_while_managing' => (bool) $incident->recovered_while_managing,
                'had_active_dispatch' => $this->dispatches->hasActive($incident),
            ];

            $userId = $payload['created_by'] ?? null;

            if ($action === self::ACTION_CANCEL_DISPATCH) {
                $cancelled = $this->dispatches->cancelActive($incident, $observation, $userId);
                if ($cancelled === null) {
                    throw new InvalidArgumentException('No hay desplazamiento activo para cancelar.');
                }
            }

            if ($action === self::ACTION_CONTINUE_ONSITE) {
                $this->dispatches->ensureOnSite(
                    $incident,
                    $userId,
                    $observation !== '' ? $observation : 'Continuar atención en sitio.',
                );
            }

            $title = match ($action) {
                self::ACTION_ACKNOWLEDGE => 'Operador confirmó la recuperación técnica.',
                self::ACTION_CONTINUE_MONITORING => 'Operador mantiene seguimiento pese a recuperación PRTG.',
                self::ACTION_CONTINUE_ONSITE => 'Operador decide continuar atención en sitio.',
                self::ACTION_CANCEL_DISPATCH => 'Operador canceló el desplazamiento a campo.',
                self::ACTION_ADD_NOTE => 'Observación de revisión de recuperación.',
                default => 'Revisión de recuperación.',
            };

            if ($action !== self::ACTION_ADD_NOTE) {
                $nextStatus = match ($action) {
                    self::ACTION_ACKNOWLEDGE => RecoveryReviewStatus::Acknowledged->value,
                    default => RecoveryReviewStatus::ContinueMonitoring->value,
                };

                $incident->fill([
                    'recovery_review_status' => $nextStatus,
                    'recovery_reviewed_at' => now(),
                ])->save();
            }

            $detail = $observation !== '' ? $title.' '.$observation : $title;
            $freshStatus = $incident->fresh()?->recovery_review_status;
            $afterStatus = $freshStatus instanceof RecoveryReviewStatus
                ? $freshStatus->value
                : ($freshStatus ?? $beforeStatus);

            IncidentUpdate::query()->create([
                'incident_id' => $incident->id,
                'type' => 'RECOVERY_REVIEW',
                'status_before' => $beforeStatus,
                'status_after' => $afterStatus,
                'observation' => '['.$action.'] '.$detail,
                'user_id' => $userId,
                'created_at' => now(),
            ]);

            $fresh = $incident->fresh([
                'updates',
                'managements',
                'fieldDispatches',
                'school',
                'networkAssignment',
                'sensor',
            ]) ?? $incident;

            $this->audit->record(
                $fresh,
                'RECOVERY_REVIEW_'.$action,
                $before,
                [
                    'recovery_review_status' => $fresh->recovery_review_status,
                    'action' => $action,
                    'observation' => $observation !== '' ? $observation : null,
                    'had_active_dispatch' => $this->dispatches->hasActive($fresh),
                ],
                AuditModule::Incidents,
                AuditSource::Api
            );

            return $fresh;
        });
    }
}
