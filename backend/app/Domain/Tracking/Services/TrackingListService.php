<?php

namespace App\Domain\Tracking\Services;

use App\Enums\TrackingStatus;
use App\Models\TrackingRecord;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Carbon;

class TrackingListService
{
    /**
     * @param  array<string, mixed>  $filters
     * @return array{data: list<array<string, mixed>>, meta: array<string, mixed>, filters: array<string, mixed>, kpis: array<string, mixed>}
     */
    public function list(array $filters): array
    {
        $perPage = (int) ($filters['per_page'] ?? 25);
        if (! in_array($perPage, [25, 50, 100], true)) {
            $perPage = 25;
        }
        $page = max(1, (int) ($filters['page'] ?? 1));

        $query = $this->baseQuery($filters)
            ->with([
                'school:id,local_educativo,codigo_local,current_sequence',
                'networkAssignment:id,cid,tecnologia_acceso,prtg_province,prtg_district',
                'openedBy:id,name',
                'closedBy:id,name',
                'latestUpdate',
            ])
            ->orderByDesc('opened_at')
            ->orderByDesc('id');

        $paginator = $query->paginate($perPage, ['*'], 'page', $page);

        $data = collect($paginator->items())->map(fn (TrackingRecord $row) => $this->mapRow($row))->values()->all();

        return [
            'data' => $data,
            'meta' => [
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                'per_page' => $paginator->perPage(),
                'total' => $paginator->total(),
            ],
            'filters' => $this->filterOptions(),
            'kpis' => $this->kpis($filters),
        ];
    }

    /**
     * @param  array<string, mixed>  $filters
     * @return array<string, int>
     */
    public function kpis(array $filters = []): array
    {
        $todayFrom = now()->startOfDay();
        $todayTo = now()->endOfDay();

        // KPIs globales del módulo (no se reducen por filtros de tabla,
        // excepto rango de periodo explícito si viene).
        $periodFrom = $this->parseDate($filters['period_from'] ?? null)?->startOfDay();
        $periodTo = $this->parseDate($filters['period_to'] ?? null)?->endOfDay();

        $base = TrackingRecord::query();
        if ($periodFrom) {
            $base->where('opened_at', '>=', $periodFrom);
        }
        if ($periodTo) {
            $base->where('opened_at', '<=', $periodTo);
        }

        $abiertos = (clone $base)->where('status', TrackingStatus::Open->value)->count();
        $enSeguimiento = (clone $base)->where('status', TrackingStatus::InProgress->value)->count();
        $tecPendientes = (clone $base)->where('status', TrackingStatus::TechnicallyRecovered->value)->count();
        $cerradosHoy = TrackingRecord::query()
            ->where('status', TrackingStatus::Closed->value)
            ->whereBetween('closed_at', [$todayFrom, $todayTo])
            ->count();
        $totalPeriodo = (clone $base)->count();

        return [
            'abiertos' => $abiertos,
            'en_seguimiento' => $enSeguimiento,
            'tecnicamente_recuperados' => $tecPendientes,
            'cerrados_hoy' => $cerradosHoy,
            'total_periodo' => $totalPeriodo,
        ];
    }

    /**
     * @param  array<string, mixed>  $filters
     */
    private function baseQuery(array $filters): Builder
    {
        $q = TrackingRecord::query()
            ->leftJoin('schools', 'schools.id', '=', 'tracking_records.school_id')
            ->leftJoin('network_assignments as na', 'na.id', '=', 'tracking_records.network_assignment_id')
            ->leftJoin('users as opened_users', 'opened_users.id', '=', 'tracking_records.opened_by_user_id')
            ->leftJoin('users as closed_users', 'closed_users.id', '=', 'tracking_records.closed_by_user_id')
            ->select('tracking_records.*');

        $search = trim((string) ($filters['q'] ?? $filters['search'] ?? ''));
        if ($search !== '') {
            $like = '%'.mb_strtolower($search).'%';
            $q->where(function (Builder $inner) use ($like, $search) {
                $inner->whereRaw('lower(coalesce(tracking_records.ticket, \'\')) like ?', [$like])
                    ->orWhereRaw('lower(coalesce(tracking_records.cid_snapshot, \'\')) like ?', [$like])
                    ->orWhereRaw('lower(coalesce(tracking_records.tss_snapshot, \'\')) like ?', [$like])
                    ->orWhereRaw('lower(coalesce(tracking_records.description, \'\')) like ?', [$like])
                    ->orWhereRaw('lower(coalesce(schools.local_educativo, \'\')) like ?', [$like])
                    ->orWhereRaw('lower(coalesce(opened_users.name, \'\')) like ?', [$like])
                    ->orWhereRaw('lower(coalesce(tracking_records.opened_by_legacy_name, \'\')) like ?', [$like])
                    ->orWhereRaw('lower(coalesce(closed_users.name, \'\')) like ?', [$like])
                    ->orWhereRaw('lower(coalesce(tracking_records.closed_by_legacy_name, \'\')) like ?', [$like]);

                if (ctype_digit($search)) {
                    $inner->orWhere('tracking_records.incident_number', (int) $search)
                        ->orWhere('tracking_records.id', (int) $search);
                }
            });
        }

        $status = strtoupper(trim((string) ($filters['status'] ?? '')));
        if ($status !== '' && in_array($status, TrackingStatus::values(), true)) {
            $q->where('tracking_records.status', $status);
        }

        $provincia = trim((string) ($filters['provincia'] ?? ''));
        if ($provincia !== '') {
            $q->whereRaw('upper(coalesce(na.prtg_province, \'\')) = ?', [mb_strtoupper($provincia)]);
        }

        $distrito = trim((string) ($filters['distrito'] ?? ''));
        if ($distrito !== '') {
            $q->whereRaw('upper(coalesce(na.prtg_district, \'\')) = ?', [mb_strtoupper($distrito)]);
        }

        $openedBy = trim((string) ($filters['opened_by'] ?? ''));
        if ($openedBy !== '') {
            if (ctype_digit($openedBy)) {
                $q->where('tracking_records.opened_by_user_id', (int) $openedBy);
            } else {
                $like = '%'.mb_strtolower($openedBy).'%';
                $q->where(function (Builder $inner) use ($like) {
                    $inner->whereRaw('lower(coalesce(opened_users.name, \'\')) like ?', [$like])
                        ->orWhereRaw('lower(coalesce(tracking_records.opened_by_legacy_name, \'\')) like ?', [$like]);
                });
            }
        }

        $closedBy = trim((string) ($filters['closed_by'] ?? ''));
        if ($closedBy !== '') {
            if (ctype_digit($closedBy)) {
                $q->where('tracking_records.closed_by_user_id', (int) $closedBy);
            } else {
                $like = '%'.mb_strtolower($closedBy).'%';
                $q->where(function (Builder $inner) use ($like) {
                    $inner->whereRaw('lower(coalesce(closed_users.name, \'\')) like ?', [$like])
                        ->orWhereRaw('lower(coalesce(tracking_records.closed_by_legacy_name, \'\')) like ?', [$like]);
                });
            }
        }

        $openedFrom = $this->parseDate($filters['opened_from'] ?? null);
        if ($openedFrom) {
            $q->where('tracking_records.opened_at', '>=', $openedFrom->startOfDay());
        }
        $openedTo = $this->parseDate($filters['opened_to'] ?? null);
        if ($openedTo) {
            $q->where('tracking_records.opened_at', '<=', $openedTo->endOfDay());
        }
        $closedFrom = $this->parseDate($filters['closed_from'] ?? null);
        if ($closedFrom) {
            $q->where('tracking_records.closed_at', '>=', $closedFrom->startOfDay());
        }
        $closedTo = $this->parseDate($filters['closed_to'] ?? null);
        if ($closedTo) {
            $q->where('tracking_records.closed_at', '<=', $closedTo->endOfDay());
        }

        return $q;
    }

