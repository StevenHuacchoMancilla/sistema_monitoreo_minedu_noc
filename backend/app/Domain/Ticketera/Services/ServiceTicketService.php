<?php

namespace App\Domain\Ticketera\Services;

use App\Domain\Incidents\Support\RootCauseLegend;
use App\Enums\FollowupStatus;
use App\Enums\ManagementClassification;
use App\Enums\MineduReason;
use App\Enums\MonitoringStatus;
use App\Models\Incident;
use App\Models\IncidentUpdate;
use App\Models\NetworkAssignment;
use App\Models\PrtgSensor;
use App\Models\ServiceTicket;
use App\Models\User;
use App\Support\OperationalTime;
use Carbon\CarbonInterface;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;

/**
 * Código de ticketera TGS_{CID}_{n} y reporte de visita.
 * El correctivo nace con cada caída. El preventivo solo si el Ping no está caído.
 */
class ServiceTicketService
{
    public function ensureForIncident(Incident $incident, ?string $openedBy = null): ServiceTicket
    {
        $existing = ServiceTicket::query()->where('incident_id', $incident->id)->first();
        if ($existing) {
            return $existing;
        }

        $incident->loadMissing(['school', 'networkAssignment']);
        $cid = $this->cidOf($incident);
        $adopted = $this->adoptImported($incident, $cid);
        if ($adopted) {
            return $adopted;
        }

        return DB::transaction(function () use ($incident, $cid, $openedBy) {
            $again = ServiceTicket::query()->where('incident_id', $incident->id)->lockForUpdate()->first();
            if ($again) {
                return $again;
            }

            $code = $this->nextCode($cid);

            return ServiceTicket::query()->create($this->snapshot($incident, [
                'ticket_code' => $code,
                'kind' => $incident->isPreventive() ? ServiceTicket::KIND_PREVENTIVE : ServiceTicket::KIND_CORRECTIVE,
                'status' => ServiceTicket::STATUS_OPEN,
                'opened_by_name' => $openedBy,
                'source' => ServiceTicket::SOURCE_LIVE,
            ]));
        });
    }

    public function syncFromIncident(Incident $incident, ?string $actorName = null): ?ServiceTicket
    {
        $ticket = ServiceTicket::query()->where('incident_id', $incident->id)->first();
        if ($ticket === null && ($incident->recovered_at === null || $incident->isPreventive())) {
            $ticket = $this->ensureForIncident($incident, $actorName);
        }
        if ($ticket === null) {
            return null;
        }

        $incident->loadMissing(['school', 'networkAssignment']);
        $patch = $this->snapshot($incident, []);
        foreach (['segment', 'attention', 'cause', 'cause_code', 'minedu', 'detail', 'area', 'school_name'] as $field) {
            if (! filled($patch[$field] ?? null)) {
                unset($patch[$field]);
            }
        }
        $ticket->fill($patch);
        if ($actorName && trim((string) $ticket->opened_by_name) === '') {
            $ticket->opened_by_name = $actorName;
        }
        $ticket->save();

        return $ticket->fresh() ?? $ticket;
    }

    public function markRestored(Incident $incident, CarbonInterface $at): void
    {
        $ticket = ServiceTicket::query()->where('incident_id', $incident->id)->first();
        if ($ticket === null || $ticket->isPreventive() || $ticket->restored_at !== null) {
            return;
        }

        $ticket->restored_at = OperationalTime::toStorage($at);
        $ticket->save();
    }

