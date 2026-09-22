<?php

namespace App\Domain\Incidents\Services;

use App\Enums\FollowupStatus;
use App\Enums\ManagementClassification;
use App\Enums\ManagementScope;
use App\Models\Incident;
use App\Models\IncidentManagement;
use App\Models\IncidentUpdate;
use App\Models\SchoolContact;
use App\Services\AuditLogger;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;

class IncidentManagementService
{
    public function __construct(private readonly AuditLogger $audit) {}

    /**
     * Registra una gestión operativa y actualiza el estado actual de la incidencia.
     *
     * @param  array{
     *   classification: string,
     *   scope?: ?string,
     *   outage_text?: ?string,
     *   detail?: ?string,
     *   observation?: ?string,
     *   contact_id?: ?int,
     *   contact_attempted_at?: ?string,
     *   created_by?: ?int
     * }  $payload
     */
    public function apply(Incident $incident, array $payload): IncidentManagement
    {
        $classification = ManagementClassification::from((string) $payload['classification']);
        if ($classification === ManagementClassification::Unclassified) {
            throw new InvalidArgumentException('UNCLASSIFIED no es una clasificación operable.');
        }

        $scope = null;
        if (! empty($payload['scope'])) {
            $scope = ManagementScope::from((string) $payload['scope']);
        }

        $contact = null;
        if (! empty($payload['contact_id'])) {
            $contact = SchoolContact::query()
                ->where('school_id', $incident->school_id)
                ->whereKey((int) $payload['contact_id'])
                ->first();
            if ($contact === null) {
                throw new InvalidArgumentException('El contacto no pertenece al colegio de la incidencia.');
            }
        }

        return DB::transaction(function () use ($incident, $payload, $classification, $scope, $contact) {
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
                'contact_name_snapshot' => $contact?->name,
                'contact_phone_snapshot' => $contact?->phone,
                'contact_role_snapshot' => $contact?->role,
                'contact_attempted_at' => $payload['contact_attempted_at'] ?? now(),
                'created_by' => $payload['created_by'] ?? null,
            ]);

            $followup = match ($classification) {
                ManagementClassification::NewOutage,
                ManagementClassification::NoResponse => FollowupStatus::PendienteContacto,
                ManagementClassification::ContactConfirmed,
                ManagementClassification::Complaint => FollowupStatus::EnGestion,
                default => $incident->followup_status ?? FollowupStatus::PendienteContacto,
            };

            $incident->fill([
                'management_classification' => $classification,
                'management_scope' => $scope,
                'outage_text' => $payload['outage_text'] ?? $incident->outage_text,
                'detail_text' => $payload['detail'] ?? $incident->detail_text,
                'last_managed_contact_id' => $contact?->id ?? $incident->last_managed_contact_id,
                'followup_status' => $followup,
                'last_contact_at' => now(),
            ])->save();

            IncidentUpdate::query()->create([
                'incident_id' => $incident->id,
                'type' => 'MANAGEMENT',
                'status_before' => $before['followup_status'],
                'status_after' => $followup->value,
                'observation' => sprintf(
                    'Gestión %s%s%s',
                    $classification->label(),
                    $scope ? ' · '.$scope->value : '',
                    ! empty($payload['detail']) ? ' · '.$payload['detail'] : ''
                ),
                'user_id' => $payload['created_by'] ?? null,
                'created_at' => now(),
            ]);

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
                ],
                'API'
            );

            return $management->fresh();
        });
    }
}
