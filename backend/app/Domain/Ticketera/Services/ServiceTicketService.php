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
 * Código de ticketera único TGS_{CID}_{n} y reporte de visita.
 * Correctivo: nace al gestionar la caída (no al detectar PRTG).
 * Preventivo / ticket manual: se crea al abrir el caso a propósito.
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

            $code = $this->nextCodeLocked($cid);

            $kind = $incident->isPreventive()
                ? ServiceTicket::KIND_PREVENTIVE
                : ServiceTicket::KIND_CORRECTIVE;

            return ServiceTicket::query()->create($this->snapshot($incident, [
                'ticket_code' => $code,
                'kind' => $kind,
                'is_maintenance' => $kind === ServiceTicket::KIND_PREVENTIVE
                    || $this->shouldMarkMaintenance($incident, null),
                'status' => ServiceTicket::STATUS_OPEN,
                'opened_by_name' => $openedBy,
                'source' => ServiceTicket::SOURCE_LIVE,
            ]));
        });
    }

    public function syncFromIncident(Incident $incident, ?string $actorName = null): ?ServiceTicket
    {
        $ticket = ServiceTicket::query()->where('incident_id', $incident->id)->first();
        // Primera gestión (o preventivo): aquí nace el ticket único.
        if ($ticket === null) {
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
        if ($this->shouldMarkMaintenance($incident, $ticket)) {
            $ticket->is_maintenance = true;
        }
        $ticket->save();

        return $ticket->fresh() ?? $ticket;
    }

    public function markMaintenance(Incident $incident, bool $flag = true): ?ServiceTicket
    {
        $ticket = $this->ensureForIncident($incident);
        $ticket->is_maintenance = $flag;
        $ticket->save();

        return $ticket->fresh() ?? $ticket;
    }

    public function shouldMarkMaintenance(Incident $incident, ?ServiceTicket $ticket = null): bool
    {
        if ($ticket?->isPreventive() || $incident->isPreventive()) {
            return true;
        }
        if (ServiceTicket::isMaintenanceCause($incident->root_cause_code)) {
            return true;
        }
        $code = $ticket?->cause_code ?: $incident->root_cause_code;

        return ServiceTicket::isMaintenanceCause($code);
    }

    /**
     * Asegura TGS en un incidente existente y aplica tipo + campos de detalle de evento.
     *
     * @param  array<string, mixed>  $payload
     */
    public function ensureTicketForIncident(Incident $incident, array $payload, ?string $actorName = null): ServiceTicket
    {
        $kind = strtoupper(trim((string) ($payload['kind'] ?? ServiceTicket::KIND_CORRECTIVE)));
        if (! in_array($kind, ServiceTicket::kinds(), true)) {
            throw new InvalidArgumentException('Tipo de ticket inválido.');
        }

        $ticket = $this->ensureForIncident($incident, $actorName);
        $ticket->kind = $kind;
        $ticket->is_maintenance = $kind === ServiceTicket::KIND_PREVENTIVE
            || $this->shouldMarkMaintenance($incident, $ticket);
        if ($actorName && trim((string) $ticket->opened_by_name) === '') {
            $ticket->opened_by_name = $actorName;
        }
        $ticket->save();

        $visitKeys = [
            'arrived_at', 'departed_at', 'restored_at', 'closed_at',
            'technician_name', 'technician_phone', 'polygon', 'visit_reason',
            'activities', 'materials', 'opened_at',
        ];
        $visit = [];
        foreach ($visitKeys as $key) {
            if (array_key_exists($key, $payload) && $payload[$key] !== null && $payload[$key] !== '') {
                $visit[$key] = $payload[$key];
            }
        }
        if ($visit !== []) {
            $ticket = $this->recordVisit($incident, $visit, $actorName);
        }

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

    /** Re-caída sobre incidencia abierta: limpia restored_at y mantiene el mismo TGS. */
    public function markDownAgain(Incident $incident): void
    {
        $ticket = ServiceTicket::query()->where('incident_id', $incident->id)->first();
        if ($ticket === null || $ticket->isPreventive()) {
            return;
        }

        $ticket->restored_at = null;
        if ($ticket->status === ServiceTicket::STATUS_CLOSED) {
            $ticket->status = ServiceTicket::STATUS_OPEN;
            $ticket->closed_at = null;
            $ticket->closed_by_name = null;
        }
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

        foreach (['technician_name', 'technician_phone', 'polygon', 'visit_reason', 'activities', 'materials'] as $field) {
            if (array_key_exists($field, $payload)) {
                $value = trim((string) ($payload[$field] ?? ''));
                $ticket->{$field} = $value !== '' ? $value : null;
            }
        }

        // Hora de inicio del mantenimiento: si no hay arrived_at, usa opened_at editable en preventivo/mantenimiento.
        if (! $preventive && $ticket->is_maintenance && array_key_exists('opened_at', $payload) && ! empty($payload['opened_at'])) {
            $opened = $this->parseLocal($payload['opened_at']);
            $ticket->opened_at = OperationalTime::toStorage($opened);
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

    /**
     * Correctivo de mantenimiento con colegio operativo (GS01).
     * Si ya hay caída abierta, no se usa este método: se etiqueta el ticket existente.
     */
    public function openMaintenanceCorrective(NetworkAssignment $assignment, int $userId, CarbonInterface $startedAt, ?string $detail = null): Incident
    {
        if ($userId < 1) {
            throw new InvalidArgumentException('Se requiere un usuario autenticado.');
        }

        $assignment->loadMissing(['school', 'sensors']);

        $openFall = Incident::query()
            ->falls()
            ->where('network_assignment_id', $assignment->id)
            ->whereNull('recovered_at')
            ->orderByDesc('id')
            ->first();
        if ($openFall) {
            $this->ensureForIncident($openFall);
            $this->markMaintenance($openFall);

            return $openFall->fresh() ?? $openFall;
        }

        $openMaint = Incident::query()
            ->where('network_assignment_id', $assignment->id)
            ->where('detection_source', Incident::DETECTION_MAINTENANCE)
            ->whereNull('recovered_at')
            ->whereHas('serviceTicket', fn ($q) => $q->where('status', ServiceTicket::STATUS_OPEN))
            ->exists();
        if ($openMaint) {
            throw new InvalidArgumentException('Ya hay un mantenimiento correctivo abierto para este colegio.');
        }

        $school = $assignment->school;
        $actor = User::query()->find($userId)?->name;
        $incident = Incident::query()->create([
            'school_id' => $assignment->school_id,
            'network_assignment_id' => $assignment->id,
            'prtg_sensor_id' => null,
            'detection_source' => Incident::DETECTION_MAINTENANCE,
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
            'observation' => 'Ticket de mantenimiento correctivo programado. El colegio puede seguir operativo en Ping.',
            'user_id' => $userId,
            'created_at' => now(),
        ]);

        $ticket = $this->ensureForIncident($incident, is_string($actor) ? $actor : null);
        $ticket->is_maintenance = true;
        $ticket->kind = ServiceTicket::KIND_CORRECTIVE;
        $ticket->save();

        return $incident->fresh() ?? $incident;
    }

    public function nextCode(string $cid): string
    {
        return $this->allocateCode($cid, lock: false);
    }

    /**
     * Sucesión única por CID: TGS_{CID}_{n}. Requiere transacción abierta.
     */
    private function nextCodeLocked(string $cid): string
    {
        return $this->allocateCode($cid, lock: true);
    }

    /**
     * Código único de atención: TGS_{CID}_{seq}_{stamp}
     * - seq = sucesión por CID (1, 2, 3…)
     * - stamp = YmdHis Lima → evita colisiones y deja trazabilidad temporal
     */
    private function allocateCode(string $cid, bool $lock): string
    {
        $cid = $this->digits($cid);
        $legacyPrefix = 'TGS_'.$cid.'_';
        $max = 0;

        $query = ServiceTicket::query()->where('ticket_code', 'like', $legacyPrefix.'%');
        if ($lock) {
            $query->lockForUpdate();
        }

        $query->pluck('ticket_code')->each(function (string $code) use ($legacyPrefix, &$max) {
            $rest = substr($code, strlen($legacyPrefix));
            // Soporta TGS_CID_n y TGS_CID_n_YYYYMMDDHHMMSS
            $seq = (int) explode('_', $rest, 2)[0];
            if ($seq > 0) {
                $max = max($max, $seq);
            }
        });

        $seq = $max + 1;
        $stamp = OperationalTime::now()->format('YmdHis');
        $candidate = sprintf('TGS_%s_%d_%s', $cid, $seq, $stamp);

        // Extremadamente raro: mismo segundo + misma seq; fuerza unicidad.
        $n = 0;
        while (ServiceTicket::query()->where('ticket_code', $candidate)->exists()) {
            $n++;
            $candidate = sprintf('TGS_%s_%d_%s_%d', $cid, $seq, $stamp, $n);
            if ($n > 20) {
                $candidate = sprintf('TGS_%s_%d_%s', $cid, $seq, strtoupper(bin2hex(random_bytes(3))));
                break;
            }
        }

        return $candidate;
    }

    /**
     * Quita tickets LIVE que nunca tuvieron gestión humana (legado: se creaban al caer / watch viejo).
     *
     * @return int Filas eliminadas
     */
    public function pruneUnmanagedLiveTickets(): int
    {
        return (int) ServiceTicket::query()
            ->where('source', ServiceTicket::SOURCE_LIVE)
            ->where(function ($q) {
                $q->whereDoesntHave('incident')
                    ->orWhereHas('incident', fn ($i) => $i->whereDoesntHave('managements'));
            })
            ->delete();
    }

    public function eventText(ServiceTicket $ticket): string
    {
        $startAt = $ticket->arrived_at ?? $ticket->opened_at;
        $hasVisit = filled($ticket->technician_name)
            || filled($ticket->technician_phone)
            || filled($ticket->polygon)
            || filled($ticket->visit_reason)
            || $startAt !== null
            || $ticket->restored_at !== null
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
        $addBlock = function (string $label, ?string $value) use (&$lines): void {
            $value = trim((string) $value);
            if ($value === '') {
                return;
            }
            $lines[] = $label.':';
            foreach (preg_split('/\r\n|\r|\n/', $value) ?: [] as $raw) {
                $line = trim((string) $raw);
                if ($line === '') {
                    continue;
                }
                if (! str_starts_with($line, '•') && ! str_starts_with($line, '-') && ! str_starts_with($line, '*')) {
                    $line = '• '.$line;
                }
                $lines[] = $line;
            }
        };

        // Formato Detalle de Evento (cliente / reporte general).
        $add('Hora de Inicio', OperationalTime::format($startAt, 'H:i'));
        $add('Datos del técnico', $ticket->technician_name);
        $add('Celular', $ticket->technician_phone);
        $addBlock('Actividades ejecutadas', $ticket->activities);
        $addBlock('Materiales utilizados', $ticket->materials);
        if (! $ticket->isPreventive()) {
            $add('Hora de restablecimiento', OperationalTime::format($ticket->restored_at, 'H:i'));
        }
        $add('Hora de salida', OperationalTime::format($ticket->departed_at, 'H:i'));

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
            'kind_label' => ServiceTicket::kindLabel($ticket->kind),
            'is_maintenance' => (bool) $ticket->is_maintenance,
            'status' => $ticket->status,
            'cid' => $ticket->cid,
            'tss' => $ticket->tss,
            'school_name' => $ticket->school_name,
            'province' => $ticket->province,
            'district' => $ticket->district,
            'cause_code' => $ticket->cause_code,
            'cause' => $ticket->cause,
            'detail' => $ticket->detail,
            'opened_at' => $ticket->opened_at?->toIso8601String(),
            'restored_at' => $ticket->restored_at?->toIso8601String(),
            'closed_at' => $ticket->closed_at?->toIso8601String(),
            'opened_by_name' => $ticket->opened_by_name,
            'closed_by_name' => $ticket->closed_by_name,
            'technician_name' => $ticket->technician_name,
            'technician_phone' => $ticket->technician_phone,
            'polygon' => $ticket->polygon,
            'visit_reason' => $ticket->visit_reason,
            'arrived_at' => $ticket->arrived_at?->toIso8601String(),
            'departed_at' => $ticket->departed_at?->toIso8601String(),
            'activities' => $ticket->activities,
            'materials' => $ticket->materials,
            'event_detail' => $this->eventText($ticket),
        ];
    }

    /**
     * @return array{data: list<array<string, mixed>>, meta: array<string, mixed>}
     */
    public function listMaintenance(string $status = ServiceTicket::STATUS_OPEN, ?string $q = null, int $page = 1, int $perPage = 25): array
    {
        $status = strtoupper($status) === ServiceTicket::STATUS_CLOSED
            ? ServiceTicket::STATUS_CLOSED
            : ServiceTicket::STATUS_OPEN;
        $page = max(1, $page);
        $perPage = max(1, min(100, $perPage));

        $query = ServiceTicket::query()
            ->with(['incident.school', 'school'])
            ->where('is_maintenance', true)
            ->where('status', $status)
            ->orderByDesc($status === ServiceTicket::STATUS_CLOSED ? 'closed_at' : 'opened_at')
            ->orderByDesc('id');

        $needle = trim((string) $q);
        if ($needle !== '') {
            $like = '%'.$needle.'%';
            $query->where(function ($w) use ($like, $needle) {
                $w->where('ticket_code', 'like', $like)
                    ->orWhere('cid', 'like', $like)
                    ->orWhere('tss', 'like', $like)
                    ->orWhere('school_name', 'like', $like)
                    ->orWhere('technician_name', 'like', $like);
                if (ctype_digit($needle)) {
                    $w->orWhere('tss', $needle)->orWhere('cid', $needle);
                }
            });
        }

        $total = (clone $query)->count();
        $rows = $query->forPage($page, $perPage)->get()->map(function (ServiceTicket $ticket) {
            $api = $this->toApi($ticket);
            $fromSchool = $ticket->incident?->school?->local_educativo
                ?? $ticket->school?->local_educativo;
            $snap = trim((string) ($ticket->school_name ?? ''));
            // Evita mostrar TSS/códigos numéricos como si fueran el nombre del colegio.
            $api['local_educativo'] = ($snap !== '' && ! ctype_digit($snap))
                ? $snap
                : ($fromSchool ?: ($snap !== '' ? $snap : null));
            if (filled($fromSchool) && (trim((string) $ticket->school_name) === '' || ctype_digit(trim((string) $ticket->school_name)))) {
                $api['school_name'] = $fromSchool;
            }
            $api['incident_followup'] = $ticket->incident?->followup_status?->value
                ?? $ticket->incident?->followup_status;

            return $api;
        })->values()->all();

        return [
            'data' => $rows,
            'meta' => [
                'total' => $total,
                'page' => $page,
                'per_page' => $perPage,
                'last_page' => max(1, (int) ceil($total / $perPage)),
                'status' => $status,
                'open_count' => ServiceTicket::query()->where('is_maintenance', true)->where('status', ServiceTicket::STATUS_OPEN)->count(),
                'closed_count' => ServiceTicket::query()->where('is_maintenance', true)->where('status', ServiceTicket::STATUS_CLOSED)->count(),
            ],
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
            'energy' => $school?->energy_type,
            'area' => $school?->ambito ?: $school?->clasificacion,
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
