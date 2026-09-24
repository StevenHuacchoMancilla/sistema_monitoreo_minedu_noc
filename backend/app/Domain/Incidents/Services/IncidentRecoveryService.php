<?php

namespace App\Domain\Incidents\Services;

use App\Domain\Incidents\Support\IncidentCaseStatus;
use App\Domain\Incidents\Support\OutageDuration;
use App\Domain\Monitoring\PRTG\Support\PrtgOperationalLocation;
use App\Enums\FieldDispatchStatus;
use App\Enums\FollowupStatus;
use App\Enums\ManagementClassification;
use App\Enums\ManagementScope;
use App\Enums\RecoveryReviewStatus;
use App\Models\FieldDispatch;
use App\Models\Incident;
use App\Models\IncidentUpdate;
use App\Models\TrackingRecord;
use App\Support\OperationalTime;
use Carbon\Carbon;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

class IncidentRecoveryService
{
    /** Columnas mínimas que necesita recoveryFlags() + métricas del resumen. */
    private const FLAG_COLUMNS = [
        'id', 'started_at', 'recovered_at', 'management_classification',
        'recovered_while_managing', 'recovery_review_status',
    ];

    /**
     * Relaciones proyectadas para calcular flags sin consultas por fila.
     *
     * @return array<string, \Closure>
     */
    private function flagRelations(): array
    {
        return [
            'updates' => fn ($q) => $q
                ->select(['id', 'incident_id', 'type', 'status_before', 'status_after'])
                ->orderByDesc('id'),
            'fieldDispatches' => fn ($q) => $q->select(['id', 'incident_id', 'status']),
        ];
    }

    /**
     * @param  array<string, mixed>  $filters
     * @return array{data: list<array<string, mixed>>, meta: array<string, int>, filters: array<string, mixed>}
     */
    public function list(array $filters): array
    {
        [$from, $to] = $this->resolveDateRange($filters);
        $perPage = (int) ($filters['per_page'] ?? 25);
        $perPage = in_array($perPage, [10, 25, 50, 100], true) ? $perPage : 25;

        $query = $this->baseQuery($from, $to, $filters)
            ->with([
                'school:id,local_educativo,codigo_local,provincia,distrito',
                'networkAssignment:id,cid,tecnologia_acceso,prtg_province,prtg_district',
                'trackingRecords' => fn ($q) => $q
                    ->select(['id', 'incident_id', 'status', 'report_ticket', 'ticket', 'closed_by_user_id', 'closed_by_legacy_name'])
                    ->orderByDesc('id'),
                'trackingRecords.closedBy:id,name',
                ...$this->flagRelations(),
            ])
            ->withCount('managements');

        [$sort, $direction] = $this->resolveSort($filters);
        $query->orderBy($sort, $direction)->orderBy('id', $direction);

        /** @var LengthAwarePaginator $page */
        $page = $query->paginate($perPage);

        $rows = collect($page->items())->map(fn (Incident $incident) => $this->mapRow($incident))->values()->all();

        return [
            'data' => $rows,
            'meta' => [
                'current_page' => $page->currentPage(),
                'last_page' => $page->lastPage(),
                'per_page' => $page->perPage(),
                'total' => $page->total(),
            ],
            'filters' => [
                'date_from' => $this->localDay($from),
                'date_to' => $this->localDay($to),
                'preset' => $filters['preset'] ?? 'today',
                ...$this->locationCatalog(isset($filters['provincia']) ? (string) $filters['provincia'] : null),
                'classifications' => collect(ManagementClassification::cases())
                    ->map(fn (ManagementClassification $c) => ['value' => $c->value, 'label' => $c->label()])
                    ->values()
                    ->all(),
                'scopes' => collect(ManagementScope::cases())
                    ->map(fn (ManagementScope $s) => ['value' => $s->value, 'label' => $s->label()])
                    ->values()
                    ->all(),
            ],
        ];
    }