    /**
     * @return array<string, mixed>
     */
    private function mapRow(TrackingRecord $row): array
    {
        $summary = $row->toSummaryArray();
        $lastUpdate = $row->latestUpdate;

        return array_merge($summary, [
            'school_name' => $row->school?->local_educativo,
            'codigo_local' => $row->school?->codigo_local,
            'tecnologia_acceso' => $row->networkAssignment?->tecnologia_acceso,
            'prtg_province' => $row->networkAssignment?->prtg_province,
            'prtg_district' => $row->networkAssignment?->prtg_district,
            'opened_at_display' => $this->formatDateDisplay($row->opened_at, $row->opened_at_precision?->value ?? $row->opened_at_precision),
            'closed_at_display' => $this->formatDateDisplay($row->closed_at, $row->closed_at_precision?->value ?? $row->closed_at_precision),
            'last_update' => $lastUpdate?->toApiArray(),
            'last_update_preview' => $lastUpdate
                ? mb_substr(preg_replace('/\s+/', ' ', (string) $lastUpdate->body) ?? '', 0, 120)
                : null,
        ]);
    }

    /**
     * @return array{statuses: list<array{value: string, label: string}>, opened_by: list<array{value: string, label: string}>, closed_by: list<array{value: string, label: string}>}
     */
    private function filterOptions(): array
    {
        $statuses = array_map(
            fn (TrackingStatus $s) => ['value' => $s->value, 'label' => $s->label()],
            TrackingStatus::cases()
        );

        return [
            'statuses' => $statuses,
            'opened_by' => $this->actorOptionsFromRecords('opened'),
            'closed_by' => $this->actorOptionsFromRecords('closed'),
        ];
    }

    /**
     * @return list<array{value: string, label: string}>
     */
    private function actorOptionsFromRecords(string $kind): array
    {
        $rows = TrackingRecord::query()
            ->with($kind === 'opened' ? 'openedBy:id,name' : 'closedBy:id,name')
            ->get(['id', 'opened_by_user_id', 'opened_by_legacy_name', 'closed_by_user_id', 'closed_by_legacy_name']);

        $map = [];
        foreach ($rows as $row) {
            if ($kind === 'opened') {
                $label = $row->openedByDisplayName();
                $value = $row->opened_by_user_id ? (string) $row->opened_by_user_id : (string) $row->opened_by_legacy_name;
            } else {
                $label = $row->closedByDisplayName();
                $value = $row->closed_by_user_id ? (string) $row->closed_by_user_id : (string) $row->closed_by_legacy_name;
            }
            if ($label && $value) {
                $map[$value] = $label;
            }
        }

        $out = [];
        foreach ($map as $value => $label) {
            $out[] = ['value' => (string) $value, 'label' => $label];
        }
        usort($out, fn ($a, $b) => strcmp($a['label'], $b['label']));

        return $out;
    }

    private function parseDate(mixed $value): ?Carbon
    {
        if ($value === null || $value === '') {
            return null;
        }

        try {
            return Carbon::parse((string) $value);
        } catch (\Throwable) {
            return null;
        }
    }

    private function formatDateDisplay(mixed $at, mixed $precision): ?string
    {
        if (! $at instanceof Carbon) {
            return null;
        }

        $isDateOnly = $precision === 'DATE' || $precision === \App\Enums\DatePrecision::Date;

        return $isDateOnly
            ? $at->format('d/m/Y')
            : $at->format('d/m/Y H:i');
    }
}
