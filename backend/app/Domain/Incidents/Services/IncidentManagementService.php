<?php

namespace App\Domain\Incidents\Services;

use App\Domain\Incidents\Support\RootCauseLegend;
use App\Domain\Ticketera\Services\ServiceTicketService;
use App\Domain\Tracking\Services\TrackingFromManagementService;
use App\Enums\AuditModule;
use App\Enums\AuditSource;
use App\Enums\FollowupStatus;
use App\Enums\ManagementClassification;
use App\Enums\ManagementScope;
use App\Enums\MineduReason;
use App\Enums\RecoveryReviewStatus;
use App\Models\Incident;
use App\Models\IncidentManagement;
use App\Models\IncidentUpdate;
use App\Models\SchoolContact;
use App\Models\User;
use App\Services\AuditLogger;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;

class IncidentManagementService
{
    public function __construct(
        private readonly AuditLogger $audit,
        private readonly TrackingFromManagementService $trackingFromManagement,
        private readonly ServiceTicketService $serviceTickets,
    ) {}

    /**
     * Registra una gestión operativa, actualiza la incidencia y sincroniza Tracking General.
     *
     * @param  array{
     *   classification: string,
     *   scope?: ?string,
     *   outage_text?: ?string,
     *   detail?: ?string,
     *   observation?: ?string,
     *   contact_id?: ?int,
     *   contact_via_descartes?: bool,
     *   contact_attempted_at?: ?string,
     *   created_by?: ?int,
     *   root_cause_group_code?: ?string,
     *   root_cause_code?: ?string,
     *   cause?: ?string
     * }  $payload
     * @return array{
     *   management: IncidentManagement,
     *   tracking: array{
     *     created: bool,
     *     tracking_id: int,
     *     ticket_code: ?string,
     *     status: string,
     *     incident_number: ?int
     *   }|null
     * }
     */
    public function apply(Incident $incident, array $payload): array
    {
        $classification = ManagementClassification::from((string) $payload['classification']);
        if ($classification === ManagementClassification::Unclassified) {
            throw new InvalidArgumentException('UNCLASSIFIED no es una clasificación operable.');
        }

        $userId = isset($payload['created_by']) ? (int) $payload['created_by'] : 0;
        if ($userId < 1) {
            throw new InvalidArgumentException('Se requiere un usuario autenticado para registrar la gestión.');
        }

        $scope = null;
        if (! empty($payload['scope'])) {
            $scope = ManagementScope::from((string) $payload['scope']);
        }

        $viaDescartes = (bool) ($payload['contact_via_descartes'] ?? false);
        $contact = null;
        if (! $viaDescartes && ! empty($payload['contact_id'])) {
            $contact = SchoolContact::query()
                ->where('school_id', $incident->school_id)
                ->whereKey((int) $payload['contact_id'])
                ->first();
            if ($contact === null) {
                throw new InvalidArgumentException('El contacto no pertenece al colegio de la incidencia.');
            }
        }

        $rootCause = null;
        $groupCode = trim((string) ($payload['root_cause_group_code'] ?? ''));
        $causeCode = trim((string) ($payload['root_cause_code'] ?? ''));
        if ($groupCode !== '' || $causeCode !== '') {
            $rootCause = RootCauseLegend::requirePair($groupCode, $causeCode);
            if (in_array($rootCause['attention'] ?? null, ['PEXT', 'PINT'], true)) {
                $scope = ManagementScope::from((string) $rootCause['attention']);
            }
        }

        $minedu = array_key_exists('minedu_reason', $payload)
            ? (($payload['minedu_reason'] ?? '') !== '' && $payload['minedu_reason'] !== null
                ? MineduReason::from((string) $payload['minedu_reason'])
                : null)
            : null;
        $mineduProvided = array_key_exists('minedu_reason', $payload);

        return DB::transaction(function () use ($incident, $payload, $classification, $scope, $contact, $viaDescartes, $userId, $rootCause, $minedu, $mineduProvided) {
            $before = [
                'management_classification' => $incident->management_classification?->value,
                'management_scope' => $incident->management_scope?->value,
                'outage_text' => $incident->outage_text,
                'detail_text' => $incident->detail_text,
                'followup_status' => $incident->followup_status?->value,
            ];

            $management = IncidentManagement::query()->create([
                'incident_id' => $incident->id,
                'classification' => $classification,
                'scope' => $scope,
                'outage_text' => $payload['outage_text'] ?? null,
                'detail' => $payload['detail'] ?? null,
                'observation' => $payload['observation'] ?? null,
                'contact_id' => $contact?->id,
                'contact_name_snapshot' => $viaDescartes
                    ? 'Según descartes realizados'
                    : $contact?->name,
                'contact_phone_snapshot' => $viaDescartes ? null : $contact?->phone,
                'contact_role_snapshot' => $viaDescartes ? 'DESCARTES' : $contact?->role,
                'contact_attempted_at' => $payload['contact_attempted_at'] ?? now(),
                'created_by' => $userId,
            ]);

            // Toda gestión operativa sale de "Pendiente contacto".
            // "En espera" (sin respuesta) entra al grupo En gestión, no se queda pegado.
            $followup = match ($classification) {
                ManagementClassification::NewOutage => FollowupStatus::PendienteContacto,
                ManagementClassification::NoResponse => FollowupStatus::EnEspera,
                ManagementClassification::LinkOutage => FollowupStatus::EnEspera,
                ManagementClassification::ContactConfirmed,
                ManagementClassification::Complaint,
                ManagementClassification::FollowUp => FollowupStatus::EnGestion,
                ManagementClassification::Unclassified => FollowupStatus::EnGestion,
            };

            // No degradar técnico en campo / escalado al registrar seguimiento.
            // Pendiente de cierre:
            // - Comentario / causa sin resultado MINEDU → se queda («Gestión lista»).
            // - Caída de enlace / Queja / Requerimiento → sale solo a Incidencias o Requerimientos
            //   (sticky: re-cae sin ticket nuevo), sin pulsar «Mantener en gestión».
            $current = $incident->followup_status;
            $leavingPendienteViaMinedu = $current === FollowupStatus::PendienteCierre
                && $mineduProvided
                && $minedu instanceof MineduReason
                && ($minedu->marksAsIncident() || $minedu->marksAsRequirement());

            if ($leavingPendienteViaMinedu) {
                $followup = FollowupStatus::EnGestion;
            } elseif (
                $current === FollowupStatus::TecnicoEnCampo
                || $current === FollowupStatus::Escalado
                || $current === FollowupStatus::PendienteCierre
            ) {
                if (in_array($followup, [
                    FollowupStatus::PendienteContacto,
                    FollowupStatus::EnEspera,
                    FollowupStatus::EnGestion,
                ], true)) {
                    $followup = $current;
                }
            }

            $fill = [
                'management_classification' => $classification,
                'management_scope' => $scope,
                'outage_text' => $payload['outage_text'] ?? $incident->outage_text,
                'detail_text' => $payload['detail'] ?? $incident->detail_text,
                'last_managed_contact_id' => $contact?->id ?? $incident->last_managed_contact_id,
                'followup_status' => $followup,
                'last_contact_at' => now(),
                'root_cause_group_code' => $rootCause !== null ? $rootCause['group_code'] : $incident->root_cause_group_code,
                'root_cause_code' => $rootCause !== null ? $rootCause['code'] : $incident->root_cause_code,
                'cause' => $rootCause !== null ? $rootCause['cause'] : ($payload['cause'] ?? $incident->cause),
                'minedu_reason' => $mineduProvided ? $minedu : $incident->minedu_reason,
            ];

            if ($leavingPendienteViaMinedu) {
                $fill['recovery_review_status'] = RecoveryReviewStatus::ContinueMonitoring;
                $fill['recovery_reviewed_at'] = now();
                $fill['reopened_from_management'] = true;
            }

            $incident->fill($fill)->save();

            // Resultado MINEDU → cola sticky (Incidencias / Requerimientos).
            $queueNote = '';
            if ($mineduProvided) {
                $queueNote = $this->syncStickyQueues($incident, $minedu, $userId);
            }

            IncidentUpdate::query()->create([
                'incident_id' => $incident->id,
                'type' => 'MANAGEMENT',
                'status_before' => $before['followup_status'],
                'status_after' => $followup->value,
                'observation' => sprintf(
                    'Gestión %s%s%s%s',
                    $classification->label(),
                    $scope ? ' · '.$scope->value : '',
                    ! empty($payload['detail']) ? ' · '.$payload['detail'] : '',
                    $queueNote !== '' ? ' · '.$queueNote : ''
                ),
                'user_id' => $userId,
                'created_at' => now(),
            ]);

            $trackingSync = null;
            if ($incident->school_id) {
                $trackingSync = $this->trackingFromManagement->syncFromManagement($incident, $userId, [
                    'classification' => $classification->value,
                    'scope' => $scope?->value,
                    'detail' => $payload['detail'] ?? null,
                    'observation' => $payload['observation'] ?? null,
                ]);
            }

            $actorName = $userId > 0 ? User::query()->find($userId)?->name : null;
            $fresh = $incident->fresh() ?? $incident;
            $this->serviceTickets->syncFromIncident($fresh, is_string($actorName) ? $actorName : null);
            if (\App\Models\ServiceTicket::isMaintenanceCause($fresh->root_cause_code)) {
                $this->serviceTickets->markMaintenance($fresh);
            }

            $this->audit->record(
                $incident,
                'MANAGEMENT_APPLIED',
                $before,
                [
                    'management_classification' => $classification->value,
                    'management_scope' => $scope?->value,
                    'outage_text' => $incident->outage_text,
                    'detail_text' => $incident->detail_text,
                    'followup_status' => $followup->value,
                    'management_id' => $management->id,
                    'tracking_id' => $trackingSync['tracking_id'] ?? null,
                    'tracking_created' => $trackingSync['created'] ?? false,
                ],
                AuditModule::Incidents,
                AuditSource::Api,
                $userId
            );

            return [
                'management' => $management->fresh() ?? $management,
                'tracking' => $trackingSync,
            ];
        });
    }