    /**
     * @param  array<string, mixed>  $filters
     * @return array<string, mixed>
     */
    public function summary(array $filters = []): array
    {
        [$from, $to] = $this->resolveDateRange($filters);

        $inPeriod = $this->baseQuery($from, $to, $filters)
            ->select(self::FLAG_COLUMNS)
            ->with($this->flagRelations())
            ->get();
        $flags = $inPeriod->mapWithKeys(fn (Incident $i) => [$i->id => $this->recoveryFlags($i)]);

        $localNow = OperationalTime::now();
        $todayFrom = OperationalTime::dayStart($localNow);
        $todayTo = OperationalTime::dayEnd($localNow);
        $weekFrom = OperationalTime::dayStart($localNow->copy()->startOfWeek());
        $weekTo = OperationalTime::dayEnd($localNow->copy()->endOfWeek());

        $counts = Incident::query()
            ->whereNotNull('recovered_at')
            ->where('recovered_at', '>=', $weekFrom)
            ->selectRaw(
                'sum(case when recovered_at between ? and ? then 1 else 0 end) as today',
                [$todayFrom, $todayTo]
            )
            ->selectRaw(
                'sum(case when recovered_at between ? and ? then 1 else 0 end) as week',
                [$weekFrom, $weekTo]
            )
            ->toBase()
            ->first();

        $recoveredToday = (int) ($counts->today ?? 0);
        $recoveredWeek = (int) ($counts->week ?? 0);

        $duringManagement = $flags->filter(fn (array $f) => $f['recovered_during_management'])->count();
        $withActiveDispatch = $flags->filter(fn (array $f) => $f['had_field_tech'])->count();
        $sameDay = $flags->filter(fn (array $f) => $f['same_day'])->count();
        $withContact = $inPeriod->filter(
            fn (Incident $i) => $i->management_classification === ManagementClassification::ContactConfirmed
                || $i->management_classification === ManagementClassification::Complaint
        )->count();
        $withoutContact = $inPeriod->filter(
            fn (Incident $i) => $i->management_classification === ManagementClassification::NoResponse
                || $i->management_classification === ManagementClassification::NewOutage
                || $i->management_classification === ManagementClassification::Unclassified
                || $i->management_classification === null
        )->count();

        return [
            'date_from' => $this->localDay($from),
            'date_to' => $this->localDay($to),
            'recovered_today' => $recoveredToday,
            'recovered_this_week' => $recoveredWeek,
            'recovered_in_period' => $inPeriod->count(),
            'recovered_during_management' => $duringManagement,
            'recovered_with_field_tech' => $withActiveDispatch,
            'same_day_recoveries' => $sameDay,
            'recovered_with_contact' => $withContact,
            'recovered_without_contact' => $withoutContact,
        ];
    }

    /**
     * @param  array<string, mixed>  $filters
     * @return array{0: Carbon, 1: Carbon}
     */
    private function resolveDateRange(array $filters): array
    {
        $preset = (string) ($filters['preset'] ?? 'today');

        if (! empty($filters['date_from']) || ! empty($filters['date_to'])) {
            $fromDay = (string) ($filters['date_from'] ?: $filters['date_to']);
            $toDay = (string) ($filters['date_to'] ?: $filters['date_from']);

            return [OperationalTime::dayStart($fromDay), OperationalTime::dayEnd($toDay)];
        }

        $today = OperationalTime::now();

        return match ($preset) {
            'yesterday' => [OperationalTime::dayStart($today->copy()->subDay()), OperationalTime::dayEnd($today->copy()->subDay())],
            'last_7_days' => [OperationalTime::dayStart($today->copy()->subDays(6)), OperationalTime::dayEnd($today)],
            'this_month' => [OperationalTime::dayStart($today->copy()->startOfMonth()), OperationalTime::dayEnd($today)],
            default => [OperationalTime::dayStart($today), OperationalTime::dayEnd($today)],
        };
    }

    /**
     * Orden server-side antes de paginar; default recovered_at DESC, id DESC.
     *
     * @param  array<string, mixed>  $filters
     * @return array{0: string, 1: 'asc'|'desc'}
     */
    private function resolveSort(array $filters): array
    {
        $sort = in_array($filters['sort'] ?? null, ['recovered_at', 'started_at'], true)
            ? (string) $filters['sort']
            : 'recovered_at';
        $direction = strtolower((string) ($filters['direction'] ?? '')) === 'asc' ? 'asc' : 'desc';

        return [$sort, $direction];
    }

