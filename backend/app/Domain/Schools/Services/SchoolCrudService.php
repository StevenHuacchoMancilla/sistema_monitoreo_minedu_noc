<?php

namespace App\Domain\Schools\Services;

use App\Enums\AuditModule;
use App\Enums\AuditSource;
use App\Enums\CidStatus;
use App\Enums\RecordSource;
use App\Models\AuditLog;
use App\Models\NetworkAssignment;
use App\Models\School;
use App\Models\SchoolContact;
use App\Services\AuditLogger;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Arr;

class SchoolCrudService
{
    public function __construct(private readonly AuditLogger $audit) {}

    /**
     * @param  array<string, mixed>  $filters
     */
    public function list(array $filters): LengthAwarePaginator
    {
        $query = School::query()->with(['activeAssignment', 'contacts']);

        if (DB::getDriverName() === 'sqlite') {
            $query->orderByRaw('CASE WHEN current_sequence IS NULL THEN 1 ELSE 0 END')
                ->orderBy('current_sequence')
                ->orderBy('local_educativo');
        } else {
            $query->orderByRaw('current_sequence nulls last')
                ->orderBy('local_educativo');
        }

        if (($filters['active'] ?? null) === '0' || ($filters['active'] ?? null) === 'false') {
            $query->where('active', false);
        } elseif (($filters['active'] ?? null) !== 'all') {
            $query->where('active', true);
        }

        if (! empty($filters['provincia'])) {
            $query->whereRaw('UPPER(provincia) = ?', [mb_strtoupper((string) $filters['provincia'])]);
        }
        if (! empty($filters['distrito'])) {
            $query->whereRaw('UPPER(distrito) = ?', [mb_strtoupper((string) $filters['distrito'])]);
        }
        if (! empty($filters['tecnologia'])) {
            $tech = '%'.mb_strtolower((string) $filters['tecnologia']).'%';
            $query->whereHas('activeAssignment', fn ($a) => $a->whereRaw('LOWER(tecnologia_acceso) like ?', [$tech]));
        }

        if (! empty($filters['q'])) {
            $term = '%'.mb_strtolower((string) $filters['q']).'%';
            $query->where(function ($q) use ($term) {
                $q->whereRaw('LOWER(local_educativo) like ?', [$term])
                    ->orWhereRaw('LOWER(codigo_local) like ?', [$term])
                    ->orWhereRaw('LOWER(COALESCE(codigo_modular, \'\')) like ?', [$term])
                    ->orWhereRaw('LOWER(COALESCE(legacy_reference, \'\')) like ?', [$term])
                    ->orWhereHas('activeAssignment', fn ($a) => $a->whereRaw('LOWER(COALESCE(cid, \'\')) like ?', [$term]));
            });
        }

        return $query->paginate((int) ($filters['per_page'] ?? 25));
    }

    /**
     * Catálogo completo para filtros (no depende de la página paginada).
     *
     * @return array{
     *   provincias: list<string>,
     *   distritos: list<string>,
     *   tecnologias: list<string>,
     *   stats: array{total: int, active: int, with_cid: int, without_cid: int}
     * }
     */
    public function catalog(?string $provincia = null, string $active = '1'): array
    {
        $base = School::query();
        if ($active === '0' || $active === 'false') {
            $base->where('active', false);
        } elseif ($active !== 'all') {
            $base->where('active', true);
        }

        $provincias = (clone $base)
            ->whereNotNull('provincia')
            ->where('provincia', '!=', '')
            ->distinct()
            ->orderBy('provincia')
            ->pluck('provincia')
            ->map(fn ($v) => (string) $v)
            ->values()
            ->all();

        $districtQuery = (clone $base)
            ->whereNotNull('distrito')
            ->where('distrito', '!=', '');
        if ($provincia !== null && $provincia !== '') {
            $districtQuery->whereRaw('UPPER(provincia) = ?', [mb_strtoupper($provincia)]);
        }
        $distritos = $districtQuery
            ->distinct()
            ->orderBy('distrito')
            ->pluck('distrito')
            ->map(fn ($v) => (string) $v)
            ->values()
            ->all();

        $tecnologias = NetworkAssignment::query()
            ->where('is_active', true)
            ->whereNotNull('tecnologia_acceso')
            ->where('tecnologia_acceso', '!=', '')
            ->distinct()
            ->orderBy('tecnologia_acceso')
            ->pluck('tecnologia_acceso')
            ->map(fn ($v) => (string) $v)
            ->values()
            ->all();

        $total = (clone $base)->count();
        $withCid = (clone $base)->whereHas('activeAssignment', function ($q) {
            $q->whereNotNull('cid')->where('cid', '!=', '');
        })->count();

        return [
            'provincias' => $provincias,
            'distritos' => $distritos,
            'tecnologias' => $tecnologias,
            'stats' => [
                'total' => $total,
                'active' => (clone $base)->where('active', true)->count(),
                'with_cid' => $withCid,
                'without_cid' => max(0, $total - $withCid),
            ],
        ];
    }