    public function close(Incident $incident, ?string $actorName = null, ?CarbonInterface $at = null): void
    {
        $ticket = ServiceTicket::query()->where('incident_id', $incident->id)->first();
        if ($ticket === null || $ticket->status === ServiceTicket::STATUS_CLOSED) {
            return;
        }

        $ticket->closed_at = OperationalTime::toStorage($at ?? OperationalTime::now());
        $ticket->status = ServiceTicket::STATUS_CLOSED;
        if ($actorName && trim((string) $ticket->closed_by_name) === '') {
            $ticket->closed_by_name = $actorName;
        }
        $ticket->save();
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    public function recordVisit(Incident $incident, array $payload, ?string $actorName = null): ServiceTicket
    {
        $ticket = $this->ensureForIncident($incident, $actorName);
        $preventive = $ticket->isPreventive();

        if ($preventive && ! empty($payload['opened_at'])) {
            $opened = $this->parseLocal($payload['opened_at']);
            $ticket->opened_at = OperationalTime::toStorage($opened);
            $incident->started_at = $ticket->opened_at;
            $incident->save();
        }

        if (! $preventive && array_key_exists('restored_at', $payload)) {
            $ticket->restored_at = $payload['restored_at']
                ? OperationalTime::toStorage($this->parseLocal($payload['restored_at']))
                : null;
        }

        foreach (['technician_name', 'polygon', 'visit_reason', 'activities', 'materials'] as $field) {
            if (array_key_exists($field, $payload)) {
                $value = trim((string) ($payload[$field] ?? ''));
                $ticket->{$field} = $value !== '' ? $value : null;
            }
        }

        if (array_key_exists('arrived_at', $payload)) {
            $ticket->arrived_at = $payload['arrived_at']
                ? OperationalTime::toStorage($this->parseLocal($payload['arrived_at']))
                : null;
        }
        if (array_key_exists('departed_at', $payload)) {
            $ticket->departed_at = $payload['departed_at']
                ? OperationalTime::toStorage($this->parseLocal($payload['departed_at']))
                : null;
        }

        if (array_key_exists('closed_at', $payload)) {
            if ($payload['closed_at']) {
                $ticket->closed_at = OperationalTime::toStorage($this->parseLocal($payload['closed_at']));
                $ticket->status = ServiceTicket::STATUS_CLOSED;
                if ($actorName && trim((string) $ticket->closed_by_name) === '') {
                    $ticket->closed_by_name = $actorName;
                }
            } else {
                $ticket->closed_at = null;
                $ticket->status = ServiceTicket::STATUS_OPEN;
            }
        }

        $ticket->save();

        return $ticket->fresh() ?? $ticket;
    }

    public function openPreventive(NetworkAssignment $assignment, int $userId, CarbonInterface $startedAt, ?string $detail = null): Incident
    {
        if ($userId < 1) {
            throw new InvalidArgumentException('Se requiere un usuario autenticado.');
        }

        $assignment->loadMissing(['school', 'sensors']);
        $sensor = $assignment->sensors
            ->first(fn (PrtgSensor $item) => strcasecmp((string) $item->name, 'Ping') === 0)
            ?? $assignment->sensors->first();

        if ($sensor !== null && $sensor->normalized_status instanceof MonitoringStatus && $sensor->normalized_status->isOutage()) {
            throw new InvalidArgumentException(
                'El colegio está caído o en parcial. Ese caso ya es un ticket correctivo; el preventivo es solo con el Ping operativo.'
            );
        }

        $openFall = Incident::query()
            ->falls()
            ->where('network_assignment_id', $assignment->id)
            ->whereNull('recovered_at')
            ->exists();
        if ($openFall) {
            throw new InvalidArgumentException('Ya hay una caída abierta para este colegio. Continúa esa gestión.');
        }

        $openPreventive = Incident::query()
            ->where('network_assignment_id', $assignment->id)
            ->where('detection_source', Incident::DETECTION_PREVENTIVE)
            ->whereNull('recovered_at')
            ->whereHas('serviceTicket', fn ($q) => $q->where('status', ServiceTicket::STATUS_OPEN))
            ->exists();
        if ($openPreventive) {
            throw new InvalidArgumentException('Ya hay un mantenimiento preventivo abierto para este colegio.');
        }

        $school = $assignment->school;
        $actor = User::query()->find($userId)?->name;
        $incident = Incident::query()->create([
            'school_id' => $assignment->school_id,
            'network_assignment_id' => $assignment->id,
            'prtg_sensor_id' => null,
            'detection_source' => Incident::DETECTION_PREVENTIVE,
            'started_at' => OperationalTime::toStorage($startedAt),
            'current_status' => MonitoringStatus::Operativo->value,
            'followup_status' => FollowupStatus::PendienteContacto,
            'management_classification' => ManagementClassification::NewOutage,
            'detail_text' => $detail,
            'school_snapshot' => $school?->only([
                'id', 'current_sequence', 'legacy_reference', 'codigo_local', 'codigo_modular',
                'local_educativo', 'departamento', 'provincia', 'distrito', 'centro_poblado', 'clasificacion',
            ]),
            'network_snapshot' => $assignment->only([
                'id', 'cid', 'cid_status', 'prtg_device_name', 'capacidad_mbps', 'tecnologia_acceso',
                'nodo_pop', 'ip_publica', 'ip_loopback', 'ip_wan_principal', 'ip_lan',
            ]),
        ]);

        IncidentUpdate::query()->create([
            'incident_id' => $incident->id,
            'type' => 'SYSTEM',
            'status_before' => null,
            'status_after' => FollowupStatus::PendienteContacto->value,
            'observation' => 'Ticket de mantenimiento preventivo. El colegio sigue operativo en Ping.',
            'user_id' => $userId,
            'created_at' => now(),
        ]);

        $this->ensureForIncident($incident, is_string($actor) ? $actor : null);

        return $incident->fresh() ?? $incident;
    }

    public function nextCode(string $cid): string
    {
        $cid = $this->digits($cid);
        $prefix = 'TGS_'.$cid.'_';
        $max = 0;

        ServiceTicket::query()
            ->where('ticket_code', 'like', $prefix.'%')
            ->pluck('ticket_code')
            ->each(function (string $code) use ($prefix, &$max) {
                $suffix = substr($code, strlen($prefix));
                if (ctype_digit($suffix)) {
                    $max = max($max, (int) $suffix);
                }
            });

        return $prefix.($max + 1);
    }

    public function eventText(ServiceTicket $ticket): string
    {
        $hasVisit = filled($ticket->technician_name)
            || filled($ticket->polygon)
            || filled($ticket->visit_reason)
            || $ticket->arrived_at !== null
            || $ticket->departed_at !== null
            || filled($ticket->activities)
            || filled($ticket->materials);

        if (! $hasVisit) {
            return '';
        }

        $lines = [];
        $add = function (string $label, ?string $value) use (&$lines): void {
            $value = trim((string) $value);
            if ($value !== '') {
                $lines[] = $label.': '.$value;
            }
        };

        $add('Institución educativa', $ticket->school_name);
        $add('Polígono', $ticket->polygon);
        $add('Técnico', $ticket->technician_name);
        $add('TSS', $ticket->tss);
        $add('Motivo de la visita', $ticket->visit_reason);
        $add('Hora de llegada', OperationalTime::format($ticket->arrived_at, 'd/m/Y H:i'));
        $add('Hora de salida', OperationalTime::format($ticket->departed_at, 'd/m/Y H:i'));
        $add('Actividades ejecutadas', $ticket->activities);
        $add('Materiales utilizados', $ticket->materials);

        return implode("\n", $lines);
    }

    /**
     * @return array<string, mixed>
     */
    public function toApi(ServiceTicket $ticket): array
    {
        return [
            'id' => $ticket->id,
            'incident_id' => $ticket->incident_id,
            'ticket_code' => $ticket->ticket_code,
            'kind' => $ticket->kind,
            'kind_label' => $ticket->isPreventive() ? 'Preventivo' : 'Correctivo',
            'status' => $ticket->status,
            'opened_at' => $ticket->opened_at?->toIso8601String(),
            'restored_at' => $ticket->restored_at?->toIso8601String(),
            'closed_at' => $ticket->closed_at?->toIso8601String(),
            'opened_by_name' => $ticket->opened_by_name,
            'closed_by_name' => $ticket->closed_by_name,
            'technician_name' => $ticket->technician_name,
            'polygon' => $ticket->polygon,
            'visit_reason' => $ticket->visit_reason,
            'arrived_at' => $ticket->arrived_at?->toIso8601String(),
            'departed_at' => $ticket->departed_at?->toIso8601String(),
            'activities' => $ticket->activities,
            'materials' => $ticket->materials,
            'event_detail' => $this->eventText($ticket),
        ];
    }

    private function adoptImported(Incident $incident, string $cid): ?ServiceTicket
    {
        if ($incident->isPreventive() || $cid === '0') {
            return null;
        }

        $candidate = ServiceTicket::query()
            ->whereNull('incident_id')
            ->where('source', ServiceTicket::SOURCE_IMPORT)
            ->where('cid', $cid)
            ->where('status', ServiceTicket::STATUS_OPEN)
            ->orderByDesc('opened_at')
            ->first();

        if ($candidate === null) {
            return null;
        }

        $candidate->incident_id = $incident->id;
        $candidate->school_id = $incident->school_id;
        $candidate->save();

        return $candidate;
    }

    /**
     * @param  array<string, mixed>  $overrides
     * @return array<string, mixed>
     */
    private function snapshot(Incident $incident, array $overrides): array
    {
        $incident->loadMissing(['school', 'networkAssignment']);
        $school = $incident->school;
        $legend = $incident->root_cause_code
            ? RootCauseLegend::findByCode((string) $incident->root_cause_code)
            : null;
        $minedu = $incident->minedu_reason instanceof MineduReason
            ? $incident->minedu_reason->label()
            : (is_string($incident->minedu_reason) ? $incident->minedu_reason : null);

        $base = [
            'incident_id' => $incident->id,
            'school_id' => $incident->school_id,
            'cid' => $this->cidOf($incident),
            'tss' => $school?->current_sequence !== null ? (string) $school->current_sequence : null,
            'school_name' => $school?->local_educativo,
            'province' => $school?->provincia,
            'district' => $school?->distrito,
            'area' => $school?->clasificacion,
            'minedu' => $minedu,
            'cause_code' => $incident->root_cause_code,
            'segment' => $legend['segment'] ?? null,
            'attention' => $legend['attention'] ?? null,
            'cause' => $incident->cause,
            'detail' => $incident->detail_text,
            'opened_at' => $incident->started_at,
        ];

        return array_merge($base, $overrides);
    }

    private function cidOf(Incident $incident): string
    {
        return $this->digits((string) ($incident->networkAssignment?->cid ?? ''));
    }

    private function digits(string $value): string
    {
        $digits = preg_replace('/\D+/', '', $value) ?? '';

        return $digits !== '' ? $digits : '0';
    }

    private function parseLocal(mixed $value): CarbonInterface
    {
        $text = trim((string) $value);
        if ($text === '') {
            throw new InvalidArgumentException('La fecha está vacía.');
        }

        return \Illuminate\Support\Carbon::parse($text, OperationalTime::tz());
    }
}