    /** Fecha local (YYYY-MM-DD) de un límite almacenado en UTC, para eco en filtros. */
    private function localDay(Carbon $bound): string
    {
        return (string) OperationalTime::localDate($bound);
    }

    /**
     * @param  array<string, mixed>  $filters
     */
    private function baseQuery(Carbon $from, Carbon $to, array $filters): Builder
    {
        $query = Incident::query()
            ->whereNotNull('recovered_at')
            ->whereBetween('recovered_at', [$from, $to]);

        if (! empty($filters['search']) || ! empty($filters['q'])) {
            $term = '%'.mb_strtolower((string) ($filters['search'] ?? $filters['q'])).'%';
            $query->where(function (Builder $q) use ($term) {
                $q->whereHas('school', function (Builder $s) use ($term) {
                    $s->whereRaw('lower(coalesce(local_educativo, \'\')) like ?', [$term])
                        ->orWhereRaw('lower(coalesce(codigo_local, \'\')) like ?', [$term]);
                })->orWhereHas('networkAssignment', function (Builder $n) use ($term) {
                    $n->whereRaw('lower(coalesce(cid, \'\')) like ?', [$term]);
                });
            });
        }

        if (! empty($filters['provincia']) || ! empty($filters['distrito'])) {
            PrtgOperationalLocation::constrainByAssignment(
                $query,
                isset($filters['provincia']) ? (string) $filters['provincia'] : null,
                isset($filters['distrito']) ? (string) $filters['distrito'] : null,
            );
        }
        if (! empty($filters['tecnologia'])) {
            $query->whereHas('networkAssignment', fn (Builder $n) => $n->whereRaw(
                'upper(coalesce(tecnologia_acceso, \'\')) = ?',
                [mb_strtoupper((string) $filters['tecnologia'])]
            ));
        }
        if (! empty($filters['classification'])) {
            $query->where('management_classification', $filters['classification']);
        }
        if (! empty($filters['scope'])) {
            $query->where('management_scope', $filters['scope']);
        }

        if (! empty($filters['same_day']) && filter_var($filters['same_day'], FILTER_VALIDATE_BOOLEAN)) {
            $query->whereRaw(
                OperationalTime::sqlLocalDate('started_at').' = '.OperationalTime::sqlLocalDate('recovered_at')
            );
        }

        if (! empty($filters['review_status'])) {
            if ($filters['review_status'] === 'PENDING_REVIEW') {
                $query->where(function (Builder $q) {
                    $q->where('recovery_review_status', RecoveryReviewStatus::PendingReview->value)
                        ->orWhere(function (Builder $q2) {
                            $q2->whereNull('recovery_review_status')
                                ->where('recovered_while_managing', true);
                        });
                });
            } else {
                $query->where('recovery_review_status', $filters['review_status']);
            }
        }

        // Flags that need post-filter after loading updates — apply via whereIn ids if requested
        $needsFlagFilter = ! empty($filters['during_management']) || ! empty($filters['had_field_tech']);
        if ($needsFlagFilter) {
            $candidates = (clone $query)->select(self::FLAG_COLUMNS)->with($this->flagRelations())->get();
            $ids = $candidates->filter(function (Incident $incident) use ($filters) {
                $flags = $this->recoveryFlags($incident);
                if (! empty($filters['during_management']) && filter_var($filters['during_management'], FILTER_VALIDATE_BOOLEAN)) {
                    if (! $flags['recovered_during_management']) {
                        return false;
                    }
                }
                if (! empty($filters['had_field_tech']) && filter_var($filters['had_field_tech'], FILTER_VALIDATE_BOOLEAN)) {
                    if (! $flags['had_field_tech']) {
                        return false;
                    }
                }

                return true;
            })->pluck('id')->all();

            $query->whereIn('id', $ids !== [] ? $ids : [0]);
        }

        return $query;
    }

