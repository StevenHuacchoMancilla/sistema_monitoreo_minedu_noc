<?php

namespace App\Domain\Incidents\Support;

use App\Enums\FollowupStatus;
use App\Models\Incident;
use App\Models\IncidentManagement;
use App\Models\IncidentUpdate;

/**
 * Historial del caso para el operador:
 * - comentarios/gestiones agregadas
 * - hitos de sistema: caída, recuperación PRTG, cierre de ticket
 * Sin ruido de sync, Tracking duplicado ni eventos técnicos.
 */
final class IncidentTimelineBuilder
{
    /**
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
            // MANAGEMENT ya viene en incident_managements.
            if ($type === 'MANAGEMENT') {
                continue;
            }
            if (! self::isMilestoneUpdate($update)) {
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
        $comment = trim(implode("\n", array_values(array_filter([
            $m->detail ? trim((string) $m->detail) : null,
            $m->observation ? trim((string) $m->observation) : null,
        ]))));

        $classification = $m->classification?->value;
        $hasComment = $comment !== '';

        return [
            'id' => 'management-'.$m->id,
            'source' => 'management',
            'at' => ($m->contact_attempted_at ?? $m->created_at)?->toIso8601String(),
            'kind' => 'MANAGEMENT',
            'icon' => $hasComment ? 'message' : 'wrench',
            'actor' => $m->author?->name ?? ($m->created_by ? 'Operador #'.$m->created_by : 'Operador'),
            'title' => $hasComment ? 'Comentario' : ($m->classification?->label() ?? 'Gestión'),
            'detail' => $hasComment
                ? $comment
                : ($m->classification?->label() ?? null),
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
        $observation = trim((string) ($u->observation ?? ''));
        $after = (string) ($u->status_after ?? '');

        $isClose = $after === FollowupStatus::Cerrado->value
            || str_contains(mb_strtolower($observation), 'ticket cerrado')
            || str_contains(mb_strtolower($observation), 'cierre operativo');

        $isRecovery = in_array($type, ['SYSTEM_RECOVERY', 'SYSTEM'], true) && (
            $type === 'SYSTEM_RECOVERY'
            || $after === FollowupStatus::Recuperado->value
            || $after === FollowupStatus::PendienteCierre->value
            || str_contains(mb_strtolower($observation), 'recuper')
            || str_contains(mb_strtolower($observation), 'operativo')
        ) && ! $isClose;

        $isCreated = $type === 'SYSTEM' && (
            str_contains(mb_strtolower($observation), 'incidencia creada')
            || str_contains(mb_strtolower($observation), 'creada por')
            || str_contains(mb_strtolower($observation), 'transición a caído')
            || ($u->status_before === null && $after === FollowupStatus::PendienteContacto->value)
        );

        $icon = match (true) {
            $isClose => 'lock',
            $isRecovery => 'check',
            $isCreated => 'activity',
            default => 'activity',
        };

        $title = match (true) {
            $isClose => 'Ticket cerrado',
            $isRecovery => 'Enlace restablecido',
            $isCreated => 'Enlace caído',
            default => 'Hito del sistema',
        };

        // Detalle corto para el operador (sin párrafos técnicos largos).
        $detail = match (true) {
            $isClose => $observation !== '' ? $observation : 'Cierre operativo del ticket.',
            $isRecovery => 'PRTG reportó recuperación (Ping OPERATIVO).',
            $isCreated => 'PRTG reportó caída (Ping CAÍDO).',
            default => $observation !== '' ? $observation : null,
        };

        return [
            'id' => 'update-'.$u->id,
            'source' => 'update',
            'at' => $u->created_at?->toIso8601String(),
            'kind' => $type,
            'icon' => $icon,
            'actor' => $u->user?->name ?? ($u->user_id ? 'Operador #'.$u->user_id : 'Sistema'),
            'title' => $title,
            'detail' => $detail,
            'status_before' => $u->status_before,
            'status_after' => $u->status_after,
            'contact' => null,
            'scope' => null,
            'classification' => null,
        ];
    }

    /** Solo caída, recuperación y cierre de ticket. */
    private static function isMilestoneUpdate(IncidentUpdate $u): bool
    {
        $type = strtoupper((string) $u->type);
        $observation = mb_strtolower((string) ($u->observation ?? ''));
        $after = (string) ($u->status_after ?? '');

        if ($after === FollowupStatus::Cerrado->value) {
            return true;
        }
        if ($type === 'MANUAL' && (
            str_contains($observation, 'ticket cerrado')
            || str_contains($observation, 'cierre operativo')
            || str_contains($observation, 'cerrado por el operador')
        )) {
            return true;
        }

        if ($type === 'SYSTEM_RECOVERY') {
            return true;
        }

        if ($type === 'SYSTEM') {
            if (
                str_contains($observation, 'incidencia creada')
                || str_contains($observation, 'creada por')
                || str_contains($observation, 'transición a caído')
            ) {
                return true;
            }
            if (
                str_contains($observation, 'recuper')
                || $after === FollowupStatus::Recuperado->value
                || $after === FollowupStatus::PendienteCierre->value
            ) {
                return true;
            }
        }

        return false;
    }
}
