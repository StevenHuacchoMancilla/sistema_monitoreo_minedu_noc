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

    public const ACTION_ADD_NOTE = 'ADD_NOTE';

    /**
     * @return list<string>
     */
    public static function actions(): array
    {
        return [
            self::ACTION_ACKNOWLEDGE,
            self::ACTION_CONTINUE_MONITORING,
            self::ACTION_ADD_NOTE,
        ];
    }

    public function __construct(
        private readonly AuditLogger $audit,
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

        return DB::transaction(function () use ($incident, $action, $observation, $payload) {
            $beforeStatus = $incident->recovery_review_status instanceof RecoveryReviewStatus
                ? $incident->recovery_review_status->value
                : $incident->recovery_review_status;
            $before = [
                'recovery_review_status' => $beforeStatus,
                'recovered_while_managing' => (bool) $incident->recovered_while_managing,
            ];

            $userId = $payload['created_by'] ?? null;

            $title = match ($action) {
                self::ACTION_ACKNOWLEDGE => 'Operador confirmó la recuperación técnica.',
                self::ACTION_CONTINUE_MONITORING => 'Seguir en reporte: internet puede ser intermitente; se mantiene la gestión y el historial hasta cerrar Tracking.',
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
                    'reopened_from_management' => $action === self::ACTION_ACKNOWLEDGE
                        ? false
                        : $incident->reopened_from_management,
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
                ],
                AuditModule::Incidents,
                AuditSource::Api
            );

            return $fresh;
        });
    }
}
