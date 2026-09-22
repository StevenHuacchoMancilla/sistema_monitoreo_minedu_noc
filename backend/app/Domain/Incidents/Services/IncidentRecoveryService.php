<?php

namespace App\Domain\Incidents\Services;

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
use Carbon\Carbon;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;

class IncidentRecoveryService
{
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
                'sensor:id,name,normalized_status',
                'updates' => fn ($q) => $q->orderByDesc('id')->limit(20),
                'managements' => fn ($q) => $q->orderByDesc('id')->limit(5),
                'fieldDispatches' => fn ($q) => $q->orderByDesc('id')->limit(5),
            ])
            ->orderByDesc('recovered_at');

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
                'date_from' => $from->toDateString(),
                'date_to' => $to->toDateString(),
                'preset' => $filters['preset'] ?? 'today',
                'provincias' => $this->distinctPrtgColumn('prtg_province'),
                'distritos' => $this->distinctPrtgColumn('prtg_district', $filters['provincia'] ?? null),
                'tecnologias' => $this->distinctTechnologies(),
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

        $inPeriod = $this->baseQuery($from, $to, $filters)->get();
        $flags = $inPeriod->mapWithKeys(fn (Incident $i) => [$i->id => $this->recoveryFlags($i)]);

        $todayFrom = today()->startOfDay();
        $todayTo = today()->endOfDay();
        $weekFrom = now()->startOfWeek();
        $weekTo = now()->endOfWeek();

        $recoveredToday = Incident::query()
            ->whereNotNull('recovered_at')
            ->whereBetween('recovered_at', [$todayFrom, $todayTo])
            ->count();

        $recoveredWeek = Incident::query()
            ->whereNotNull('recovered_at')
            ->whereBetween('recovered_at', [$weekFrom, $weekTo])
            ->count();

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
            'date_from' => $from->toDateString(),
            'date_to' => $to->toDateString(),
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
            $from = ! empty($filters['date_from'])
                ? Carbon::parse((string) $filters['date_from'])->startOfDay()
                : Carbon::parse((string) $filters['date_to'])->startOfDay();
            $to = ! empty($filters['date_to'])
                ? Carbon::parse((string) $filters['date_to'])->endOfDay()
                : Carbon::parse((string) $filters['date_from'])->endOfDay();

            return [$from, $to];
        }

        return match ($preset) {
            'yesterday' => [today()->subDay()->startOfDay(), today()->subDay()->endOfDay()],
            'last_7_days' => [now()->subDays(6)->startOfDay(), now()->endOfDay()],
            'this_month' => [now()->startOfMonth()->startOfDay(), now()->endOfDay()],
            default => [today()->startOfDay(), today()->endOfDay()],
        };
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
            $driver = DB::connection()->getDriverName();
            if ($driver === 'pgsql') {
                $query->whereRaw('date(started_at) = date(recovered_at)');
            } else {
                $query->whereRaw("date(started_at) = date(recovered_at)");
            }
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
            $candidates = (clone $query)->with('updates')->get();
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
        $sameDay = $incident->started_at && $incident->recovered_at
            ? $incident->started_at->toDateString() === $incident->recovered_at->toDateString()
            : false;

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