    /**
     * @param  array<string, mixed>  $data
     */
    public function create(array $data): School
    {
        return DB::transaction(function () use ($data) {
            $school = School::query()->create([
                ...Arr::only($data, [
                    'current_sequence',
                    'legacy_reference',
                    'codigo_local',
                    'codigo_modular',
                    'local_educativo',
                    'departamento',
                    'provincia',
                    'distrito',
                    'centro_poblado',
                    'clasificacion',
                    'nivel_iiee',
                    'latitud',
                    'longitud',
                ]),
                'active' => true,
                'source' => RecordSource::Manual->value,
            ]);

            $this->audit->record($school, 'SCHOOL_CREATED', null, $school->toArray(), AuditModule::Schools, AuditSource::Api);

            if (! empty($data['cid']) || ! empty($data['prtg_device_name'])) {
                $this->createAssignment($school, Arr::only($data, [
                    'cid',
                    'prtg_device_name',
                    'capacidad_mbps',
                    'tecnologia_acceso',
                    'nodo_pop',
                    'ip_publica',
                    'ip_loopback',
                    'ip_wan_principal',
                    'ip_lan',
                    'gateway_wan',
                    'vlan_internet',
                    'vlan_uplink',
                ]), historical: false);
            }

            return $school->fresh(['activeAssignment', 'contacts']);
        });
    }

    /**
     * @param  array<string, mixed>  $data
     */
    public function updateGeneral(School $school, array $data): School
    {
        $before = $school->only([
            'current_sequence',
            'legacy_reference',
            'codigo_local',
            'codigo_modular',
            'local_educativo',
            'departamento',
            'provincia',
            'distrito',
            'centro_poblado',
            'clasificacion',
            'nivel_iiee',
            'latitud',
            'longitud',
            'active',
        ]);

        $school->fill(Arr::only($data, array_keys($before)))->save();

        $this->audit->record($school, 'SCHOOL_UPDATED', $before, $school->only(array_keys($before)), AuditModule::Schools, AuditSource::Api);

        return $school->fresh(['activeAssignment', 'contacts']);
    }

    public function deactivate(School $school): School
    {
        $before = ['active' => $school->active];
        $school->update(['active' => false]);
        $this->audit->record($school, 'SCHOOL_DEACTIVATED', $before, ['active' => false], AuditModule::Schools, AuditSource::Api);

        return $school->fresh();
    }

    public function reactivate(School $school): School
    {
        $before = ['active' => $school->active];
        $school->update(['active' => true]);
        $this->audit->record($school, 'SCHOOL_REACTIVATED', $before, ['active' => true], AuditModule::Schools, AuditSource::Api);

        return $school->fresh();
    }

    /**
     * Corrección tipográfica / campos técnicos sin reasignación histórica.
     *
     * @param  array<string, mixed>  $data
     */
    public function updateAssignmentInPlace(NetworkAssignment $assignment, array $data): NetworkAssignment
    {
        $fields = [
            'cid',
            'prtg_device_name',
            'capacidad_mbps',
            'tecnologia_acceso',
            'nodo_pop',
            'ip_publica',
            'ip_loopback',
            'ip_wan_principal',
            'netmask_wan_principal',
            'ip_lan',
            'gateway_wan',
            'vlan_internet',
            'vlan_uplink',
            'vlan_mgmt_ap',
            'ip_mgmt_ap',
            'observaciones',
        ];

        $before = $assignment->only($fields);
        $assignment->fill(Arr::only($data, $fields))->save();
        $this->audit->record($assignment, 'ASSIGNMENT_CORRECTED', $before, $assignment->only($fields), AuditModule::NetworkAssignments, AuditSource::Api);

        return $assignment->fresh();
    }

    /**
     * Reasignación histórica de CID: cierra la actual y crea una nueva.
     *
     * @param  array<string, mixed>  $data
     */
    public function reassignCid(School $school, array $data): NetworkAssignment
    {
        return DB::transaction(function () use ($school, $data) {
            $current = $school->activeAssignment;
            if ($current) {
                $before = $current->only(['cid', 'is_active', 'valid_from', 'valid_to']);
                $current->update([
                    'is_active' => false,
                    'valid_to' => now(),
                ]);
                $this->audit->record($current, 'ASSIGNMENT_CLOSED', $before, [
                    'cid' => $current->cid,
                    'is_active' => false,
                    'valid_to' => now()->toIso8601String(),
                ], AuditModule::NetworkAssignments, AuditSource::Api);
            }

            return $this->createAssignment($school, $data, historical: true);
        });
    }

