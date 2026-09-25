<?php

namespace App\Http\Controllers\Api\V1\Incidents;

use App\Enums\AffectedWanNode;
use App\Enums\ContactConfirmedStatus;
use App\Enums\ContactResult;
use App\Enums\FollowupStatus;
use App\Enums\ManagementClassification;
use App\Enums\ManagementScope;
use App\Domain\Incidents\Services\FieldDispatchService;
use App\Domain\Incidents\Services\IncidentManagementService;
use App\Domain\Incidents\Services\IncidentService;
use App\Domain\Incidents\Services\RecoveryReviewService;
use App\Domain\Incidents\Support\IncidentTimelineBuilder;
use App\Domain\Incidents\Support\OutageDuration;
use App\Domain\Monitoring\PRTG\Support\PrtgOperationalLocation;
use App\Enums\FieldDispatchStatus;
use App\Http\Controllers\Controller;
use App\Models\FieldDispatch;
use App\Models\Incident;
use App\Models\IncidentUpdate;
use App\Models\NetworkAssignment;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use InvalidArgumentException;

class IncidentController extends Controller
{
    public function __construct(
        private readonly IncidentManagementService $managements,
        private readonly IncidentService $incidents,
        private readonly RecoveryReviewService $recoveryReviews,
        private readonly FieldDispatchService $fieldDispatches,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $query = Incident::query()->with(['school', 'networkAssignment', 'sensor'])->orderByDesc('started_at');

        if ($request->boolean('active_only', true)) {
            $query->active();
        }

        if ($request->filled('followup_status')) {
            $status = (string) $request->query('followup_status');
            if ($status === 'EN_GESTION_GROUP') {
                $query->whereIn('followup_status', FollowupStatus::managingValues());
            } else {
                $query->where('followup_status', $status);
            }
        }

        if ($request->filled('management_classification')) {
            $query->where('management_classification', (string) $request->query('management_classification'));
        }

        return response()->json(['data' => $query->limit(200)->get()]);
    }

