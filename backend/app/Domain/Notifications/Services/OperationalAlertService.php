<?php

namespace App\Domain\Notifications\Services;

use App\Domain\Incidents\Support\OutageDuration;
use App\Enums\FieldDispatchStatus;
use App\Enums\FollowupStatus;
use App\Enums\MonitoringStatus;
use App\Enums\RecoveryReviewStatus;
use App\Models\FieldDispatch;
use App\Models\Incident;
use App\Support\OperationalTime;
use Illuminate\Support\Collection;

class OperationalAlertService
{
    /**
     * Caídas y restablecimientos recientes en un solo payload (aviso flotante).
     *
     * @return array{
     *   outages: list<array<string, mixed>>,
     *   restorations: list<array<string, mixed>>,
     *   meta: array{window_minutes: int, outages: int, outages_recent: int, restorations: int, restorations_recent: int}
     * }
     */
    public function liveEvents(int $minutes = 60, int $limit = 40): array
    {
        $outages = $this->recentOutages($minutes, $limit);
        $restorations = $this->recentRestorations($minutes, $limit);

        return [
            'outages' => $outages['data'],
            'restorations' => $restorations['data'],
            'meta' => [
                'window_minutes' => $minutes,
                'outages' => $outages['meta']['total'],
                'outages_recent' => $outages['meta']['recent'],
                'restorations' => $restorations['meta']['total'],
                'restorations_recent' => $restorations['meta']['recent'],
            ],
        ];
    }

    /**
     * Caídas abiertas que empezaron en la ventana (aviso + etiqueta reciente).
     *
     * @return array{data: list<array<string, mixed>>, meta: array{total: int, recent: int, window_minutes: int}}
     */
    public function recentOutages(int $minutes = 60, int $limit = 40): array
    {
        $minutes = max(5, min($minutes, 24 * 60));
        $limit = max(1, min($limit, 80));
        $since = now()->subMinutes($minutes);
        $recentCutoff = now()->subMinutes(30);

        // Solo Ping CAÍDO (rojo). El parcial/amarillo no dispara “se cayó”.
        $incidents = Incident::query()
            ->active()
            ->falls()
            ->whereHas(
                'sensor',
                fn ($sensor) => $sensor->where('normalized_status', MonitoringStatus::Caido->value)
            )
            ->where(function ($q) use ($since) {
                $q->where('started_at', '>=', $since)
                    ->orWhere('prtg_down_started_at', '>=', $since)
                    ->orWhere(function ($q2) use ($since) {
                        $q2->where('escalated_from_partial', true)
                            ->where('updated_at', '>=', $since);
                    });
            })
            ->with([
                'school:id,local_educativo,codigo_local,provincia,distrito,current_sequence',
                'networkAssignment:id,cid,tecnologia_acceso,nodo_pop',
                'sensor:id,normalized_status,status_text,last_check',
            ])
            ->orderByDesc('prtg_down_started_at')
            ->orderByDesc('started_at')
            ->orderByDesc('id')
            ->limit($limit)
            ->get();

        $rows = $incidents->map(function (Incident $incident) use ($recentCutoff) {
            $downAt = $incident->prtg_down_started_at ?? $incident->started_at;
            $seconds = OutageDuration::seconds($downAt, null);
            // Solo por hora real de la caída actual (< 10 min). last_check engaña.
            $isRecent = $downAt !== null && $downAt->greaterThanOrEqualTo($recentCutoff);

            return [
                'id' => 'down-'.$incident->id,
                'kind' => 'outage',
                'incident_id' => $incident->id,
                'school_id' => $incident->school_id,
                'cid' => $incident->networkAssignment?->cid,
                'tss' => $incident->school?->current_sequence,
                'local_educativo' => $incident->school?->local_educativo,
                'codigo_local' => $incident->school?->codigo_local,
                'provincia' => $incident->school?->provincia,
                'distrito' => $incident->school?->distrito,
                'tecnologia' => $incident->networkAssignment?->tecnologia_acceso,
                'nodo_pop' => $incident->networkAssignment?->nodo_pop,
                'started_at' => $downAt?->toIso8601String(),
                'recovered_at' => null,
                'duration_seconds' => $seconds,
                'duration' => OutageDuration::human($seconds),
                'is_recent' => $isRecent,
                'estado_prtg' => MonitoringStatus::Caido->value,
                'followup_status' => $incident->followup_status?->value,
                'followup_label' => $incident->followup_status?->label(),
                'href' => '/incidents/total',
            ];
        })->values();

        return [
            'data' => $rows->all(),
            'meta' => [
                'total' => $rows->count(),
                'recent' => $rows->where('is_recent', true)->count(),
                'window_minutes' => $minutes,
            ],
        ];
    }

