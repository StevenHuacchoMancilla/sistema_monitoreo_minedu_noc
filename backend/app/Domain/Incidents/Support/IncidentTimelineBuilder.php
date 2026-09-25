<?php

namespace App\Domain\Incidents\Support;

use App\Models\Incident;
use App\Models\IncidentManagement;
use App\Models\IncidentUpdate;

final class IncidentTimelineBuilder
{
    /**
     * Timeline operativo (sin ruido técnico de sync/jobs).
     *
     * @return list<array<string, mixed>>
     */
    public static function build(Incident $incident): array
    {
        $events = [];

        foreach ($incident->managements as $management) {
            $events[] = self::fromManagement($management);
        }

        foreach ($incident->updates as $update) {
            $type = strtoupper((string) $update->type);
            // MANAGEMENT ya se representa con incident_managements (más rico + snapshot).
            if ($type === 'MANAGEMENT') {
                continue;
            }
            // Ocultar ruido técnico de sync/alineación; conservar creación y recuperaciones PRTG.
            if (self::isNoisySystemUpdate($update)) {
                continue;
            }
            $events[] = self::fromUpdate($update);
        }

        usort($events, function (array $a, array $b) {
            return strcmp((string) ($a['at'] ?? ''), (string) ($b['at'] ?? ''));
        });

        return array_values($events);
    }

    /**
     * @return array<string, mixed>
     */
    private static function fromManagement(IncidentManagement $m): array
    {
        $classification = $m->classification?->value;
        $icon = match ($classification) {
            'CONTACT_CONFIRMED' => 'phone',
            'LINK_OUTAGE' => 'network',
            'NO_RESPONSE' => 'phone_missed',
            'COMPLAINT' => 'message',
            default => 'wrench',
        };

        $detailParts = array_values(array_filter([
            $m->classification?->label(),
            $m->scope?->value,
            $m->detail,
            $m->observation,
        ]));

        return [
            'id' => 'management-'.$m->id,
            'source' => 'management',
            'at' => ($m->contact_attempted_at ?? $m->created_at)?->toIso8601String(),
            'kind' => 'MANAGEMENT',
            'icon' => $icon,
            'actor' => $m->author?->name ?? ($m->created_by ? 'Operador #'.$m->created_by : 'Operador'),
            'title' => $m->classification?->label() ?? 'Gestión operativa',
            'detail' => $detailParts !== [] ? implode(' · ', $detailParts) : null,
            'status_before' => null,
            'status_after' => null,
            'contact' => ($m->contact_name_snapshot || $m->contact_phone_snapshot || $m->contact_role_snapshot) ? [
                'name' => $m->contact_name_snapshot,
                'role' => $m->contact_role_snapshot,
                'phone' => $m->contact_phone_snapshot,
            ] : null,
            'scope' => $m->scope?->value,
            'classification' => $classification,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private static function fromUpdate(IncidentUpdate $u): array
    {
        $type = strtoupper((string) $u->type);
        $observation = (string) ($u->observation ?? '');
        $isRecovery = in_array($type, ['SYSTEM', 'SYSTEM_RECOVERY'], true) && (
            str_contains(mb_strtolower($observation), 'recuper')
            || $u->status_after === 'RECUPERADO'
            || $type === 'SYSTEM_RECOVERY'
        );
        $isReview = $type === 'RECOVERY_REVIEW';
        $isDispatch = $type === 'FIELD_DISPATCH';

        $icon = match (true) {
            $isReview => 'wrench',
            $isDispatch => 'truck',
            $isRecovery => 'check',
            $type === 'SYSTEM' => 'activity',
            $type === 'NOTE' => 'message',
            default => 'activity',
        };

        $title = match (true) {
            $isReview => 'Revisión operativa de recuperación',
            $isDispatch => 'Desplazamiento a campo',
            $isRecovery => 'PRTG reportó recuperación',
            $type === 'SYSTEM' && str_contains(mb_strtolower($observation), 'creada') => 'Incidencia creada',
            $type === 'SYSTEM' => 'Evento del sistema',
            $type === 'NOTE' => 'Observación',
            default => 'Actualización',
        };

        return [
            'id' => 'update-'.$u->id,
            'source' => 'update',
            'at' => $u->created_at?->toIso8601String(),
            'kind' => $type,
            'icon' => $icon,
            'actor' => $u->user?->name ?? ($u->user_id ? 'Operador #'.$u->user_id : 'Sistema'),
            'title' => $title,
            'detail' => $observation !== '' ? $observation : null,
            'status_before' => $u->status_before,
            'status_after' => $u->status_after,
            'contact' => null,
            'scope' => null,
            'classification' => null,
        ];
    }

    /**
     * Eventos SYSTEM de sync/alineación confunden al operador.
     * Se mantienen: "Incidencia creada", recuperaciones PRTG, revisiones y campo.
     */
    private static function isNoisySystemUpdate(IncidentUpdate $u): bool
    {
        $type = strtoupper((string) $u->type);
        if (! in_array($type, ['SYSTEM', 'SYSTEM_NOTE'], true)) {
            return false;
        }

        $observation = mb_strtolower((string) ($u->observation ?? ''));

        // Recuperación técnica / operativa: útil.
        if (
            str_contains($observation, 'recuper')
            || $u->status_after === 'RECUPERADO'
            || $type === 'SYSTEM_RECOVERY'
        ) {
            return false;
        }

        // Creación de incidencia: útil.
        if (str_contains($observation, 'incidencia creada') || str_contains($observation, 'creada')) {
            return false;
        }

        // Ruido típico de sync tardío / alineación de started_at.
        $noiseMarkers = [
            'sync tard',
            'downtimesince',
            'uptimesince',
            'alinead',
            'started_at',
            'lastcheck',
            're-aline',
            'realine',
            'timezone',
            'utc',
        ];

        foreach ($noiseMarkers as $marker) {
            if (str_contains($observation, $marker)) {
                return true;
            }
        }

        // Cualquier otro SYSTEM genérico ("Evento del sistema") sin valor operativo.
        return true;
    }
}