    /**
     * @return array<string, mixed>
     */
    private function mapRow(Incident $incident): array
    {
        $flags = $this->recoveryFlags($incident);
        $seconds = OutageDuration::seconds($incident->started_at, $incident->recovered_at);
        /** @var TrackingRecord|null $tracking */
        $tracking = $incident->relationLoaded('trackingRecords') ? $incident->trackingRecords->first() : null;
        $location = PrtgOperationalLocation::apiFields($incident->networkAssignment, $incident->school);

        return [
            'id' => $incident->id,
            'school_id' => $incident->school_id,
            'cid' => $incident->networkAssignment?->cid,
            'local_educativo' => $incident->school?->local_educativo,
            'codigo_local' => $incident->school?->codigo_local,
            ...$location,
            'tecnologia' => $incident->networkAssignment?->tecnologia_acceso,
            'started_at' => $incident->started_at?->toIso8601String(),
            'recovered_at' => $incident->recovered_at?->toIso8601String(),
            'duration_seconds' => $seconds,
            'duration' => OutageDuration::human($seconds),
            'same_day' => $flags['same_day'],
            'management_classification' => $incident->management_classification?->value,
            'management_classification_label' => $incident->management_classification?->label(),
            'management_scope' => $incident->management_scope?->value,
            'followup_status' => $incident->followup_status?->value,
            'followup_before_recovery' => $flags['followup_before_recovery'],
            'recovered_during_management' => $flags['recovered_during_management'],
            'had_field_tech' => $flags['had_field_tech'],
            'active_field_dispatch' => $flags['active_field_dispatch'],
            'recovery_review_status' => $flags['recovery_review_status'],
            'requires_review' => $flags['requires_review'],
            'managements_count' => (int) ($incident->managements_count ?? 0),
            'case_status' => IncidentCaseStatus::resolve($incident, $tracking),
            'tracking' => $tracking ? [
                'id' => $tracking->id,
                'status' => $tracking->status?->value,
                'status_label' => $tracking->status?->label(),
                'ticket' => $tracking->report_ticket ?? $tracking->ticket,
                'closed_by_name' => $tracking->closedByDisplayName(),
            ] : null,
            'badges' => array_values(array_filter([
                $flags['requires_review'] ? 'REVISAR_GESTION' : null,
                ($flags['had_field_tech'] || $flags['active_field_dispatch']) && $flags['requires_review']
                    ? 'PERSONAL_MOVILIZADO'
                    : null,
                $flags['same_day'] ? 'MISMO_DIA' : null,
                $flags['recovery_review_status'] === 'ACKNOWLEDGED' ? 'CONFIRMADA' : null,
                $flags['recovery_review_status'] === 'CONTINUE_MONITORING' ? 'SEGUIMIENTO' : null,
            ])),
        ];
    }

