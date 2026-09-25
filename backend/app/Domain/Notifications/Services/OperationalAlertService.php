<?php

namespace App\Domain\Notifications\Services;

use App\Enums\FieldDispatchStatus;
use App\Enums\RecoveryReviewStatus;
use App\Models\FieldDispatch;
use App\Models\Incident;
use Illuminate\Support\Collection;

class OperationalAlertService
{
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

        $title = $hasActiveDispatch
            ? 'Recuperado con personal movilizado'
            : 'Recuperado durante gestión';

        $bodyParts = array_values(array_filter([
            $cid ? 'CID '.$cid : null,
            $local,
            $hasActiveDispatch
                ? 'Hay desplazamiento activo ('.($active?->status instanceof FieldDispatchStatus
                    ? $active->status->label()
                    : (string) $active?->status).').'
                : 'Requiere decisión operativa del NOC.',
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
            'href' => $trackingId
                ? '/tracking/'.$trackingId
                : '/history/incidents/'.$incident->id,
        ];
    }
}
