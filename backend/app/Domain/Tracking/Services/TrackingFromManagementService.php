<?php

namespace App\Domain\Tracking\Services;

use App\Enums\ManagementClassification;
use App\Enums\ManagementScope;
use App\Models\Incident;
use App\Models\TrackingRecord;
use Illuminate\Validation\ValidationException;

/**
 * Sincroniza Tracking General desde una gestión humana de incidencia.
 * Abrir el modal NO crea Tracking; guardar la gestión sí.
 */
class TrackingFromManagementService
{
    public function __construct(
        private readonly TrackingOpenService $open,
        private readonly TrackingDetailService $detail,
    ) {}

    /**
     * Abre Tracking si no existe y agrega un tracking_update con el texto de la gestión.
     *
     * @param  array{
     *   classification: string,
     *   scope?: ?string,
     *   detail?: ?string,
     *   observation?: ?string,
     * }  $payload
     * @return array{
     *   created: bool,
     *   tracking_id: int,
     *   ticket_code: ?string,
     *   status: string,
     *   incident_number: ?int
     * }
     */
    public function syncFromManagement(Incident $incident, int $userId, array $payload): array
    {
        if ($userId < 1) {
            throw ValidationException::withMessages([
                'user' => ['Se requiere un usuario autenticado para abrir Tracking.'],
            ]);
        }

        $opened = $this->open->openFromIncident($incident, $userId);
        /** @var TrackingRecord $tracking */
        $tracking = TrackingRecord::query()->findOrFail((int) $opened['data']['id']);

        $body = $this->composeBody($payload);
        $this->detail->addUpdate($tracking, [
            'body' => $body,
            'event_type' => 'COMMENT',
        ], $userId);

        $fresh = $tracking->fresh() ?? $tracking;
        $status = $fresh->status instanceof \App\Enums\TrackingStatus
            ? $fresh->status->value
            : (string) $fresh->status;

        return [
            'created' => (bool) $opened['created'],
            'tracking_id' => (int) $fresh->id,
            'ticket_code' => $fresh->report_ticket ?? $fresh->ticket,
            'status' => $status,
            'incident_number' => $fresh->incident_number !== null ? (int) $fresh->incident_number : null,
        ];
    }

    /**
     * @param  array{
     *   classification?: string,
     *   scope?: ?string,
     *   detail?: ?string,
     *   observation?: ?string,
     * }  $payload
     */
    private function composeBody(array $payload): string
    {
        $observation = trim((string) ($payload['observation'] ?? ''));
        if ($observation !== '') {
            return $observation;
        }

        $detail = trim((string) ($payload['detail'] ?? ''));
        if ($detail !== '') {
            return $detail;
        }

        $classification = ManagementClassification::tryFrom((string) ($payload['classification'] ?? ''))
            ?? ManagementClassification::Unclassified;
        $scope = ! empty($payload['scope'])
            ? ManagementScope::tryFrom((string) $payload['scope'])
            : null;

        $label = $classification === ManagementClassification::Unclassified
            ? 'Gestión registrada'
            : 'Gestión: '.$classification->label();

        if ($scope) {
            $label .= ' · '.$scope->value;
        }

        return $label;
    }
}