    public function show(Incident $incident): JsonResponse
    {
        $incident->load([
            'school.contacts',
            'networkAssignment',
            'sensor',
            'updates.user',
            'managements.author',
            'fieldDispatches',
            'activeTracking.openedBy:id,name',
        ]);

        $historyQuery = Incident::query()
            ->where('network_assignment_id', $incident->network_assignment_id)
            ->orderByDesc('started_at');

        $history = (clone $historyQuery)->limit(50)->get();
        $totalForCid = (clone $historyQuery)->count();
        $recoveredForCid = (clone $historyQuery)->whereNotNull('recovered_at')->count();
        $activeForCid = (clone $historyQuery)->whereNull('recovered_at')->count();
        $reincidente = $totalForCid > 1;

        $school = $incident->school;
        $assignment = $incident->networkAssignment;
        $sensor = $incident->sensor;
        $contacts = $school?->contacts ?? collect();
        $cloudnetSite = $school
            ? $school->cloudnetSites()->latest('last_synced_at')->first()
            : null;

        $nombrePrtg = $sensor?->device_name;
        $storedName = (string) ($assignment?->prtg_device_name ?? '');
        if (($nombrePrtg === null || $nombrePrtg === '') && $storedName !== '' && ! str_starts_with($storedName, '=')) {
            $nombrePrtg = $storedName;
        }

        $ipLoopback = (string) ($assignment?->ip_loopback ?? '');
        if ($ipLoopback === '' || str_starts_with($ipLoopback, '=')) {
            $ipLoopback = self::loopbackFromRow((int) ($assignment?->source_row ?? 0)) ?? '';
        }

        $elapsedSeconds = OutageDuration::seconds($incident->started_at, $incident->recovered_at);
        $durationHuman = OutageDuration::human($elapsedSeconds);

        $totalForSchool = Incident::query()->where('school_id', $incident->school_id)->count();
        $ordinal = Incident::query()
            ->where('school_id', $incident->school_id)
            ->where(function ($q) use ($incident) {
                $q->where('started_at', '<', $incident->started_at)
                    ->orWhere(function ($q2) use ($incident) {
                        $q2->where('started_at', $incident->started_at)
                            ->where('id', '<=', $incident->id);
                    });
            })
            ->count();

        return response()->json([
            'incident' => $incident,
            'estado' => [
                'estado_prtg' => $sensor?->normalized_status?->value ?? $incident->current_status,
                'estado_prtg_text' => $sensor?->status_text,
                'fecha_caida' => $incident->started_at?->toIso8601String(),
                'duracion' => $durationHuman,
                'duracion_segundos' => $elapsedSeconds,
                'recovered_at' => $incident->recovered_at?->toIso8601String(),
                'ultima_comprobacion' => $sensor?->last_check?->toIso8601String(),
                'sensor_id' => $sensor?->id,
                'prtg_sensor_objid' => $sensor?->prtg_sensor_id,
                'n_incidencia' => $incident->id,
                'followup_status' => $incident->followup_status?->value,
                'followup_label' => $incident->followup_status?->label(),
                'activa' => $incident->recovered_at === null,
                'same_day' => \App\Support\OperationalTime::sameLocalDay($incident->started_at, $incident->recovered_at),
                'recovered_while_managing' => (bool) $incident->recovered_while_managing,
                'recovery_review_status' => $incident->recovery_review_status?->value
                    ?? $incident->recovery_review_status,
                'recovery_review_label' => $incident->recovery_review_status instanceof \App\Enums\RecoveryReviewStatus
                    ? $incident->recovery_review_status->label()
                    : null,
                'recovery_reviewed_at' => $incident->recovery_reviewed_at?->toIso8601String(),
                'requires_review' => ($incident->recovery_review_status?->value
                    ?? $incident->recovery_review_status) === \App\Enums\RecoveryReviewStatus::PendingReview->value
                    || ((bool) $incident->recovered_while_managing
                        && ($incident->recovery_review_status === null)),
                'active_field_dispatch' => $incident->fieldDispatches
                    ->contains(fn (FieldDispatch $d) => ($d->status instanceof FieldDispatchStatus
                        ? $d->status->isActive()
                        : in_array((string) $d->status, FieldDispatchStatus::activeValues(), true))),
                'had_field_tech' => $incident->fieldDispatches->isNotEmpty()
                    || $incident->followup_status === FollowupStatus::TecnicoEnCampo
                    || $incident->updates->contains(fn ($u) => $u->status_after === FollowupStatus::TecnicoEnCampo->value
                        || $u->status_before === FollowupStatus::TecnicoEnCampo->value
                        || strtoupper((string) $u->type) === 'FIELD_DISPATCH'),
                'active_tracking_id' => $incident->activeTracking->first()?->id,
            ],
            'active_tracking' => ($active = $incident->activeTracking->first())
                ? [
                    'id' => $active->id,
                    'incident_number' => $active->incident_number,
                    'public_id' => $active->public_id,
                    'case_code' => $active->case_code,
                    'ticket' => $active->report_ticket ?? $active->ticket,
                    'report_ticket' => $active->report_ticket ?? $active->ticket,
                    'status' => $active->status instanceof \App\Enums\TrackingStatus
                        ? $active->status->value
                        : (string) $active->status,
                    'status_label' => $active->status instanceof \App\Enums\TrackingStatus
                        ? $active->status->label()
                        : null,
                    'opened_at' => $active->opened_at?->toIso8601String(),
                    'opened_by_name' => $active->openedByDisplayName(),
                    'description' => $active->description,
                ]
                : null,
            'field_dispatch' => ($incident->fieldDispatches
                ->first(fn (FieldDispatch $d) => ($d->status instanceof FieldDispatchStatus
                    ? $d->status->isActive()
                    : in_array((string) $d->status, FieldDispatchStatus::activeValues(), true)))
                ?? $incident->fieldDispatches->first())?->toApiArray(),
            'field_dispatches' => $incident->fieldDispatches->map(fn (FieldDispatch $d) => $d->toApiArray())->values()->all(),
            'colegio' => array_merge([
                'school_id' => $school?->id,
                'local_educativo' => $school?->local_educativo,
                'codigo_local' => $school?->codigo_local,
                'codigo_modular' => $school?->codigo_modular,
                'departamento' => $school?->departamento,
                'centro_poblado' => $school?->centro_poblado,
                'clasificacion' => $school?->clasificacion,
                'cid' => $assignment?->cid,
                'tecnologia' => $assignment?->tecnologia_acceso,
                'nodo_pop' => $assignment?->nodo_pop,
                'ip_loopback' => $ipLoopback !== '' ? $ipLoopback : null,
                'ip_publica' => $assignment?->ip_publica,
                'capacidad_mbps' => $assignment?->capacidad_mbps,
                'nombre_prtg' => $nombrePrtg,
                'legacy_reference' => $school?->legacy_reference,
                'current_sequence' => $school?->current_sequence,
            ], PrtgOperationalLocation::apiFields($assignment, $school)),
            'cloudnet' => $cloudnetSite ? [
                'shop_id' => $cloudnetSite->shop_id,
                'site_name' => $cloudnetSite->site_name,
                'address' => $cloudnetSite->address,
                'match_status' => $cloudnetSite->match_status,
                'last_synced_at' => $cloudnetSite->last_synced_at?->toIso8601String(),
                'devices' => $cloudnetSite->devices()->count(),
            ] : null,
            'contactos' => $contacts->values()->map(fn ($c) => [
                'id' => $c->id,
                'nombre' => $c->name,
                'cargo' => $c->role,
                'telefono' => $c->phone,
                'position' => $c->position,
            ])->all(),
            'antecedentes' => [
                'incidencias_registradas' => $totalForCid,
                'recuperadas' => $recoveredForCid,
                'activas' => $activeForCid,
                'reincidente' => $reincidente,
                'reincidencia' => [
                    'numero' => $ordinal,
                    'total' => $totalForSchool,
                    'label' => "Incidencia {$ordinal} de {$totalForSchool}",
                ],
            ],
            'historial' => $history->map(fn (Incident $row) => [
                'id' => $row->id,
                'started_at' => $row->started_at?->toIso8601String(),
                'recovered_at' => $row->recovered_at?->toIso8601String(),
                'duracion' => OutageDuration::human(OutageDuration::seconds($row->started_at, $row->recovered_at)),
                'followup_status' => $row->followup_status?->value,
                'status' => $row->recovered_at ? 'RECUPERADA' : 'ACTIVA',
                'es_actual' => $row->id === $incident->id,
            ])->values()->all(),
            'gestion' => [
                'followup_status' => $incident->followup_status?->value,
                'management_classification' => $incident->management_classification?->value,
                'management_classification_label' => $incident->management_classification?->label(),
                'management_scope' => $incident->management_scope?->value,
                'outage_text' => $incident->outage_text,
                'detail_text' => $incident->detail_text,
                'last_managed_contact_id' => $incident->last_managed_contact_id,
                'contact_status' => $incident->contact_status,
                'contact_result' => $incident->contact_result,
                'responsible_area' => $incident->responsible_area,
                'glpi_ticket' => $incident->glpi_ticket,
                'diagnosis' => $incident->diagnosis,
                'evidence_observations' => $incident->evidence_observations,
                'cause' => $incident->cause,
                'last_contact_at' => $incident->last_contact_at?->toIso8601String(),
            ],
            'managements' => $incident->managements->map(fn ($m) => [
                'id' => $m->id,
                'classification' => $m->classification?->value,
                'classification_label' => $m->classification?->label(),
                'color_key' => $m->classification?->colorKey(),
                'scope' => $m->scope?->value,
                'outage_text' => $m->outage_text,
                'detail' => $m->detail,
                'observation' => $m->observation,
                'contact_id' => $m->contact_id,
                'contact_name_snapshot' => $m->contact_name_snapshot,
                'contact_phone_snapshot' => $m->contact_phone_snapshot,
                'contact_role_snapshot' => $m->contact_role_snapshot,
                'contact_attempted_at' => $m->contact_attempted_at?->toIso8601String(),
                'created_by' => $m->created_by,
                'created_by_name' => $m->author?->name,
                'created_at' => $m->created_at?->toIso8601String(),
            ])->values()->all(),
            'updates' => $incident->updates->map(fn ($u) => [
                'id' => $u->id,
                'type' => $u->type,
                'status_before' => $u->status_before,
                'status_after' => $u->status_after,
                'observation' => $u->observation,
                'user_id' => $u->user_id,
                'user_name' => $u->user?->name,
                'created_at' => $u->created_at?->toIso8601String(),
            ])->values()->all(),
            'timeline' => IncidentTimelineBuilder::build($incident),
            'snapshots' => [
                'school' => $incident->school_snapshot,
                'network' => $incident->network_snapshot,
            ],
            'opciones' => [
                'followup_statuses' => collect([
                    FollowupStatus::PendienteContacto,
                    FollowupStatus::EnDescarte,
                    FollowupStatus::EnEspera,
                    FollowupStatus::Escalado,
                    FollowupStatus::TecnicoEnCampo,
                    FollowupStatus::Recuperado,
                    FollowupStatus::Cerrado,
                    FollowupStatus::EnGestion,
                ])->map(fn (FollowupStatus $s) => [
                    'value' => $s->value,
                    'label' => $s->label(),
                ])->values()->all(),
                'management_classifications' => collect([
                    ManagementClassification::ContactConfirmed,
                    ManagementClassification::LinkOutage,
                    ManagementClassification::NoResponse,
                ])->map(fn (ManagementClassification $s) => [
                    'value' => $s->value,
                    'label' => $s->label(),
                    'hint' => $s->hint(),
                    'color_key' => $s->colorKey(),
                ])->values()->all(),
                'management_scopes' => collect(ManagementScope::cases())->map(fn (ManagementScope $s) => [
                    'value' => $s->value,
                    'label' => $s->label(),
                ])->values()->all(),
                'contact_statuses' => collect(ContactConfirmedStatus::cases())->map(fn (ContactConfirmedStatus $s) => [
                    'value' => $s->value,
                    'label' => $s->label(),
                ])->values()->all(),
                'contact_results' => collect(ContactResult::cases())->map(fn (ContactResult $s) => [
                    'value' => $s->value,
                    'label' => $s->label(),
                ])->values()->all(),
                'field_dispatch_actions' => collect(FieldDispatchService::actions())->map(fn (string $a) => [
                    'value' => $a,
                    'label' => match ($a) {
                        FieldDispatchService::ACTION_PLAN => 'Planificar desplazamiento',
                        FieldDispatchService::ACTION_DISPATCH => 'Despachar',
                        FieldDispatchService::ACTION_ARRIVE => 'Reportar en sitio',
                        FieldDispatchService::ACTION_CANCEL => 'Cancelar desplazamiento',
                        FieldDispatchService::ACTION_COMPLETE => 'Completar',
                        default => $a,
                    },
                ])->values()->all(),
                'field_dispatch_statuses' => collect(FieldDispatchStatus::cases())->map(fn (FieldDispatchStatus $s) => [
                    'value' => $s->value,
                    'label' => $s->label(),
                    'active' => $s->isActive(),
                ])->values()->all(),
            ],
        ]);
    }

