<?php

namespace App\Domain\Incidents\Services;

use App\Domain\Incidents\Support\IncidentCaseStatus;
use App\Domain\Incidents\Support\IncidentTimelineBuilder;
use App\Domain\Incidents\Support\OutageDuration;
use App\Domain\Monitoring\PRTG\Support\PrtgOperationalLocation;
use App\Enums\MonitoringStatus;
use App\Enums\RecoveryReviewStatus;
use App\Enums\TrackingEventType;
use App\Models\FieldDispatch;
use App\Models\Incident;
use App\Models\TrackingRecord;
use App\Models\TrackingUpdate;

/**
 * Expediente completo de una incidencia para lectura/reporte (solo lectura).
 * Carga todo en un número fijo de consultas (sin N+1), independiente del volumen de eventos.
 */
class IncidentCaseFileService
{
    private const USER_COLUMNS = 'id,name';

    /**
     * @return array<string, mixed>
     */
    public function build(Incident $incident): array
    {
        $incident->load([
            'school',
            'networkAssignment',
            'sensor:id,prtg_sensor_id,network_assignment_id,name,device_name,normalized_status,status_text,last_check',
            'managements.author:'.self::USER_COLUMNS,
            'updates.user:'.self::USER_COLUMNS,
            'fieldDispatches' => fn ($q) => $q->orderByDesc('id'),
            'fieldDispatches.creator:'.self::USER_COLUMNS,
            'trackingRecords' => fn ($q) => $q->orderByDesc('id'),
            'trackingRecords.openedBy:'.self::USER_COLUMNS,
            'trackingRecords.closedBy:'.self::USER_COLUMNS,
            'trackingRecords.updates.createdBy:'.self::USER_COLUMNS,
        ]);

        /** @var TrackingRecord|null $tracking */
        $tracking = $incident->trackingRecords->first();
        $school = $incident->school;
        $assignment = $incident->networkAssignment;
        $sensor = $incident->sensor;

        $timeline = $this->timeline($incident, $tracking);
        $durationSeconds = OutageDuration::seconds($incident->started_at, $incident->recovered_at);
        $activeDispatch = $incident->fieldDispatches->first(fn (FieldDispatch $d) => $d->status?->isActive());
        $reviewStatus = $incident->recovery_review_status instanceof RecoveryReviewStatus
            ? $incident->recovery_review_status
            : RecoveryReviewStatus::tryFrom((string) $incident->recovery_review_status);

        return [
            'incident' => [
                'id' => $incident->id,
                'started_at' => $incident->started_at?->toIso8601String(),
                'recovered_at' => $incident->recovered_at?->toIso8601String(),
                'is_active' => $incident->recovered_at === null,
                'duration_seconds' => $durationSeconds,
                'duration' => OutageDuration::human($durationSeconds),
                'same_day' => \App\Support\OperationalTime::sameLocalDay($incident->started_at, $incident->recovered_at),
                'followup_status' => $incident->followup_status?->value,
                'followup_label' => $incident->followup_status?->label(),
                'case_status' => IncidentCaseStatus::resolve($incident, $tracking),
                'reincidencia' => $this->reincidencia($incident),
            ],
            'gestion' => [
                'classification' => $incident->management_classification?->value,
                'classification_label' => $incident->management_classification?->label(),
                'scope' => $incident->management_scope?->value,
                'outage_text' => $incident->outage_text,
                'detail_text' => $incident->detail_text,
                'diagnosis' => $incident->diagnosis,
                'cause' => $incident->cause,
                'responsible_area' => $incident->responsible_area,
                'glpi_ticket' => $incident->glpi_ticket,
                'contact_result' => $incident->contact_result,
                'evidence_observations' => $incident->evidence_observations,
                'last_contact_at' => $incident->last_contact_at?->toIso8601String(),
                'managements_count' => $incident->managements->count(),
            ],
            'recovery' => [
                'recovered_while_managing' => (bool) $incident->recovered_while_managing,
                'review_status' => $reviewStatus?->value,
                'review_label' => $reviewStatus?->label(),
                'reviewed_at' => $incident->recovery_reviewed_at?->toIso8601String(),
                'requires_review' => $reviewStatus === RecoveryReviewStatus::PendingReview
                    || ((bool) $incident->recovered_while_managing && $reviewStatus === null),
                'had_field_tech' => $incident->fieldDispatches->isNotEmpty(),
                'has_active_dispatch' => $activeDispatch !== null,
                'recovery_note' => $this->lastTechnicalRecoveryNote($tracking),
            ],
            'school' => array_merge([
                'id' => $school?->id,
                'local_educativo' => $school?->local_educativo,
                'codigo_local' => $school?->codigo_local,
                'codigo_modular' => $school?->codigo_modular,
                'centro_poblado' => $school?->centro_poblado,
                'cid' => $assignment?->cid,
                'tecnologia' => $assignment?->tecnologia_acceso,
                'nodo_pop' => $assignment?->nodo_pop,
                'capacidad_mbps' => $assignment?->capacidad_mbps,
                'prtg_device_name' => $assignment?->prtg_device_name,
            ], PrtgOperationalLocation::apiFields($assignment, $school)),
            'prtg' => [
                'estado' => $sensor?->normalized_status?->value ?? MonitoringStatus::SinDatos->value,
                'estado_texto' => $sensor?->status_text,
                'sensor_name' => $sensor?->name,
                'device_name' => $sensor?->device_name,
                'sensor_objid' => $sensor?->prtg_sensor_id,
                'last_check' => $sensor?->last_check?->toIso8601String(),
            ],
            'tracking' => $tracking ? array_merge($tracking->toSummaryArray(), [
                'updates_count' => $tracking->updates->count(),
            ]) : null,
            'field_dispatch' => $activeDispatch?->toApiArray() ?? $incident->fieldDispatches->first()?->toApiArray(),
            'field_dispatches' => $incident->fieldDispatches
                ->map(fn (FieldDispatch $d) => array_merge($d->toApiArray(), [
                    'created_by_name' => $d->creator?->name,
                ]))
                ->values()
                ->all(),
            'participants' => $this->participants($timeline),
            'timeline' => $timeline,
        ];
    }