    /**
     * @return array{
     *   same_day: bool,
     *   recovered_during_management: bool,
     *   had_field_tech: bool,
     *   followup_before_recovery: ?string
     * }
     */
    private function recoveryFlags(Incident $incident): array
    {
        $sameDay = OperationalTime::sameLocalDay($incident->started_at, $incident->recovered_at);

        $recoveryUpdate = $incident->relationLoaded('updates')
            ? $incident->updates->first(function (IncidentUpdate $u) {
                $type = strtoupper((string) $u->type);

                return in_array($type, ['SYSTEM', 'SYSTEM_RECOVERY'], true)
                    && $u->status_after === FollowupStatus::Recuperado->value;
            })
            : IncidentUpdate::query()
                ->where('incident_id', $incident->id)
                ->whereIn('type', ['SYSTEM', 'SYSTEM_RECOVERY'])
                ->where('status_after', FollowupStatus::Recuperado->value)
                ->orderByDesc('id')
                ->first();

        $before = $recoveryUpdate?->status_before;
        $managing = FollowupStatus::managingValues();
        $duringManagement = (bool) $incident->recovered_while_managing
            || ($before !== null && in_array($before, $managing, true));
        $hadFieldTech = $before === FollowupStatus::TecnicoEnCampo->value
            || ($incident->relationLoaded('updates')
                ? $incident->updates->contains(fn (IncidentUpdate $u) => $u->status_after === FollowupStatus::TecnicoEnCampo->value
                    || $u->status_before === FollowupStatus::TecnicoEnCampo->value
                    || str_starts_with(strtoupper((string) $u->type), 'FIELD_DISPATCH')
                    || strtoupper((string) $u->type) === 'FIELD_DISPATCH')
                : IncidentUpdate::query()
                    ->where('incident_id', $incident->id)
                    ->where(function ($q) {
                        $q->where('status_after', FollowupStatus::TecnicoEnCampo->value)
                            ->orWhere('status_before', FollowupStatus::TecnicoEnCampo->value)
                            ->orWhere('type', 'FIELD_DISPATCH');
                    })
                    ->exists())
            || ($incident->relationLoaded('fieldDispatches')
                ? $incident->fieldDispatches->contains(fn (FieldDispatch $d) => in_array(
                    $d->status instanceof FieldDispatchStatus ? $d->status->value : (string) $d->status,
                    [...FieldDispatchStatus::activeValues(), FieldDispatchStatus::Cancelled->value, FieldDispatchStatus::Completed->value],
                    true
                ))
                : FieldDispatch::query()->where('incident_id', $incident->id)->exists());

        $hasActiveDispatch = $incident->relationLoaded('fieldDispatches')
            ? $incident->fieldDispatches->contains(fn (FieldDispatch $d) => ($d->status instanceof FieldDispatchStatus
                ? $d->status->isActive()
                : in_array((string) $d->status, FieldDispatchStatus::activeValues(), true)))
            : FieldDispatch::query()->where('incident_id', $incident->id)->active()->exists();

        $reviewStatus = $incident->recovery_review_status instanceof \App\Enums\RecoveryReviewStatus
            ? $incident->recovery_review_status->value
            : $incident->recovery_review_status;

        return [
            'same_day' => $sameDay,
            'recovered_during_management' => $duringManagement,
            'had_field_tech' => $hadFieldTech || $hasActiveDispatch,
            'followup_before_recovery' => $before,
            'recovery_review_status' => $reviewStatus,
            'requires_review' => $reviewStatus === \App\Enums\RecoveryReviewStatus::PendingReview->value
                || (($duringManagement || $hadFieldTech || $hasActiveDispatch) && $reviewStatus === null),
            'active_field_dispatch' => $hasActiveDispatch,
        ];
    }

    /**
     * Catálogos de filtros: cambian poco, se cachean para no recalcular joins en cada listado.
     *
     * @return array{provincias: list<string>, distritos: list<string>, tecnologias: list<string>}
     */
    private function locationCatalog(?string $provincia): array
    {
        $key = 'recoveries:catalog:'.md5(mb_strtoupper((string) $provincia));

        return Cache::remember($key, now()->addMinutes(10), fn () => [
            'provincias' => $this->distinctPrtgColumn('prtg_province'),
            'distritos' => $this->distinctPrtgColumn('prtg_district', $provincia),
            'tecnologias' => $this->distinctTechnologies(),
        ]);
    }

    /**
     * @return list<string>
     */
    private function distinctPrtgColumn(string $column, ?string $provincia = null): array
    {
        $q = DB::table('network_assignments')
            ->join('incidents', 'incidents.network_assignment_id', '=', 'network_assignments.id')
            ->whereNotNull('incidents.recovered_at')
            ->whereNotNull("network_assignments.{$column}")
            ->where("network_assignments.{$column}", '!=', '');

        if ($provincia) {
            $q->whereRaw('upper(network_assignments.prtg_province) = ?', [mb_strtoupper($provincia)]);
        }

        return $q->distinct()->orderBy("network_assignments.{$column}")->pluck("network_assignments.{$column}")->values()->all();
    }

    /**
     * @return list<string>
     */
    private function distinctTechnologies(): array
    {
        return DB::table('network_assignments')
            ->join('incidents', 'incidents.network_assignment_id', '=', 'network_assignments.id')
            ->whereNotNull('incidents.recovered_at')
            ->whereNotNull('network_assignments.tecnologia_acceso')
            ->where('network_assignments.tecnologia_acceso', '!=', '')
            ->distinct()
            ->orderBy('network_assignments.tecnologia_acceso')
            ->pluck('network_assignments.tecnologia_acceso')
            ->values()
            ->all();
    }
}