    public function storeManualPartial(Request $request): JsonResponse
    {
        $data = $request->validate([
            'school_id' => ['nullable', 'integer', 'required_without_all:network_assignment_id,cid'],
            'network_assignment_id' => ['nullable', 'integer', 'required_without_all:school_id,cid'],
            'cid' => ['nullable', 'string', 'max:40', 'required_without_all:school_id,network_assignment_id'],
            'affected_wan_node' => ['required', Rule::in(AffectedWanNode::values())],
            'detail' => ['nullable', 'string', 'max:5000'],
        ]);

        $userId = (int) ($request->user()?->id ?? 0);
        if ($userId < 1) {
            return response()->json(['message' => 'No autenticado.'], 401);
        }

        $assignment = null;
        if (! empty($data['network_assignment_id'])) {
            $assignment = NetworkAssignment::query()
                ->whereKey((int) $data['network_assignment_id'])
                ->where('is_active', true)
                ->first();
        } elseif (! empty($data['school_id'])) {
            $assignment = NetworkAssignment::query()
                ->where('school_id', (int) $data['school_id'])
                ->where('is_active', true)
                ->orderByDesc('id')
                ->first();
        } else {
            $cid = preg_replace('/\D+/', '', (string) $data['cid']) ?: (string) $data['cid'];
            $assignment = NetworkAssignment::query()
                ->where('is_active', true)
                ->where(function ($q) use ($cid, $data) {
                    $q->where('cid', $cid)->orWhere('cid', (string) $data['cid']);
                })
                ->orderByDesc('id')
                ->first();
        }

        if ($assignment === null) {
            return response()->json(['message' => 'No se encontró asignación de red activa para ese colegio/CID.'], 422);
        }

        try {
            $incident = $this->incidents->openManualPartial(
                $assignment,
                AffectedWanNode::from((string) $data['affected_wan_node']),
                $userId,
                $data['detail'] ?? null,
            );
        } catch (InvalidArgumentException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return $this->show($incident->fresh() ?? $incident);
    }

    public function storeManagement(Request $request, Incident $incident): JsonResponse
    {
        $data = $request->validate([
            'classification' => ['required', Rule::in([
                ManagementClassification::ContactConfirmed->value,
                ManagementClassification::LinkOutage->value,
                ManagementClassification::NoResponse->value,
            ])],
            'scope' => ['nullable', Rule::in(array_merge([''], ManagementScope::values()))],
            'outage_text' => ['nullable', 'string', 'max:2000'],
            'detail' => ['nullable', 'string', 'max:5000'],
            'observation' => ['nullable', 'string', 'max:5000'],
            'contact_id' => ['nullable', 'integer'],
            'contact_attempted_at' => ['nullable', 'date'],
        ]);

        if (($data['scope'] ?? null) === '') {
            $data['scope'] = null;
        }

        $userId = $request->user()?->id;
        if (! $userId) {
            return response()->json(['message' => 'No autenticado.'], 401);
        }
        $data['created_by'] = (int) $userId;

        try {
            $applied = $this->managements->apply($incident, $data);
        } catch (InvalidArgumentException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        $payload = $this->show($incident->fresh())->getData(true);
        if (is_array($payload)) {
            $payload['tracking_sync'] = $applied['tracking'];
        }

        return response()->json($payload);
    }

    public function update(Request $request, Incident $incident): JsonResponse
    {
        $data = $request->validate([
            'followup_status' => ['nullable', Rule::in(FollowupStatus::values())],
            'contact_status' => ['nullable', Rule::in(array_merge([''], ContactConfirmedStatus::values()))],
            'contact_result' => ['nullable', Rule::in(array_merge([''], ContactResult::values()))],
            'responsible_area' => ['nullable', 'string', 'max:255'],
            'glpi_ticket' => ['nullable', 'string', 'max:100'],
            'diagnosis' => ['nullable', 'string'],
            'evidence_observations' => ['nullable', 'string'],
            'cause' => ['nullable', 'string'],
        ]);

        if (array_key_exists('contact_status', $data) && $data['contact_status'] === '') {
            $data['contact_status'] = null;
        }
        if (array_key_exists('contact_result', $data) && $data['contact_result'] === '') {
            $data['contact_result'] = null;
        }

        $before = $incident->followup_status?->value;
        $wantsTechnicalRecovery = ($data['followup_status'] ?? null) === FollowupStatus::Recuperado->value
            && $incident->recovered_at === null;

        if ($wantsTechnicalRecovery) {
            unset($data['followup_status']);
        }

        $incident->fill($data);

        $touchedGestion = array_intersect(array_keys($data), [
            'followup_status',
            'contact_status',
            'contact_result',
            'responsible_area',
            'glpi_ticket',
            'diagnosis',
            'evidence_observations',
            'cause',
        ]);
        if ($touchedGestion !== [] || $wantsTechnicalRecovery) {
            $incident->last_contact_at = now();
        }

        if ($wantsTechnicalRecovery) {
            $incident->save();
            $this->incidents->applyTechnicalRecovery(
                $incident->fresh() ?? $incident,
                'Recuperación registrada manualmente por el operador.'
            );
            $incident->refresh();
        } else {
            if (($data['followup_status'] ?? null) === FollowupStatus::Cerrado->value) {
                if ($incident->recovered_at === null) {
                    $incident->recovered_at = now();
                }
            }
            $incident->save();
        }

        if (($data['followup_status'] ?? null) === FollowupStatus::TecnicoEnCampo->value
            && $before !== FollowupStatus::TecnicoEnCampo->value) {
            $this->fieldDispatches->ensurePlanned(
                $incident->fresh() ?? $incident,
                $request->user()?->id,
                'Desplazamiento planificado al marcar Técnico en campo.',
            );
        }

        $observationParts = array_filter([
            $data['diagnosis'] ?? null,
            $data['evidence_observations'] ?? null,
            isset($data['glpi_ticket']) ? 'GLPI: '.$data['glpi_ticket'] : null,
            isset($data['responsible_area']) ? 'Responsable: '.$data['responsible_area'] : null,
        ]);

        if (! $wantsTechnicalRecovery) {
            if (($data['followup_status'] ?? null) && $data['followup_status'] !== $before) {
                // Avoid duplicate MANUAL update when ensurePlanned already wrote FIELD_DISPATCH + followup sync
                $alreadyLogged = ($data['followup_status'] === FollowupStatus::TecnicoEnCampo->value)
                    && $before !== FollowupStatus::TecnicoEnCampo->value;
                if (! $alreadyLogged) {
                    IncidentUpdate::query()->create([
                        'incident_id' => $incident->id,
                        'type' => 'MANUAL',
                        'status_before' => $before,
                        'status_after' => $data['followup_status'],
                        'observation' => $observationParts !== []
                            ? implode(' | ', $observationParts)
                            : 'Actualización de seguimiento',
                        'created_at' => now(),
                    ]);
                } elseif ($observationParts !== []) {
                    IncidentUpdate::query()->create([
                        'incident_id' => $incident->id,
                        'type' => 'NOTE',
                        'status_before' => $before,
                        'status_after' => $data['followup_status'],
                        'observation' => implode(' | ', $observationParts),
                        'created_at' => now(),
                    ]);
                }
            } elseif ($observationParts !== []) {
                IncidentUpdate::query()->create([
                    'incident_id' => $incident->id,
                    'type' => 'NOTE',
                    'status_before' => $before,
                    'status_after' => $incident->followup_status?->value,
                    'observation' => implode(' | ', $observationParts),
                    'created_at' => now(),
                ]);
            }
        }

        return response()->json(
            $this->show($incident->fresh())->getData(true)
        );
    }

    public function fieldDispatch(Request $request, Incident $incident): JsonResponse
    {
        $data = $request->validate([
            'action' => ['required', 'string', Rule::in(FieldDispatchService::actions())],
            'technician_name' => ['nullable', 'string', 'max:255'],
            'observation' => ['nullable', 'string', 'max:5000'],
        ]);

        try {
            $this->fieldDispatches->apply($incident, [
                ...$data,
                'created_by' => $request->user()?->id,
            ]);
        } catch (InvalidArgumentException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json(
            $this->show($incident->fresh())->getData(true)
        );
    }

    public function recoveryReview(Request $request, Incident $incident): JsonResponse
    {
        $data = $request->validate([
            'action' => ['required', 'string', Rule::in(RecoveryReviewService::actions())],
            'observation' => ['nullable', 'string', 'max:5000'],
        ]);

        try {
            $updated = $this->recoveryReviews->apply($incident, [
                ...$data,
                'created_by' => $request->user()?->id,
            ]);
        } catch (InvalidArgumentException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json(
            $this->show($updated)->getData(true)
        );
    }

    public function addUpdate(Request $request, Incident $incident): JsonResponse
    {
        $data = $request->validate([
            'observation' => ['required', 'string'],
            'followup_status' => ['nullable', Rule::in(FollowupStatus::values())],
        ]);

        $before = $incident->followup_status?->value;
        if (! empty($data['followup_status'])) {
            $incident->update([
                'followup_status' => FollowupStatus::from($data['followup_status']),
                'last_contact_at' => now(),
            ]);

            if ($data['followup_status'] === FollowupStatus::TecnicoEnCampo->value) {
                $this->fieldDispatches->ensurePlanned(
                    $incident->fresh() ?? $incident,
                    $request->user()?->id,
                    $data['observation'],
                );
            }
        }

        $update = IncidentUpdate::query()->create([
            'incident_id' => $incident->id,
            'type' => 'MANUAL',
            'status_before' => $before,
            'status_after' => $data['followup_status'] ?? $before,
            'observation' => $data['observation'],
            'created_at' => now(),
        ]);

        return response()->json($update, 201);
    }

    private static function loopbackFromRow(int $excelRow): ?string
    {
        if ($excelRow < 2) {
            return null;
        }
        $n = $excelRow - 1;
        if ($n <= 250) {
            return "10.139.50.{$n}/32";
        }

        return '10.139.51.'.($excelRow - 251).'/32';
    }
}