    /**
     * Posición cronológica de la incidencia en el colegio, en una sola consulta.
     *
     * @return array{numero: int, total: int, label: string}
     */
    private function reincidencia(Incident $incident): array
    {
        $startedAt = $incident->getRawOriginal('started_at');

        $row = Incident::query()
            ->where('school_id', $incident->school_id)
            ->selectRaw('count(*) as total')
            ->selectRaw(
                'sum(case when started_at < ? or (started_at = ? and id <= ?) then 1 else 0 end) as numero',
                [$startedAt, $startedAt, $incident->id]
            )
            ->toBase()
            ->first();

        $total = (int) ($row->total ?? 0);
        $numero = max(1, (int) ($row->numero ?? 1));

        return [
            'numero' => $numero,
            'total' => $total,
            'label' => "Incidencia {$numero} de {$total}",
        ];
    }

    /**
     * Línea de tiempo unificada: gestiones, eventos del sistema, campo, revisión y Tracking.
     *
     * @return list<array<string, mixed>>
     */
    private function timeline(Incident $incident, ?TrackingRecord $tracking): array
    {
        $events = array_map(function (array $event) {
            [$group, $role] = $this->classify($event);

            return $event + ['group' => $group, 'role' => $role];
        }, IncidentTimelineBuilder::build($incident));

        if ($tracking !== null) {
            $ticket = $tracking->report_ticket ?? $tracking->ticket;
            $events[] = [
                'id' => 'tracking-open-'.$tracking->id,
                'source' => 'tracking',
                'at' => $tracking->opened_at?->toIso8601String() ?? $tracking->created_at?->toIso8601String(),
                'kind' => 'TRACKING_OPEN',
                'icon' => 'ticket',
                'actor' => $tracking->openedByDisplayName() ?? 'Sistema',
                'title' => 'Tracking abierto',
                'detail' => implode(' · ', array_filter([
                    $ticket ? 'Ticket '.$ticket : null,
                    $tracking->case_code ? 'Caso '.$tracking->case_code : null,
                    $tracking->description,
                ])) ?: null,
                'status_before' => null,
                'status_after' => null,
                'contact' => null,
                'scope' => null,
                'classification' => null,
                'group' => 'TRACKING',
                'role' => 'Abrió Tracking',
            ];

            foreach ($tracking->updates as $update) {
                $events[] = $this->fromTrackingUpdate($update);
            }

            if ($tracking->isClosed()) {
                $events[] = [
                    'id' => 'tracking-close-'.$tracking->id,
                    'source' => 'tracking',
                    'at' => $tracking->closed_at?->toIso8601String() ?? $tracking->updated_at?->toIso8601String(),
                    'kind' => 'TRACKING_CLOSE',
                    'icon' => 'lock',
                    'actor' => $tracking->closedByDisplayName() ?? 'Sistema',
                    'title' => 'Tracking cerrado',
                    'detail' => $tracking->closing_note,
                    'status_before' => null,
                    'status_after' => null,
                    'contact' => null,
                    'scope' => null,
                    'classification' => null,
                    'group' => 'TRACKING',
                    'role' => 'Cerró Tracking',
                ];
            }
        }

        usort($events, fn (array $a, array $b) => strcmp((string) ($a['at'] ?? ''), (string) ($b['at'] ?? '')));

        return array_values($events);
    }