    /**
     * @param  array<string, mixed>  $data
     */
    public function upsertContact(School $school, array $data, ?SchoolContact $contact = null): SchoolContact
    {
        $payload = [
            'position' => (int) ($data['position'] ?? 1),
            'name' => $data['name'] ?? null,
            'role' => $data['role'] ?? null,
            'phone' => isset($data['phone']) ? (string) $data['phone'] : null,
            'validation_status' => $data['validation_status'] ?? null,
            'source' => RecordSource::Manual->value,
        ];

        if ($contact) {
            $before = $contact->only(['position', 'name', 'role', 'phone', 'validation_status']);
            $contact->fill($payload)->save();
            $this->audit->record($contact, 'CONTACT_UPDATED', $before, $contact->only(array_keys($before)), AuditModule::Contacts, AuditSource::Api);

            return $contact->fresh();
        }

        $created = $school->contacts()->create($payload);
        $this->audit->record($created, 'CONTACT_CREATED', null, $created->toArray(), AuditModule::Contacts, AuditSource::Api);

        return $created;
    }

    public function deactivateContact(SchoolContact $contact): void
    {
        $before = $contact->toArray();
        $contact->delete();
        $this->audit->record($contact, 'CONTACT_DEACTIVATED', $before, null, AuditModule::Contacts, AuditSource::Api);
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function auditTrail(School $school, int $limit = 50): array
    {
        $assignmentIds = $school->networkAssignments()->pluck('id')->all();
        $contactIds = $school->contacts()->withTrashed()->pluck('id')->all();

        return AuditLog::query()
            ->with('user:id,name,email')
            ->where(function ($q) use ($school, $assignmentIds, $contactIds) {
                $q->where(function ($inner) use ($school) {
                    $inner->where('entity_type', School::class)
                        ->where('entity_id', $school->id);
                });
                if ($assignmentIds !== []) {
                    $q->orWhere(function ($inner) use ($assignmentIds) {
                        $inner->where('entity_type', NetworkAssignment::class)
                            ->whereIn('entity_id', $assignmentIds);
                    });
                }
                if ($contactIds !== []) {
                    $q->orWhere(function ($inner) use ($contactIds) {
                        $inner->where('entity_type', SchoolContact::class)
                            ->whereIn('entity_id', $contactIds);
                    });
                }
            })
            ->orderByDesc('id')
            ->limit($limit)
            ->get()
            ->map(fn (AuditLog $log) => [
                'id' => $log->id,
                'entity_type' => class_basename((string) $log->entity_type),
                'entity_id' => $log->entity_id,
                'action' => $log->action,
                'module' => $log->module,
                'before' => $log->before_json,
                'after' => $log->after_json,
                'source' => $log->source,
                'user_id' => $log->user_id,
                'user_name' => $log->user?->name,
                'ip_address' => $log->ip_address,
                'created_at' => $log->created_at?->toIso8601String(),
            ])
            ->all();
    }

    /**
     * @param  array<string, mixed>  $data
     */
    private function createAssignment(School $school, array $data, bool $historical): NetworkAssignment
    {
        $assignment = NetworkAssignment::query()->create([
            'school_id' => $school->id,
            'cid' => $data['cid'] ?? null,
            'cid_status' => ! empty($data['cid']) ? CidStatus::Valid : CidStatus::Empty,
            'monitoring_eligible' => ! empty($data['cid']),
            'prtg_device_name' => $data['prtg_device_name'] ?? null,
            'capacidad_mbps' => $data['capacidad_mbps'] ?? null,
            'tecnologia_acceso' => $data['tecnologia_acceso'] ?? null,
            'nodo_pop' => $data['nodo_pop'] ?? null,
            'ip_publica' => $data['ip_publica'] ?? null,
            'ip_loopback' => $data['ip_loopback'] ?? null,
            'ip_wan_principal' => $data['ip_wan_principal'] ?? null,
            'ip_lan' => $data['ip_lan'] ?? null,
            'gateway_wan' => $data['gateway_wan'] ?? null,
            'vlan_internet' => $data['vlan_internet'] ?? null,
            'vlan_uplink' => $data['vlan_uplink'] ?? null,
            'is_active' => true,
            'valid_from' => now(),
            'source' => RecordSource::Manual->value,
        ]);

        $this->audit->record(
            $assignment,
            $historical ? 'ASSIGNMENT_REASSIGNED' : 'ASSIGNMENT_CREATED',
            null,
            $assignment->toArray(),
            AuditModule::NetworkAssignments,
            AuditSource::Api
        );

        return $assignment;
    }
}
