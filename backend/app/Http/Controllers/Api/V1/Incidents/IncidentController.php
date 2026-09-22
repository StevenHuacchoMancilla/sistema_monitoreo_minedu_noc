<?php

namespace App\Http\Controllers\Api\V1\Incidents;

use App\Enums\ContactConfirmedStatus;
use App\Enums\ContactResult;
use App\Enums\FollowupStatus;
use App\Enums\ManagementClassification;
use App\Enums\ManagementScope;
use App\Domain\Incidents\Services\IncidentManagementService;
use App\Http\Controllers\Controller;
use App\Models\Incident;
use App\Models\IncidentUpdate;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use InvalidArgumentException;

class IncidentController extends Controller
{
    public function __construct(private readonly IncidentManagementService $managements) {}

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
        $incident->load(['school.contacts', 'networkAssignment', 'sensor', 'updates', 'managements']);

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

        $durationHuman = $incident->started_at
            ? $incident->started_at->diffForHumans($incident->recovered_at ?? now(), true)
            : null;

        $elapsedSeconds = $incident->started_at
            ? $incident->started_at->diffInSeconds($incident->recovered_at ?? now())
            : null;

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
            ],
            'colegio' => [
                'school_id' => $school?->id,
                'local_educativo' => $school?->local_educativo,
                'codigo_local' => $school?->codigo_local,
                'codigo_modular' => $school?->codigo_modular,
                'departamento' => $school?->departamento,
                'provincia' => $school?->provincia,
                'distrito' => $school?->distrito,
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
            ],
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
            ],
            'historial' => $history->map(fn (Incident $row) => [
                'id' => $row->id,
                'started_at' => $row->started_at?->toIso8601String(),
                'recovered_at' => $row->recovered_at?->toIso8601String(),
                'duracion' => $row->started_at
                    ? $row->started_at->diffForHumans($row->recovered_at ?? now(), true)
                    : null,
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
                'created_at' => $m->created_at?->toIso8601String(),
            ])->values()->all(),
            'updates' => $incident->updates,
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
                    ManagementClassification::NoResponse,
                    ManagementClassification::Complaint,
                ])->map(fn (ManagementClassification $s) => [
                    'value' => $s->value,
                    'label' => $s->label(),
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

    public function storeManagement(Request $request, Incident $incident): JsonResponse
    {
        $data = $request->validate([
            'classification' => ['required', Rule::in([
                ManagementClassification::ContactConfirmed->value,
                ManagementClassification::NoResponse->value,
                ManagementClassification::Complaint->value,
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

        try {
            $this->managements->apply($incident, $data);
        } catch (InvalidArgumentException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json(
            $this->show($incident->fresh())->getData(true)
        );
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
        if ($touchedGestion !== []) {
            $incident->last_contact_at = now();
        }

        if (($data['followup_status'] ?? null) === FollowupStatus::Recuperado->value
            || ($data['followup_status'] ?? null) === FollowupStatus::Cerrado->value) {
            if ($incident->recovered_at === null) {
                $incident->recovered_at = now();
            }
        }

        $incident->save();

        $observationParts = array_filter([
            $data['diagnosis'] ?? null,
            $data['evidence_observations'] ?? null,
            isset($data['glpi_ticket']) ? 'GLPI: '.$data['glpi_ticket'] : null,
            isset($data['responsible_area']) ? 'Responsable: '.$data['responsible_area'] : null,
        ]);

        if (($data['followup_status'] ?? null) && $data['followup_status'] !== $before) {
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
                'status_after' => $incident->followup_status?->value,
                'observation' => implode(' | ', $observationParts),
                'created_at' => now(),
            ]);
        }

        return response()->json(
            $this->show($incident->fresh())->getData(true)
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