    /**
     * @return array<string, mixed>
     */
    private function fromTrackingUpdate(TrackingUpdate $update): array
    {
        $type = $update->event_type instanceof TrackingEventType
            ? $update->event_type
            : TrackingEventType::tryFrom((string) $update->event_type);

        return [
            'id' => 'tracking-update-'.$update->id,
            'source' => 'tracking',
            'at' => ($update->occurred_at ?? $update->created_at)?->toIso8601String(),
            'kind' => 'TRACKING_'.($type?->value ?? 'OTHER'),
            'icon' => match ($type) {
                TrackingEventType::TechnicalRecovery => 'check',
                TrackingEventType::Contact => 'phone',
                TrackingEventType::FieldAction => 'truck',
                TrackingEventType::SystemEvent => 'activity',
                default => 'message',
            },
            'actor' => $update->actorDisplayName(),
            'title' => 'Tracking · '.($type?->label() ?? 'Seguimiento'),
            'detail' => $update->body,
            'status_before' => null,
            'status_after' => null,
            'contact' => null,
            'scope' => null,
            'classification' => null,
            'group' => ($type?->isSystem() ?? false) ? 'SISTEMA' : 'TRACKING',
            'role' => 'Seguimiento Tracking',
        ];
    }

    /**
     * @param  array<string, mixed>  $event
     * @return array{0: string, 1: string}
     */
    private function classify(array $event): array
    {
        if (($event['source'] ?? null) === 'management') {
            return ['GESTION', 'Gestión'];
        }

        return match ((string) ($event['kind'] ?? '')) {
            'FIELD_DISPATCH' => ['CAMPO', 'Desplazamiento'],
            'RECOVERY_REVIEW' => ['REVISION', 'Revisión de recuperación'],
            'NOTE' => ['GESTION', 'Observación'],
            default => ['SISTEMA', 'Sistema'],
        };
    }

    /**
     * @param  list<array<string, mixed>>  $timeline
     * @return list<array{name: string, roles: list<string>, events: int, first_at: ?string, last_at: ?string}>
     */
    private function participants(array $timeline): array
    {
        $out = [];
        foreach ($timeline as $event) {
            $name = trim((string) ($event['actor'] ?? ''));
            if ($name === '' || in_array($name, ['Sistema', 'Desconocido'], true)) {
                continue;
            }
            $entry = $out[$name] ?? ['name' => $name, 'roles' => [], 'events' => 0, 'first_at' => null, 'last_at' => null];
            $entry['events']++;
            $role = (string) ($event['role'] ?? '');
            if ($role !== '' && ! in_array($role, $entry['roles'], true)) {
                $entry['roles'][] = $role;
            }
            $entry['first_at'] ??= $event['at'] ?? null;
            $entry['last_at'] = $event['at'] ?? $entry['last_at'];
            $out[$name] = $entry;
        }

        return array_values($out);
    }

    private function lastTechnicalRecoveryNote(?TrackingRecord $tracking): ?string
    {
        if ($tracking === null) {
            return null;
        }

        $note = $tracking->updates
            ->filter(fn (TrackingUpdate $u) => $u->event_type === TrackingEventType::TechnicalRecovery)
            ->last()?->body;

        return $note !== null && trim((string) $note) !== '' ? (string) $note : null;
    }
}