    /**
     * Restablecimientos recientes (PRTG UP). Apartado distinto a las notificaciones de revisión.
     *
     * @return array{data: list<array<string, mixed>>, meta: array{total: int, recent: int, window_minutes: int}}
     */
    public function recentRestorations(int $minutes = 60, int $limit = 40): array
    {
        $minutes = max(5, min($minutes, 24 * 60));
        $limit = max(1, min($limit, 80));
        $since = now()->subMinutes($minutes);
        $recentCutoff = now()->subMinutes(30);

        $incidents = Incident::query()
            ->with([
                'school:id,local_educativo,codigo_local,provincia,distrito,current_sequence',
                'networkAssignment:id,cid,tecnologia_acceso,nodo_pop',
            ])
            ->whereNotNull('recovered_at')
            ->where('recovered_at', '>=', $since)
            ->where(function ($q) {
                $q->whereNull('detection_source')
                    ->orWhereNotIn('detection_source', [
                        Incident::DETECTION_PREVENTIVE,
                        Incident::DETECTION_HISTORICAL,
                    ]);
            })
            ->orderByDesc('recovered_at')
            ->orderByDesc('id')
            ->limit($limit)
            ->get();

        $rows = $incidents->map(function (Incident $incident) use ($recentCutoff) {
            $seconds = OutageDuration::seconds($incident->started_at, $incident->recovered_at);
            $recoveredAt = $incident->recovered_at;
            $isRecent = $recoveredAt !== null && $recoveredAt->greaterThanOrEqualTo($recentCutoff);

            return [
                'id' => 'restored-'.$incident->id,
                'kind' => 'restoration',
                'incident_id' => $incident->id,
                'school_id' => $incident->school_id,
                'cid' => $incident->networkAssignment?->cid,
                'tss' => $incident->school?->current_sequence,
                'local_educativo' => $incident->school?->local_educativo,
                'codigo_local' => $incident->school?->codigo_local,
                'provincia' => $incident->school?->provincia,
                'distrito' => $incident->school?->distrito,
                'tecnologia' => $incident->networkAssignment?->tecnologia_acceso,
                'nodo_pop' => $incident->networkAssignment?->nodo_pop,
                'started_at' => $incident->started_at?->toIso8601String(),
                'recovered_at' => $recoveredAt?->toIso8601String(),
                'duration_seconds' => $seconds,
                'duration' => OutageDuration::human($seconds),
                'same_day' => OperationalTime::sameLocalDay($incident->started_at, $recoveredAt),
                'is_recent' => $isRecent,
                'followup_status' => $incident->followup_status?->value,
                'followup_label' => $incident->followup_status?->label(),
                'pendiente_cierre' => $incident->followup_status === FollowupStatus::PendienteCierre,
                'href' => '/history/incidents/'.$incident->id,
            ];
        })->values();

        return [
            'data' => $rows->all(),
            'meta' => [
                'total' => $rows->count(),
                'recent' => $rows->where('is_recent', true)->count(),
                'window_minutes' => $minutes,
            ],
        ];
    }

    /**
     * Alertas operativas in-app: recuperaciones pendientes de revisión.
     *
     * @return array{data: list<array<string, mixed>>, meta: array<string, int>}
     */
    public function recoveryAlerts(int $limit = 25): array
    {
        $limit = max(1, min($limit, 50));

        $incidents = Incident::query()
            ->with([
                'school:id,local_educativo,codigo_local,provincia,distrito',
                'networkAssignment:id,cid',
                'fieldDispatches' => fn ($q) => $q->orderByDesc('id')->limit(5),
                'activeTracking' => fn ($q) => $q->select(['id', 'incident_id', 'status'])->limit(1),
            ])
            ->whereNotNull('recovered_at')
            ->where(function ($q) {
                $q->where('recovery_review_status', RecoveryReviewStatus::PendingReview->value)
                    ->orWhere(function ($q2) {
                        $q2->where('recovered_while_managing', true)
                            ->whereNull('recovery_review_status');
                    });
            })
            ->orderByDesc('recovered_at')
            ->limit($limit)
            ->get();

        $rows = $incidents->map(fn (Incident $incident) => $this->mapAlert($incident))->values();

        $withDispatch = $rows->where('type', 'RECOVERY_WITH_DISPATCH')->count();

        return [
            'data' => $rows->all(),
            'meta' => [
                'total' => $rows->count(),
                'with_dispatch' => $withDispatch,
                'pending_review' => $rows->count(),
            ],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function mapAlert(Incident $incident): array
    {
        /** @var Collection<int, FieldDispatch> $dispatches */
        $dispatches = $incident->relationLoaded('fieldDispatches')
            ? $incident->fieldDispatches
            : collect();

        $active = $dispatches->first(function (FieldDispatch $d) {
            $status = $d->status instanceof FieldDispatchStatus
                ? $d->status
                : FieldDispatchStatus::tryFrom((string) $d->status);

            return $status?->isActive() ?? false;
        });

        $hasActiveDispatch = $active !== null;
        $type = $hasActiveDispatch ? 'RECOVERY_WITH_DISPATCH' : 'RECOVERY_PENDING_REVIEW';
        $severity = $hasActiveDispatch ? 'danger' : 'warning';
        $cid = $incident->networkAssignment?->cid;
        $local = $incident->school?->local_educativo;

        $title = 'Pendiente de cierre';

        $bodyParts = array_values(array_filter([
            $cid ? 'CID '.$cid : null,
            $local,
            'Estaba en gestión y ya se recuperó. Quedó en pendiente de cierre.',
        ]));

        $trackingId = $incident->activeTracking->first()?->id
            ?? $incident->trackingRecords()->notClosed()->orderByDesc('id')->value('id');

        return [
            'id' => 'recovery-'.$incident->id,
            'type' => $type,
            'severity' => $severity,
            'title' => $title,
            'body' => implode(' · ', $bodyParts),
            'incident_id' => $incident->id,
            'school_id' => $incident->school_id,
            'cid' => $cid,
            'local_educativo' => $local,
            'codigo_local' => $incident->school?->codigo_local,
            'provincia' => $incident->school?->provincia,
            'recovered_at' => $incident->recovered_at?->toIso8601String(),
            'active_field_dispatch' => $hasActiveDispatch,
            'field_dispatch_status' => $active?->status instanceof FieldDispatchStatus
                ? $active->status->value
                : ($active?->status),
            'tracking_id' => $trackingId ? (int) $trackingId : null,
            'management_classification' => $incident->management_classification?->value,
            'management_classification_label' => $incident->management_classification?->label(),
            'href' => '/history/incidents/'.$incident->id,
        ];
    }
}