    /**
     * Abre/cierra las colas sticky según el resultado MINEDU.
     * Cambiar de tipo (p. ej. Requerimiento → Caída de enlace) mueve el caso de cola.
     */
    private function syncStickyQueues(Incident $incident, ?MineduReason $minedu, int $userId): string
    {
        $notes = [];

        if ($minedu instanceof MineduReason && $minedu->marksAsIncident()) {
            if ($incident->isOpenRequirement()) {
                $incident->forceFill(['requirement_closed_at' => now()])->save();
                $notes[] = 'Salió de Requerimientos';
            }
            if (! $incident->isOpenGrave()) {
                $incident->forceFill([
                    'is_grave_incident' => true,
                    'grave_opened_at' => $incident->grave_opened_at ?? now(),
                    'grave_opened_by_user_id' => $incident->grave_opened_by_user_id ?? ($userId > 0 ? $userId : null),
                    'grave_closed_at' => null,
                ])->save();
                $notes[] = 'Pasó a Incidencias ('.$minedu->label().')';
                app(\App\Domain\Reports\Services\ListaLleeDayService::class)
                    ->markAverias($incident->fresh() ?? $incident);
            }

            return implode('. ', $notes);
        }

        if ($minedu instanceof MineduReason && $minedu->marksAsRequirement()) {
            if ($incident->isOpenGrave()) {
                $incident->forceFill(['grave_closed_at' => now()])->save();
                $notes[] = 'Salió de Incidencias';
            }
            if (! $incident->isOpenRequirement()) {
                $incident->forceFill([
                    'is_requirement_case' => true,
                    'requirement_opened_at' => $incident->requirement_opened_at ?? now(),
                    'requirement_opened_by_user_id' => $incident->requirement_opened_by_user_id ?? ($userId > 0 ? $userId : null),
                    'requirement_closed_at' => null,
                ])->save();
                $notes[] = 'Pasó a Requerimientos';
            }

            return implode('. ', $notes);
        }

        // Quitar resultado: cierra membresía sticky sin cerrar el ticket.
        if ($incident->isOpenGrave()) {
            $incident->forceFill(['grave_closed_at' => now()])->save();
            $notes[] = 'Salió de Incidencias';
        }
        if ($incident->isOpenRequirement()) {
            $incident->forceFill(['requirement_closed_at' => now()])->save();
            $notes[] = 'Salió de Requerimientos';
        }

        return implode('. ', $notes);
    }
}
