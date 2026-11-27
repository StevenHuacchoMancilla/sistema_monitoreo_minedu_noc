<?php

namespace App\Domain\Incidents\Queries;

use App\Enums\FollowupStatus;
use App\Models\Incident;
use App\Models\ServiceTicket;
use Illuminate\Database\Eloquent\Builder;

/**
 * Lecturas de las colas operativas. El controlador solo entrega HTTP;
 * el filtro y el tope viven en el módulo de incidencias.
 */
class IncidentQueueQuery
{
    /** Tope de una cola en pantalla. La operación trabaja el día, no el histórico completo. */
    public const LIMIT = 500;

    /**
     * @return Builder<Incident>
     */
    public function pendienteCierre(): Builder
    {
        return $this->base()
            ->withCount('managements')
            ->where('followup_status', FollowupStatus::PendienteCierre)
            ->whereNotNull('recovered_at')
            ->whereRaw('NOT (COALESCE(is_grave_incident, false) = true AND grave_closed_at IS NULL)')
            ->whereRaw('NOT (COALESCE(is_requirement_case, false) = true AND requirement_closed_at IS NULL)')
            ->withoutSchoolOpenGraveConflict()
            ->where(function ($q) {
                $q->where(function ($d) {
                    $d->whereNull('detection_source')
                        ->orWhere('detection_source', '!=', Incident::DETECTION_MAINTENANCE);
                })->whereDoesntHave('serviceTicket', function ($t) {
                    $t->where('is_maintenance', true)
                        ->where('status', ServiceTicket::STATUS_OPEN);
                });
            })
            ->orderByDesc('recovered_at')
            ->limit(self::LIMIT);
    }

    /**
     * @return Builder<Incident>
     */
    public function graves(bool $closed): Builder
    {
        $query = $this->base()
            ->withCount('attachments')
            ->where('is_grave_incident', true);

        if ($closed) {
            $query->whereNotNull('grave_closed_at')->orderByDesc('grave_closed_at');
        } else {
            $query->whereNull('grave_closed_at')->orderByDesc('grave_opened_at');
        }

        return $query->limit(self::LIMIT);
    }

    /**
     * @return Builder<Incident>
     */
    public function requerimientos(): Builder
    {
        return $this->base()
            ->where('is_requirement_case', true)
            ->whereNull('requirement_closed_at')
            ->orderByDesc('requirement_opened_at')
            ->limit(self::LIMIT);
    }

    /**
     * @return Builder<Incident>
     */
    public function enlaceParcial(): Builder
    {
        return $this->base()
            ->where('detection_source', Incident::DETECTION_MANUAL_PARTIAL)
            ->whereNull('recovered_at')
            ->orderByDesc('started_at')
            ->limit(self::LIMIT);
    }

    /**
     * @return Builder<Incident>
     */
    private function base(): Builder
    {
        return Incident::query()->with([
            'school',
            'networkAssignment',
            'sensor',
            'serviceTicket',
            'trackingRecords' => fn ($q) => $q->orderByDesc('id'),
        ]);
    }
}
