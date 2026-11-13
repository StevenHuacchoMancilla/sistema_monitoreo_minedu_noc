<?php

namespace App\Http\Controllers\Api\V1\Incidents;

use App\Enums\AffectedWanNode;
use App\Enums\ContactConfirmedStatus;
use App\Enums\ContactResult;
use App\Enums\FollowupStatus;
use App\Enums\ManagementClassification;
use App\Enums\ManagementScope;
use App\Enums\MineduReason;
use App\Domain\Incidents\Services\IncidentManagementService;
use App\Domain\Incidents\Services\IncidentOperativeCloseService;
use App\Domain\Incidents\Services\IncidentService;
use App\Domain\Incidents\Services\RecoveryReviewService;
use App\Domain\Incidents\Services\SameHourOutageService;
use App\Domain\Incidents\Services\SlaClockService;
use App\Domain\Reports\Services\ListaLleeDayService;
use App\Domain\Ticketera\Services\ServiceTicketService;
use App\Models\School;
use App\Domain\Incidents\Support\IncidentTimelineBuilder;
use App\Domain\Incidents\Support\RootCauseLegend;
use App\Domain\Incidents\Support\OutageDuration;
use App\Domain\Monitoring\PRTG\Support\PrtgOperationalLocation;
use App\Enums\FieldDispatchStatus;
use App\Http\Controllers\Controller;
use App\Models\FieldDispatch;
use App\Models\Incident;
use App\Models\IncidentManagement;
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
        private readonly IncidentOperativeCloseService $operativeClose,
        private readonly SlaClockService $slaClock,
        private readonly SameHourOutageService $sameHour,
        private readonly ServiceTicketService $serviceTickets,
        private readonly ListaLleeDayService $listaDays,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $query = Incident::query()->with(['school', 'networkAssignment', 'sensor'])->orderByDesc('started_at');

        if ($request->boolean('active_only', true)) {
            $query->active()->falls();
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
            'serviceTicket',
            'attachments.user:id,name',
        ]);

        $historyQuery = Incident::query()
            ->where('network_assignment_id', $incident->network_assignment_id)
            ->orderByDesc('started_at');

        $history = (clone $historyQuery)->limit(50)->get();
        $totalForCid = (clone $historyQuery)->count();
        $recoveredForCid = (clone $historyQuery)->whereNotNull('recovered_at')->count();
        $activeForCid = (clone $historyQuery)->falls()->whereNull('recovered_at')->count();
        $reincidente = $totalForCid > 1;

        $school = $incident->school;
        $assignment = $incident->networkAssignment;
        $sensor = $incident->sensor;
        $contacts = $school?->contacts ?? collect();

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
                'is_grave_incident' => $incident->isOpenGrave(),
                'is_requirement_case' => $incident->isOpenRequirement(),
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
                'ambito' => $school?->ambito,
                'energy_type' => $school?->energy_type,
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
                'management_classification' => $this->managementDisplayClassification(
                    $incident->management_classification instanceof ManagementClassification
                        ? $incident->management_classification
                        : null,
                    $incident,
                )?->value ?? $incident->management_classification?->value,
                'management_classification_label' => $this->managementDisplayLabel(
                    $incident->management_classification instanceof ManagementClassification
                        ? $incident->management_classification
                        : null,
                    $incident,
                ),
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
                'root_cause_group_code' => $incident->root_cause_group_code,
                'root_cause_code' => $incident->root_cause_code,
                'root_cause_label' => \App\Domain\Incidents\Support\RootCauseLegend::display(
                    $incident->root_cause_code,
                    $incident->cause,
                ),
                'minedu_reason' => $incident->minedu_reason instanceof \App\Enums\MineduReason
                    ? $incident->minedu_reason->value
                    : $incident->minedu_reason,
                'minedu_reason_label' => $incident->minedu_reason instanceof \App\Enums\MineduReason
                    ? $incident->minedu_reason->label()
                    : null,
                'last_contact_at' => $incident->last_contact_at?->toIso8601String(),
            ],
            'ticket' => $incident->serviceTicket
                ? $this->serviceTickets->toApi($incident->serviceTicket)
                : null,
            'sla' => $this->slaClock->snapshot($incident),
            'managements' => $incident->managements->map(fn ($m) => [
                'id' => $m->id,
                'classification' => $this->managementDisplayClassification($m->classification, $incident)?->value
                    ?? $m->classification?->value,
                'classification_label' => $this->managementDisplayLabel($m->classification, $incident),
                'color_key' => $this->managementDisplayClassification($m->classification, $incident)?->colorKey()
                    ?? $m->classification?->colorKey(),
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
            'attachments' => $incident->attachments->map(
                fn (\App\Models\IncidentAttachment $a) => $a->toApi()
            )->values()->all(),
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
            // Opcional por compatibilidad con front antiguo; default TIPO 2 (enlace P2P).
            'classification' => ['nullable', Rule::in(ManagementClassification::operableValues())],
            'detail' => ['nullable', 'string', 'max:5000'],
        ]);

        $userId = (int) ($request->user()?->id ?? 0);
        if ($userId < 1) {
            return response()->json(['message' => 'No autenticado.'], 401);
        }

        $classification = (string) ($data['classification'] ?? ManagementClassification::LinkOutage->value);
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

            // Clasificación inmediata: TIPO 1 → reporte; TIPO 2/3 → Tracking abierto.
            $applied = $this->managements->apply($incident, [
                'classification' => $classification,
                'detail' => $data['detail'] ?? null,
                'created_by' => $userId,
            ]);
        } catch (InvalidArgumentException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        $payload = $this->show($incident->fresh() ?? $incident)->getData(true);
        if (is_array($payload)) {
            $payload['tracking_sync'] = $applied['tracking'];
        }

        return response()->json($payload);
    }

    public function storeManagement(Request $request, Incident $incident): JsonResponse
    {
        $data = $request->validate([
            'classification' => ['nullable', Rule::in(ManagementClassification::operableValues())],
            'scope' => ['nullable', Rule::in(array_merge([''], ManagementScope::values()))],
            'outage_text' => ['nullable', 'string', 'max:2000'],
            'detail' => ['nullable', 'string', 'max:5000'],
            'observation' => ['nullable', 'string', 'max:5000'],
            'contact_id' => ['nullable', 'integer'],
            'contact_via_descartes' => ['sometimes', 'boolean'],
            'contact_attempted_at' => ['nullable', 'date'],
            'root_cause_group_code' => ['nullable', 'string', 'max:8'],
            'root_cause_code' => ['nullable', 'string', 'max:16'],
            'cause' => ['nullable', 'string', 'max:500'],
            'minedu_reason' => ['nullable', Rule::in(MineduReason::operableValues())],
        ]);

        if (($data['scope'] ?? null) === '') {
            $data['scope'] = null;
        }
        if (! empty($data['contact_via_descartes'])) {
            $data['contact_id'] = null;
        }
        // Razón MINEDU opcional: si viene, define la clasificación (Caída de enlace / Requerimiento / Queja).
        // Sin razón MINEDU: comentario de seguimiento — nunca etiquetar como «Caída de enlace».
        if (! empty($data['minedu_reason'])) {
            $data['classification'] = MineduReason::from((string) $data['minedu_reason'])
                ->toManagementClassification()
                ->value;
        } else {
            $data['minedu_reason'] = null;
            if (empty($data['classification'])) {
                $data['classification'] = ManagementClassification::FollowUp->value;
            }
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

    public function lookupSchool(Request $request): JsonResponse
    {
        $q = trim((string) $request->query('q', ''));
        $digits = preg_replace('/\D+/', '', $q) ?? '';
        if ($q === '') {
            return response()->json(['data' => null]);
        }

        $assignment = NetworkAssignment::query()
            ->with('school')
            ->where('is_active', true)
            ->where(function ($query) use ($q, $digits) {
                $query->where('cid', $q);
                if ($digits !== '') {
                    $query->orWhere('cid', $digits);
                }
            })
            ->orderByDesc('id')
            ->first();

        if ($assignment === null && $digits !== '' && ctype_digit($digits)) {
            $school = School::query()->where('current_sequence', (int) $digits)->orderByDesc('id')->first();
            if ($school) {
                $assignment = NetworkAssignment::query()
                    ->where('school_id', $school->id)
                    ->where('is_active', true)
                    ->orderByDesc('id')
                    ->first();
                $assignment?->setRelation('school', $school);
            }
        }

        if ($assignment === null) {
            return response()->json(['data' => null]);
        }

        $school = $assignment->school;
        $openCase = $this->openCaseSummaryForAssignment((int) $assignment->id);

        return response()->json(['data' => [
            'school_id' => $school?->id,
            'assignment_id' => $assignment->id,
            'cid' => $assignment->cid,
            'tss' => $school?->current_sequence,
            'local_educativo' => $school?->local_educativo,
            'codigo_local' => $school?->codigo_local,
            'provincia' => $school?->provincia,
            'distrito' => $school?->distrito,
            'open_case' => $openCase,
        ]]);
    }

    public function storeManual(Request $request): JsonResponse
    {
        $data = $request->validate([
            'q' => ['required', 'string', 'max:40'],
            'detail' => ['nullable', 'string', 'max:5000'],
            'kind' => ['nullable', Rule::in(\App\Models\ServiceTicket::kinds())],
            'minedu_reason' => ['nullable', Rule::in(MineduReason::operableValues())],
            'root_cause_group_code' => ['nullable', 'string', 'max:8'],
            'root_cause_code' => ['nullable', 'string', 'max:16'],
            'arrived_at' => ['nullable', 'date'],
            'departed_at' => ['nullable', 'date'],
            'restored_at' => ['nullable', 'date'],
            'technician_name' => ['nullable', 'string', 'max:160'],
            'technician_phone' => ['nullable', 'string', 'max:40'],
            'activities' => ['nullable', 'string', 'max:5000'],
            'materials' => ['nullable', 'string', 'max:5000'],
        ]);
        $userId = (int) ($request->user()?->id ?? 0);
        if ($userId < 1) {
            return response()->json(['message' => 'No autenticado.'], 401);
        }

        $openGroup = trim((string) ($data['root_cause_group_code'] ?? ''));
        $openCause = trim((string) ($data['root_cause_code'] ?? ''));
        if ($openGroup !== '' || $openCause !== '') {
            try {
                RootCauseLegend::requirePair($openGroup, $openCause);
            } catch (InvalidArgumentException $e) {
                return response()->json(['message' => $e->getMessage()], 422);
            }
        } else {
            $data['root_cause_group_code'] = null;
            $data['root_cause_code'] = null;
        }

        $lookup = $this->lookupSchool($request->duplicate(['q' => $data['q']]))->getData(true);
        $found = is_array($lookup) ? ($lookup['data'] ?? null) : null;
        if (! is_array($found) || empty($found['assignment_id'])) {
            return response()->json(['message' => 'No hay un colegio activo con ese CID o TSS.'], 422);
        }

        $assignment = NetworkAssignment::query()->find((int) $found['assignment_id']);
        if ($assignment === null) {
            return response()->json(['message' => 'No hay un colegio activo con ese CID o TSS.'], 422);
        }

        $kind = strtoupper((string) ($data['kind'] ?? \App\Models\ServiceTicket::KIND_CORRECTIVE));
        if ($kind === \App\Models\ServiceTicket::KIND_PREVENTIVE) {
            return $this->storePreventive($request);
        }

        try {
            $incident = $this->incidents->openManualReported($assignment, $userId, $data['detail'] ?? null);
        } catch (InvalidArgumentException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        $this->applyOpeningGestion($incident, $data, $request->user()?->name);
        $this->serviceTickets->ensureTicketForIncident(
            $incident->fresh() ?? $incident,
            array_merge($data, ['kind' => $kind]),
            $request->user()?->name,
        );

        // Correctivo → Incidencias. Asignación libre solo si MINEDU (Queja / Caída enlace) lo marca.
        if ($kind === \App\Models\ServiceTicket::KIND_CORRECTIVE) {
            $this->forceMarkGrave($incident->fresh() ?? $incident, $userId);
        }

        return $this->show($incident->fresh() ?? $incident);
    }

    public function storePreventive(Request $request): JsonResponse
    {
        $data = $request->validate([
            'q' => ['required', 'string', 'max:40'],
            'detail' => ['nullable', 'string', 'max:5000'],
            'opened_at' => ['nullable', 'date'],
            'minedu_reason' => ['nullable', Rule::in(MineduReason::operableValues())],
            'root_cause_group_code' => ['nullable', 'string', 'max:8'],
            'root_cause_code' => ['nullable', 'string', 'max:16'],
            'arrived_at' => ['nullable', 'date'],
            'departed_at' => ['nullable', 'date'],
            'restored_at' => ['nullable', 'date'],
            'technician_name' => ['nullable', 'string', 'max:160'],
            'technician_phone' => ['nullable', 'string', 'max:40'],
            'activities' => ['nullable', 'string', 'max:5000'],
            'materials' => ['nullable', 'string', 'max:5000'],
        ]);
        $userId = (int) ($request->user()?->id ?? 0);
        if ($userId < 1) {
            return response()->json(['message' => 'No autenticado.'], 401);
        }

        $openGroup = trim((string) ($data['root_cause_group_code'] ?? ''));
        $openCause = trim((string) ($data['root_cause_code'] ?? ''));
        if ($openGroup !== '' || $openCause !== '') {
            try {
                RootCauseLegend::requirePair($openGroup, $openCause);
            } catch (InvalidArgumentException $e) {
                return response()->json(['message' => $e->getMessage()], 422);
            }
        } else {
            $data['root_cause_group_code'] = null;
            $data['root_cause_code'] = null;
        }

        $lookup = $this->lookupSchool($request->duplicate(['q' => $data['q']]))->getData(true);
        $found = is_array($lookup) ? ($lookup['data'] ?? null) : null;
        if (! is_array($found) || empty($found['assignment_id'])) {
            return response()->json(['message' => 'No hay un colegio activo con ese CID o TSS.'], 422);
        }

        $assignment = NetworkAssignment::query()->find((int) $found['assignment_id']);
        if ($assignment === null) {
            return response()->json(['message' => 'No hay un colegio activo con ese CID o TSS.'], 422);
        }

        try {
            $opened = ! empty($data['opened_at'])
                ? \Illuminate\Support\Carbon::parse((string) $data['opened_at'], \App\Support\OperationalTime::tz())
                : \App\Support\OperationalTime::now();
            $incident = $this->serviceTickets->openPreventive($assignment, $userId, $opened, $data['detail'] ?? null);
        } catch (InvalidArgumentException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        $this->applyOpeningGestion($incident, $data, $request->user()?->name);
        $this->serviceTickets->ensureTicketForIncident(
            $incident->fresh() ?? $incident,
            array_merge($data, ['kind' => \App\Models\ServiceTicket::KIND_PREVENTIVE]),
            $request->user()?->name,
        );

        return $this->show($incident->fresh() ?? $incident);
    }

    public function ensureTicket(Request $request, Incident $incident): JsonResponse
    {
        foreach (['opened_at', 'restored_at', 'closed_at', 'arrived_at', 'departed_at'] as $field) {
            if ($request->input($field) === '') {
                $request->merge([$field => null]);
            }
        }

        $data = $request->validate([
            'kind' => ['required', Rule::in(\App\Models\ServiceTicket::kinds())],
            'opened_at' => ['nullable', 'date'],
            'restored_at' => ['nullable', 'date'],
            'closed_at' => ['nullable', 'date'],
            'arrived_at' => ['nullable', 'date'],
            'departed_at' => ['nullable', 'date'],
            'technician_name' => ['nullable', 'string', 'max:160'],
            'technician_phone' => ['nullable', 'string', 'max:40'],
            'polygon' => ['nullable', 'string', 'max:160'],
            'visit_reason' => ['nullable', 'string', 'max:500'],
            'activities' => ['nullable', 'string', 'max:5000'],
            'materials' => ['nullable', 'string', 'max:5000'],
            'detail' => ['nullable', 'string', 'max:5000'],
        ]);

        $userId = (int) ($request->user()?->id ?? 0);
        $actor = $request->user()?->name;

        try {
            $this->serviceTickets->ensureTicketForIncident($incident, $data, $actor);
        } catch (InvalidArgumentException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        if (! empty($data['detail'])) {
            $incident->forceFill(['detail_text' => $data['detail']])->save();
        }

        $kind = strtoupper((string) $data['kind']);
        if ($kind === \App\Models\ServiceTicket::KIND_CORRECTIVE) {
            $this->forceMarkGrave($incident->fresh() ?? $incident, $userId);
        }

        return $this->show($incident->fresh() ?? $incident);
    }

    public function maintenanceIndex(Request $request): JsonResponse
    {
        $data = $request->validate([
            'status' => ['nullable', Rule::in(['ABIERTO', 'CERRADO'])],
            'q' => ['nullable', 'string', 'max:120'],
            'page' => ['nullable', 'integer', 'min:1'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);

        $payload = $this->serviceTickets->listMaintenance(
            (string) ($data['status'] ?? 'ABIERTO'),
            $data['q'] ?? null,
            (int) ($data['page'] ?? 1),
            (int) ($data['per_page'] ?? 25),
        );

        return response()->json($payload);
    }

    public function recordVisit(Request $request, Incident $incident): JsonResponse
    {
        foreach (['opened_at', 'restored_at', 'closed_at', 'arrived_at', 'departed_at'] as $field) {
            if ($request->input($field) === '') {
                $request->merge([$field => null]);
            }
        }

        $data = $request->validate([
            'opened_at' => ['nullable', 'date'],
            'restored_at' => ['nullable', 'date'],
            'closed_at' => ['nullable', 'date'],
            'arrived_at' => ['nullable', 'date'],
            'departed_at' => ['nullable', 'date'],
            'technician_name' => ['nullable', 'string', 'max:160'],
            'technician_phone' => ['nullable', 'string', 'max:40'],
            'polygon' => ['nullable', 'string', 'max:160'],
            'visit_reason' => ['nullable', 'string', 'max:500'],
            'activities' => ['nullable', 'string', 'max:5000'],
            'materials' => ['nullable', 'string', 'max:5000'],
        ]);

        try {
            $this->serviceTickets->recordVisit($incident, $data, $request->user()?->name);
        } catch (InvalidArgumentException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return $this->show($incident->fresh() ?? $incident);
    }

    public function sameHour(Request $request): JsonResponse
    {
        $window = (int) $request->query('window', 15);

        return response()->json([
            'window_minutes' => max(5, min($window, 60)),
            'data' => $this->sameHour->clusters($window),
        ]);
    }

    public function applySameHour(Request $request): JsonResponse
    {
        $data = $request->validate([
            'incident_ids' => ['required', 'array', 'min:2'],
            'incident_ids.*' => ['integer'],
            'minedu_reason' => ['required', Rule::in(MineduReason::operableValues())],
            'detail' => ['nullable', 'string', 'max:5000'],
        ]);

        try {
            $count = $this->sameHour->applyReason(
                $data['incident_ids'],
                MineduReason::from((string) $data['minedu_reason']),
                $data['detail'] ?? null,
            );
        } catch (InvalidArgumentException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json([
            'updated' => $count,
            'data' => $this->sameHour->clusters(15),
        ]);
    }

    public function clockStop(Request $request, Incident $incident): JsonResponse
    {
        $data = $request->validate([
            'action' => ['required', Rule::in(['start', 'end'])],
        ]);

        try {
            if ($data['action'] === 'start') {
                $this->slaClock->startPause($incident);
            } else {
                $this->slaClock->endPause($incident);
            }
        } catch (InvalidArgumentException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return $this->show($incident->fresh() ?? $incident);
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
            'root_cause_group_code' => ['nullable', 'string', 'max:8'],
            'root_cause_code' => ['nullable', 'string', 'max:16'],
        ]);

        if (array_key_exists('contact_status', $data) && $data['contact_status'] === '') {
            $data['contact_status'] = null;
        }
        if (array_key_exists('contact_result', $data) && $data['contact_result'] === '') {
            $data['contact_result'] = null;
        }

        $groupCode = trim((string) ($data['root_cause_group_code'] ?? ''));
        $causeCode = trim((string) ($data['root_cause_code'] ?? ''));
        if ($groupCode !== '' || $causeCode !== '') {
            try {
                $legend = \App\Domain\Incidents\Support\RootCauseLegend::requirePair($groupCode, $causeCode);
            } catch (InvalidArgumentException $e) {
                return response()->json(['message' => $e->getMessage()], 422);
            }
            $data['root_cause_group_code'] = $legend['group_code'];
            $data['root_cause_code'] = $legend['code'];
            $data['cause'] = $legend['cause'];
            if (in_array($legend['attention'] ?? null, ['PEXT', 'PINT'], true)) {
                $data['management_scope'] = $legend['attention'];
            }
        } elseif (
            array_key_exists('root_cause_group_code', $data)
            || array_key_exists('root_cause_code', $data)
        ) {
            $data['root_cause_group_code'] = null;
            $data['root_cause_code'] = null;
            $data['cause'] = null;
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

    /** Mantener en gestión aunque esté recuperado; re-cae sin ticket nuevo. */
    public function keepManaging(Request $request, Incident $incident): JsonResponse
    {
        $data = $request->validate([
            'observation' => ['nullable', 'string', 'max:5000'],
        ]);

        try {
            $updated = $this->recoveryReviews->keepManaging(
                $incident,
                (int) ($request->user()?->id ?? 0),
                $data['observation'] ?? null,
            );
        } catch (InvalidArgumentException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json($this->show($updated)->getData(true));
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

    /** Cola: recuperados en gestión → pendiente de cierre operativo. */
    public function pendienteCierre(Request $request): JsonResponse
    {
        $rows = Incident::query()
            ->with([
                'school',
                'networkAssignment',
                'sensor',
                'serviceTicket',
                'trackingRecords' => fn ($q) => $q->orderByDesc('id'),
            ])
            ->withCount('managements')
            ->where('followup_status', FollowupStatus::PendienteCierre)
            ->whereNotNull('recovered_at')
            // Ya clasificados a Incidencias / Requerimientos / Mantenimiento no deben aparecer aquí.
            ->whereRaw('NOT (COALESCE(is_grave_incident, false) = true AND grave_closed_at IS NULL)')
            ->whereRaw('NOT (COALESCE(is_requirement_case, false) = true AND requirement_closed_at IS NULL)')
            ->where(function ($q) {
                $q->where(function ($d) {
                    $d->whereNull('detection_source')
                        ->orWhere('detection_source', '!=', Incident::DETECTION_MAINTENANCE);
                })->whereDoesntHave('serviceTicket', function ($t) {
                    $t->where('is_maintenance', true)
                        ->where('status', \App\Models\ServiceTicket::STATUS_OPEN);
                });
            })
            ->orderByDesc('recovered_at')
            ->limit(500)
            ->get()
            ->map(fn (Incident $i) => $this->queueRow($i));

        return response()->json(['data' => $rows]);
    }

    /** Casos graves abiertos. */
    public function graves(Request $request): JsonResponse
    {
        $rows = Incident::query()
            ->with([
                'school',
                'networkAssignment',
                'sensor',
                'serviceTicket',
                'trackingRecords' => fn ($q) => $q->orderByDesc('id'),
            ])
            ->where('is_grave_incident', true)
            ->whereNull('grave_closed_at')
            ->orderByDesc('grave_opened_at')
            ->limit(500)
            ->get()
            ->map(fn (Incident $i) => $this->queueRow($i));

        return response()->json(['data' => $rows]);
    }

    /** Casos con resultado Requerimiento abiertos. */
    public function requerimientos(Request $request): JsonResponse
    {
        $rows = Incident::query()
            ->with([
                'school',
                'networkAssignment',
                'sensor',
                'serviceTicket',
                'trackingRecords' => fn ($q) => $q->orderByDesc('id'),
            ])
            ->where('is_requirement_case', true)
            ->whereNull('requirement_closed_at')
            ->orderByDesc('requirement_opened_at')
            ->limit(500)
            ->get()
            ->map(fn (Incident $i) => $this->queueRow($i));

        return response()->json(['data' => $rows]);
    }

    /** Caídas de enlace parcial (doble WAN) abiertas hasta cierre manual. */
    public function enlaceParcial(Request $request): JsonResponse
    {
        $rows = Incident::query()
            ->with([
                'school',
                'networkAssignment',
                'sensor',
                'serviceTicket',
                'trackingRecords' => fn ($q) => $q->orderByDesc('id'),
            ])
            ->where('detection_source', Incident::DETECTION_MANUAL_PARTIAL)
            ->whereNull('recovered_at')
            ->orderByDesc('started_at')
            ->limit(500)
            ->get()
            ->map(fn (Incident $i) => $this->queueRow($i));

        return response()->json(['data' => $rows]);
    }

    public function markGrave(Request $request, Incident $incident): JsonResponse
    {
        $data = $request->validate([
            'observation' => ['nullable', 'string', 'max:5000'],
        ]);

        if ($incident->isOpenGrave()) {
            return response()->json($this->show($incident)->getData(true));
        }

        $before = $incident->followup_status?->value;
        $payload = [
            'is_grave_incident' => true,
            'grave_opened_at' => now(),
            'grave_opened_by_user_id' => $request->user()?->id,
            'grave_closed_at' => null,
            'last_contact_at' => now(),
        ];
        // Si estaba en Pendiente de cierre, pasa a Incidencias sticky (no se queda en esa cola).
        if ($incident->followup_status === FollowupStatus::PendienteCierre) {
            $payload['followup_status'] = FollowupStatus::EnGestion;
            $payload['recovery_review_status'] = \App\Enums\RecoveryReviewStatus::ContinueMonitoring;
            $payload['recovery_reviewed_at'] = now();
            $payload['reopened_from_management'] = true;
        }
        $incident->update($payload);
        $after = $incident->fresh()?->followup_status?->value ?? $before;

        IncidentUpdate::query()->create([
            'incident_id' => $incident->id,
            'type' => 'MANUAL',
            'status_before' => $before,
            'status_after' => $after,
            'observation' => $data['observation'] ?? 'Marcado como incidencia grave.',
            'user_id' => $request->user()?->id,
            'created_at' => now(),
        ]);

        $this->listaDays->markAverias($incident->fresh() ?? $incident);

        return response()->json($this->show($incident->fresh())->getData(true));
    }

    public function closeGrave(Request $request, Incident $incident): JsonResponse
    {
        $data = $request->validate([
            'observation' => ['nullable', 'string', 'max:5000'],
        ]);

        if (! $incident->is_grave_incident || $incident->grave_closed_at !== null) {
            return response()->json($this->show($incident)->getData(true));
        }

        $userId = (int) ($request->user()?->id ?? 0);
        $result = $this->operativeClose->close(
            $incident,
            $data['observation'] ?? 'Incidencia grave cerrada.',
            $userId,
        );

        $closed = $result['incident'];
        $closed->update([
            'grave_closed_at' => now(),
            'last_contact_at' => now(),
        ]);

        $this->listaDays->markRestablecido($closed->fresh() ?? $closed);

        return response()->json($this->show($closed->fresh() ?? $closed)->getData(true));
    }

    public function closeRequirement(Request $request, Incident $incident): JsonResponse
    {
        $data = $request->validate([
            'observation' => ['nullable', 'string', 'max:5000'],
        ]);

        if (! $incident->is_requirement_case || $incident->requirement_closed_at !== null) {
            return response()->json($this->show($incident)->getData(true));
        }

        $userId = (int) ($request->user()?->id ?? 0);
        $result = $this->operativeClose->close(
            $incident,
            $data['observation'] ?? 'Requerimiento cerrado.',
            $userId,
        );

        $closed = $result['incident'];
        $closed->update([
            'requirement_closed_at' => now(),
            'last_contact_at' => now(),
        ]);

        return response()->json($this->show($closed->fresh() ?? $closed)->getData(true));
    }

    /** Cierre operativo unificado: Tracking (si existe) + incidencia CERRADO. */
    public function closeTicket(Request $request, Incident $incident): JsonResponse
    {
        $data = $request->validate([
            'observation' => ['nullable', 'string', 'max:5000'],
        ]);

        $userId = (int) ($request->user()?->id ?? 0);
        $result = $this->operativeClose->close(
            $incident,
            $data['observation'] ?? null,
            $userId,
        );
        $this->serviceTickets->close($result['incident'], $request->user()?->name);
        // Restablecido en Lista LLEE solo al cerrar desde Incidencias (closeGrave),
        // no al cerrar caídas normales / Pendiente de cierre solo porque PRTG subió.

        return response()->json($this->show($result['incident']->fresh() ?? $result['incident'])->getData(true));
    }

    /**
     * @return array<string, mixed>
     */
    private function queueRow(Incident $incident): array
    {
        $school = $incident->school;
        $assignment = $incident->networkAssignment;
        $tracking = $incident->trackingRecords->first();
        $location = PrtgOperationalLocation::apiFields($assignment, $school);
        $downClock = $incident->prtg_down_started_at ?? $incident->started_at;

        $managementsCount = (int) ($incident->managements_count
            ?? $incident->managements()->count());
        $gestionLista = $incident->followup_status === FollowupStatus::PendienteCierre
            && (
                $managementsCount > 0
                || filled($incident->detail_text)
                || filled($incident->root_cause_code)
                || filled($incident->cause)
            );

        return [
            'incident_id' => $incident->id,
            'school_id' => $incident->school_id,
            'assignment_id' => $incident->network_assignment_id,
            'cid' => $assignment?->cid,
            'tss' => $school?->current_sequence,
            'local_educativo' => $school?->local_educativo,
            'codigo_local' => $school?->codigo_local,
            ...$location,
            'tecnologia' => $assignment?->tecnologia_acceso,
            'followup_status' => $incident->followup_status?->value,
            'gestion_lista' => $gestionLista,
            'managements_count' => $managementsCount,
            'started_at' => $incident->started_at?->toIso8601String(),
            'recovered_at' => $incident->recovered_at?->toIso8601String(),
            'current_down_started_at' => $downClock?->toIso8601String(),
            'is_grave_incident' => $incident->isOpenGrave(),
            'grave_opened_at' => $incident->grave_opened_at?->toIso8601String(),
            'is_requirement_case' => $incident->isOpenRequirement(),
            'requirement_opened_at' => $incident->requirement_opened_at?->toIso8601String(),
            'estado_prtg' => $incident->current_status,
            'detection_source' => $incident->detection_source,
            'is_link_outage' => $incident->isManualPartial(),
            'affected_wan_node' => $incident->affected_wan_node?->value
                ?? (is_string($incident->affected_wan_node) ? $incident->affected_wan_node : null),
            'affected_wan_label' => $incident->affected_wan_node instanceof \App\Enums\AffectedWanNode
                ? $incident->affected_wan_node->label()
                : null,
            'responsible_area' => $incident->responsible_area,
            'glpi_ticket' => $incident->glpi_ticket,
            'ticket_code' => $incident->serviceTicket?->ticket_code,
            'ticket_kind' => $incident->serviceTicket?->kind,
            'ticket_kind_label' => $incident->serviceTicket
                ? \App\Models\ServiceTicket::kindLabel($incident->serviceTicket->kind)
                : null,
            'has_ticket' => $incident->serviceTicket !== null,
            'tracking' => $tracking ? [
                'id' => $tracking->id,
                'status' => $tracking->status?->value,
                'status_label' => $tracking->status?->label(),
                'ticket' => $tracking->report_ticket ?? $tracking->ticket,
            ] : null,
        ];
    }

    /**
     * @param  array<string, mixed>  $data
     */
    private function applyOpeningGestion(Incident $incident, array $data, ?string $actor): void
    {
        $hadCause = filled($incident->root_cause_code);
        $row = null;
        $scope = $incident->management_scope;
        $groupIn = trim((string) ($data['root_cause_group_code'] ?? ''));
        $causeIn = trim((string) ($data['root_cause_code'] ?? ''));
        $hasCausePair = $groupIn !== '' && $causeIn !== '';

        // Causa opcional (Requerimientos u otros); si viene el par, se aplica o actualiza.
        if ($hasCausePair) {
            try {
                $row = RootCauseLegend::requirePair($groupIn, $causeIn);
                $scope = in_array($row['attention'], ['PEXT', 'PINT'], true)
                    ? ManagementScope::from((string) $row['attention'])
                    : $incident->management_scope;
                $incident->fill([
                    'root_cause_group_code' => $row['group_code'],
                    'root_cause_code' => $row['code'],
                    'cause' => $row['cause'],
                    'management_scope' => $scope,
                ]);
            } catch (InvalidArgumentException $e) {
                if (! $hadCause) {
                    throw $e;
                }
                $row = null;
            }
        }

        $detail = trim((string) ($data['detail'] ?? ''));
        if ($detail !== '') {
            $incident->detail_text = $detail;
        }

        $mineduProvided = array_key_exists('minedu_reason', $data) && $data['minedu_reason'] !== null && $data['minedu_reason'] !== '';
        $minedu = $mineduProvided
            ? MineduReason::from((string) $data['minedu_reason'])
            : ($incident->minedu_reason instanceof MineduReason ? $incident->minedu_reason : null);

        if ($mineduProvided) {
            $incident->minedu_reason = $minedu;
            $incident->management_classification = $minedu->toManagementClassification();
        }

        $incident->save();

        $userId = (int) (request()->user()?->id ?? 0);
        // Queja / Caída de enlace → Incidencias; Requerimiento → Requerimientos (también al reusar caso).
        if ($minedu instanceof MineduReason && $minedu->marksAsIncident()) {
            if ($incident->isOpenRequirement()) {
                $incident->forceFill(['requirement_closed_at' => now()])->save();
            }
            if (! $incident->isOpenGrave()) {
                $incident->forceFill([
                    'is_grave_incident' => true,
                    'grave_opened_at' => now(),
                    'grave_opened_by_user_id' => $userId > 0 ? $userId : null,
                    'grave_closed_at' => null,
                ])->save();
                $this->listaDays->markAverias($incident->fresh() ?? $incident);
            }
            $this->leavePendienteCierreIfNeeded($incident->fresh() ?? $incident);
        } elseif ($minedu instanceof MineduReason && $minedu->marksAsRequirement()) {
            if ($incident->isOpenGrave()) {
                $incident->forceFill(['grave_closed_at' => now()])->save();
            }
            if (! $incident->isOpenRequirement()) {
                $incident->forceFill([
                    'is_requirement_case' => true,
                    'requirement_opened_at' => now(),
                    'requirement_opened_by_user_id' => $userId > 0 ? $userId : null,
                    'requirement_closed_at' => null,
                ])->save();
            }
            $this->listaDays->markRequerimiento($incident->fresh() ?? $incident);
            $this->leavePendienteCierreIfNeeded($incident->fresh() ?? $incident);
        }

        $causeLabel = $row
            ? ($row['code'].' · '.$row['cause'])
            : ((string) ($incident->root_cause_code ?? '').' · '.(string) ($incident->cause ?? ''));
        $obsParts = [
            $hadCause ? 'Seguimiento al reutilizar ticket abierto.' : 'Causa raíz marcada al abrir el ticket.',
            trim($causeLabel) !== '·' ? $causeLabel : null,
            $mineduProvided && $minedu ? 'MINEDU: '.$minedu->label() : null,
        ];

        IncidentManagement::query()->create([
            'incident_id' => $incident->id,
            'classification' => $incident->management_classification instanceof ManagementClassification
                ? $incident->management_classification->value
                : (string) ($incident->management_classification ?: ManagementClassification::Unclassified->value),
            'scope' => $scope instanceof ManagementScope ? $scope->value : $scope,
            'detail' => $incident->detail_text,
            'observation' => implode(' ', array_filter($obsParts)),
            'created_by' => request()->user()?->id,
        ]);

        $fresh = $incident->fresh() ?? $incident;
        $this->serviceTickets->syncFromIncident($fresh, $actor);
        $causeCode = (string) ($fresh->root_cause_code ?? ($row['code'] ?? ''));
        if (\App\Models\ServiceTicket::isMaintenanceCause($causeCode)) {
            $this->serviceTickets->markMaintenance($fresh);
        }
    }

    private function leavePendienteCierreIfNeeded(Incident $incident): void
    {
        if ($incident->followup_status !== FollowupStatus::PendienteCierre) {
            return;
        }
        if (! $incident->isOpenGrave() && ! $incident->isOpenRequirement() && ! $incident->isOpenMaintenance()) {
            return;
        }
        $incident->forceFill([
            'followup_status' => FollowupStatus::EnGestion,
            'recovery_review_status' => \App\Enums\RecoveryReviewStatus::ContinueMonitoring,
            'recovery_reviewed_at' => now(),
            'reopened_from_management' => true,
            'last_contact_at' => now(),
        ])->save();
    }

    /**
     * @return array<string, mixed>|null
     */
    private function openCaseSummaryForAssignment(int $assignmentId): ?array
    {
        $incident = Incident::query()
            ->with('serviceTicket')
            ->where('network_assignment_id', $assignmentId)
            ->where('followup_status', '!=', FollowupStatus::Cerrado->value)
            ->orderByDesc('id')
            ->first();

        if ($incident === null) {
            return null;
        }

        $location = 'En gestión';
        if ($incident->isOpenGrave()) {
            $location = 'Incidencias';
        } elseif ($incident->isOpenRequirement()) {
            $location = 'Requerimientos';
        } elseif ($incident->isOpenMaintenance()) {
            $location = 'Mantenimientos';
        } elseif ($incident->followup_status === FollowupStatus::PendienteCierre) {
            $location = 'Pendiente de cierre';
        } elseif ($incident->followup_status === FollowupStatus::PendienteContacto) {
            $location = 'Pendientes de gestión';
        } elseif ($incident->recovered_at === null) {
            $location = 'Caídas totales / En gestión';
        }

        return [
            'incident_id' => $incident->id,
            'followup_status' => $incident->followup_status?->value,
            'followup_label' => $incident->followup_status?->label(),
            'ticket_code' => $incident->serviceTicket?->ticket_code,
            'location' => $location,
            'is_grave' => $incident->isOpenGrave(),
            'is_requirement' => $incident->isOpenRequirement(),
            'is_maintenance' => $incident->isOpenMaintenance(),
            'message' => 'Este colegio ya tiene un caso abierto en '.$location
                .($incident->serviceTicket?->ticket_code ? ' ('.$incident->serviceTicket->ticket_code.')' : '')
                .'. Al generar se reutiliza ese ticket; no se crea uno nuevo.',
        ];
    }

    private function forceMarkGrave(Incident $incident, int $userId): void
    {
        if ($incident->isOpenGrave()) {
            return;
        }

        $incident->forceFill([
            'is_grave_incident' => true,
            'grave_opened_at' => $incident->grave_opened_at ?? now(),
            'grave_opened_by_user_id' => $incident->grave_opened_by_user_id ?? ($userId > 0 ? $userId : null),
            'grave_closed_at' => null,
        ])->save();

        $this->listaDays->markAverias($incident->fresh() ?? $incident);
    }

    /**
     * Etiqueta visible del historial: «Caída de enlace» / Requerimiento / Queja solo si hay razón MINEDU.
     * Comentarios viejos guardados por error como CONTACT_CONFIRMED se muestran como Seguimiento.
     */
    private function managementDisplayClassification(
        ?ManagementClassification $classification,
        Incident $incident,
    ): ?ManagementClassification {
        if ($classification === null) {
            return null;
        }

        $minedu = $incident->minedu_reason instanceof MineduReason ? $incident->minedu_reason : null;

        $isMineduBadge = match ($classification) {
            ManagementClassification::ContactConfirmed => $minedu === MineduReason::CaidaEnlace,
            ManagementClassification::LinkOutage => $minedu === MineduReason::Requerimiento,
            ManagementClassification::Complaint => $minedu === MineduReason::Queja,
            default => true,
        };

        return $isMineduBadge ? $classification : ManagementClassification::FollowUp;
    }

    private function managementDisplayLabel(
        ?ManagementClassification $classification,
        Incident $incident,
    ): string {
        return $this->managementDisplayClassification($classification, $incident)?->label()
            ?? ManagementClassification::FollowUp->label();
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
