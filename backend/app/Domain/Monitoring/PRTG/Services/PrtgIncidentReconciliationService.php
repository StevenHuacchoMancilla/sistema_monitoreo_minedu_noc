<?php

namespace App\Domain\Monitoring\PRTG\Services;

use App\Enums\FollowupStatus;
use App\Enums\ManagementClassification;
use App\Enums\MonitoringStatus;
use App\Models\Incident;
use App\Models\IncidentUpdate;
use App\Models\NetworkAssignment;
use App\Models\PrtgSensor;
use App\Support\OperationalTime;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Reconcilia intervalos históricos PRTG (messages Fallo/OK) con incidents.
 * Idempotente. No crea Tracking ni gestiones humanas.
 *
 * Confianza:
 * - high: Fallo/OK claros + match start/recovery/fingerprint; CREATE cerrado;
 *         recovered_at alineado a OK sin gestiones humanas
 * - medium: CREATE < 30s
 * - review: overlap ambiguo, OPEN create, recovered_at con gestiones
 */
class PrtgIncidentReconciliationService
{
    public const SOURCE_RECONCILIATION = 'PRTG_RECONCILIATION';

    public const SOURCE_REALTIME = 'REALTIME_SYNC';

    public function __construct(
        private readonly PrtgHistoricOutageReader $reader,
        private readonly int $matchToleranceSeconds = 120,
        private readonly int $falloAlignSeconds = 180,
    ) {}

    /**
     * @param  array<int, array{started_at: CarbonImmutable, recovered_at: ?CarbonImmutable}>|null  $outages
     * @return array{
     *   actions: array<int, array<string, mixed>>,
     *   summary: array{create: int, update: int, unchanged: int, conflict: int, skipped: int}
     * }
     */
    public function reconcileSensor(
        PrtgSensor $sensor,
        CarbonImmutable $fromUtc,
        CarbonImmutable $toUtc,
        bool $dryRun = true,
        ?array $outages = null,
        ?string $batch = null,
    ): array {
        $assignment = NetworkAssignment::query()->find($sensor->network_assignment_id);
        if (! $assignment) {
            return [
                'actions' => [[
                    'action' => 'CONFLICT',
                    'confidence' => 'review',
                    'reason' => 'Sensor sin network_assignment',
                ]],
                'summary' => ['create' => 0, 'update' => 0, 'unchanged' => 0, 'conflict' => 1, 'skipped' => 0],
            ];
        }

        if ($outages === null) {
            $outages = $this->reader->intervalsForSensor((int) $sensor->prtg_sensor_id, $fromUtc, $toUtc)['outages'];
        }

        $candidates = Incident::query()
            ->where('network_assignment_id', $assignment->id)
            ->where('prtg_sensor_id', $sensor->id)
            ->where('started_at', '<=', $toUtc)
            ->where(function ($q) use ($fromUtc) {
                $q->whereNull('recovered_at')->orWhere('recovered_at', '>=', $fromUtc);
            })
            ->withCount('managements')
            ->orderBy('started_at')
            ->get();

        $used = [];
        $actions = [];

        foreach ($outages as $outage) {
            $planned = $this->planOne($assignment, $sensor, $outage, $candidates, $used, true);
            $planned = $this->annotateConfidence($planned, $outage);

            $inBatch = $batch === null || $this->passesBatchFilter($planned, $batch);
            $canWrite = ($planned['confidence'] ?? '') === 'high'
                && in_array($planned['action'], ['CREATE', 'UPDATE'], true);

            if (! $inBatch) {
                if (isset($planned['incident_id'])) {
                    unset($used[(int) $planned['incident_id']]);
                }
                $planned['action'] = 'SKIPPED';
                $planned['reason'] = trim(($planned['reason'] ?? '').' [fuera de lote '.$batch.']');
                $actions[] = $planned;
                continue;
            }

            if ($dryRun) {
                if ($planned['action'] === 'CREATE' && ! (bool) config('incidents.reconciliation_allow_creates', false)) {
                    $planned['action'] = 'SKIPPED';
                    $planned['reason'] = trim(($planned['reason'] ?? '').' [CREATE histórico deshabilitado; INCIDENT_USE_SYSTEM_CLOCK / registro nuevo]');
                    $planned['confidence'] = 'review';
                    $planned['confidence_reason'] = 'Creates históricos deshabilitados (config incidents.reconciliation_allow_creates=false)';
                }
                $actions[] = $planned;
                continue;
            }

            // APPLY: UNCHANGED/CONFLICT se reportan tal cual.
            if (in_array($planned['action'], ['UNCHANGED', 'CONFLICT', 'SKIPPED'], true)) {
                $actions[] = $planned;
                continue;
            }

            // Política: no crear incidencias retrospectivas desde messages (evita micro-outages).
            if ($planned['action'] === 'CREATE' && ! (bool) config('incidents.reconciliation_allow_creates', false)) {
                $planned['action'] = 'SKIPPED';
                $planned['reason'] = trim(($planned['reason'] ?? '').' [CREATE histórico deshabilitado]');
                $planned['confidence'] = 'review';
                $actions[] = $planned;
                continue;
            }

            // APPLY: solo high confidence CREATE/UPDATE
            if (! $canWrite) {
                if (isset($planned['incident_id'])) {
                    unset($used[(int) $planned['incident_id']]);
                }
                $planned['action'] = 'SKIPPED';
                $planned['reason'] = trim(($planned['reason'] ?? '').' [apply requiere confidence=high]');
                $actions[] = $planned;
                continue;
            }

            if (isset($planned['incident_id'])) {
                unset($used[(int) $planned['incident_id']]);
            }
            $written = $this->planOne($assignment, $sensor, $outage, $candidates, $used, false);
            $actions[] = $this->annotateConfidence($written, $outage);
        }

        $summary = ['create' => 0, 'update' => 0, 'unchanged' => 0, 'conflict' => 0, 'skipped' => 0];
        foreach ($actions as $a) {
            $key = strtolower((string) ($a['action'] ?? ''));
            if (isset($summary[$key])) {
                $summary[$key]++;
            }
        }

        return ['actions' => $actions, 'summary' => $summary];
    }

    /**
     * @param  Collection<int, Incident>  $candidates
     * @param  array<int, true>  $used
     * @param  array{started_at: CarbonImmutable, recovered_at: ?CarbonImmutable}  $outage
     * @return array<string, mixed>
     */
    private function planOne(
        NetworkAssignment $assignment,
        PrtgSensor $sensor,
        array $outage,
        Collection $candidates,
        array &$used,
        bool $dryRun,
    ): array {
        $start = $outage['started_at']->utc();
        $end = $outage['recovered_at']?->utc();
        $fp = PrtgHistoricOutageReader::fingerprint((string) $sensor->prtg_sensor_id, $start);
        $tz = OperationalTime::tz();

        $base = [
            'prtg' => [
                'down' => $start->timezone($tz)->format('Y-m-d H:i:s'),
                'up' => $end?->timezone($tz)->format('Y-m-d H:i:s'),
                'fingerprint' => $fp,
                'down_utc' => $start->format('Y-m-d\TH:i:s\Z'),
                'up_utc' => $end?->format('Y-m-d\TH:i:s\Z'),
            ],
            'evidence' => 'PRTG messages status=Fallo/OK',
        ];

        $byFp = $candidates->first(fn (Incident $i) => $i->prtg_down_fingerprint === $fp);
        if ($byFp && ! isset($used[$byFp->id])) {
            $used[$byFp->id] = true;

            return $this->decideUpdateOrUnchanged($byFp, $start, $end, $fp, $base + ['match_kind' => 'fingerprint'], $dryRun);
        }

        $matches = [];
        foreach ($candidates as $incident) {
            if (isset($used[$incident->id])) {
                continue;
            }
            $match = $this->classifyMatch($incident, $start, $end);
            if ($match !== null) {
                $matches[] = $match + ['incident' => $incident];
            }
        }

        usort($matches, fn ($a, $b) => $a['score'] <=> $b['score']);

        if (count($matches) > 1 && $matches[0]['score'] === $matches[1]['score']) {
            return $base + [
                'action' => 'CONFLICT',
                'reason' => 'CONFLICT_REQUIRES_REVIEW: matching ambiguo',
                'candidate_ids' => array_map(fn ($m) => $m['incident']->id, array_slice($matches, 0, 3)),
                'match_kind' => 'ambiguous',
            ];
        }

        if ($matches === []) {
            return $this->createIncident($assignment, $sensor, $start, $end, $fp, $base, $dryRun);
        }

        $best = $matches[0];
        $incident = $best['incident'];
        $used[$incident->id] = true;

        return $this->decideUpdateOrUnchanged(
            $incident,
            $start,
            $end,
            $fp,
            $base + ['match_kind' => $best['kind']],
            $dryRun,
        );
    }

    /**
     * @return array{kind: string, score: int}|null
     */
    private function classifyMatch(Incident $incident, CarbonImmutable $start, ?CarbonImmutable $end): ?array
    {
        $startDelta = abs($incident->started_at->getTimestamp() - $start->getTimestamp());
        if ($startDelta <= $this->matchToleranceSeconds) {
            return ['kind' => 'start', 'score' => $startDelta];
        }

        if ($end && $incident->recovered_at) {
            $endDelta = abs($incident->recovered_at->getTimestamp() - $end->getTimestamp());
            if ($endDelta <= $this->matchToleranceSeconds) {
                return ['kind' => 'recovery', 'score' => 10_000 + $endDelta + $startDelta];
            }
        }

        if ($end && $incident->recovered_at) {
            $a0 = $start->getTimestamp();
            $a1 = $end->getTimestamp();
            $b0 = $incident->started_at->getTimestamp();
            $b1 = $incident->recovered_at->getTimestamp();
            $overlap = min($a1, $b1) - max($a0, $b0);
            $prtgDur = max(1, $a1 - $a0);
            $endDelta = abs($b1 - $a1);
            if ($overlap > 0 && ($overlap / $prtgDur) >= 0.5 && $endDelta <= 600) {
                return ['kind' => 'overlap', 'score' => 50_000 + $startDelta];
            }
        }

        return null;
    }

    /**
     * @param  array{started_at: CarbonImmutable, recovered_at: ?CarbonImmutable}  $outage
     * @param  array<string, mixed>  $action
     * @return array<string, mixed>
     */
    private function annotateConfidence(array $action, array $outage): array
    {
        $verb = (string) ($action['action'] ?? '');
        if (in_array($verb, ['UNCHANGED', 'SKIPPED'], true)) {
            $action['confidence'] = 'high';

            return $action;
        }
        if ($verb === 'CONFLICT') {
            $action['confidence'] = 'review';

            return $action;
        }

        $kind = (string) ($action['match_kind'] ?? '');
        $end = $outage['recovered_at'];

        if ($verb === 'CREATE') {
            if ($end === null) {
                $action['confidence'] = 'review';
                $action['confidence_reason'] = 'CREATE abierto (sin UP PRTG) — revisar';

                return $action;
            }
            $dur = $end->getTimestamp() - $outage['started_at']->getTimestamp();
            if ($dur < 30) {
                $action['confidence'] = 'medium';
                $action['confidence_reason'] = 'CREATE < 30s';

                return $action;
            }
            $action['confidence'] = 'high';
            $action['confidence_reason'] = 'CREATE cerrado desde Fallo→OK messages';

            return $action;
        }

        if ($verb === 'UPDATE') {
            $fields = $action['fields'] ?? [];
            $onlyMeta = $fields === ['fingerprint' => 'set'] || $fields === [];
            if ($onlyMeta || (is_array($fields) && ! isset($fields['started_at']) && ! isset($fields['recovered_at']))) {
                $action['confidence'] = 'high';
                $action['confidence_reason'] = 'Solo fingerprint/metadatos PRTG';

                return $action;
            }

            if ($kind === 'overlap') {
                $action['confidence'] = 'review';
                $action['confidence_reason'] = 'Match por overlap — no auto-aplicar';

                return $action;
            }

            if (isset($fields['started_at']) && is_array($fields['started_at'])) {
                $from = strtotime((string) $fields['started_at']['from']);
                $to = strtotime((string) $fields['started_at']['to']);
                $delta = (int) ($fields['started_at']['delta_seconds'] ?? abs($to - $from));

                // Corrección clásica: sync detectó tarde → started_at más temprano (Fallo real)
                if ($to < $from && in_array($kind, ['recovery', 'start', 'fingerprint'], true)) {
                    $action['confidence'] = 'high';
                    $action['confidence_reason'] = 'started_at adelantado a Fallo PRTG; match='.$kind;

                    return $action;
                }

                // Alineación Advertencia→Fallo: mover adelante ≤ 3 min
                if ($to > $from && $delta <= $this->falloAlignSeconds && in_array($kind, ['recovery', 'start', 'fingerprint'], true)) {
                    $action['confidence'] = 'high';
                    $action['confidence_reason'] = 'started_at alineado a Fallo (≤180s); match='.$kind;

                    return $action;
                }

                $action['confidence'] = 'review';
                $action['confidence_reason'] = 'started_at desplazamiento sospechoso (Δ='.$delta.'s, kind='.$kind.')';

                return $action;
            }

            if (isset($fields['recovered_at'])) {
                if ($kind === 'overlap') {
                    $action['confidence'] = 'review';
                    $action['confidence_reason'] = 'recovered_at con match overlap — no auto-aplicar';

                    return $action;
                }

                // Verdad operativa: primer OK tras Fallo. Solo high si match técnico claro.
                if (in_array($kind, ['recovery', 'start', 'fingerprint'], true)) {
                    $delta = (int) ($fields['recovered_at']['delta_seconds'] ?? 0);
                    $action['confidence'] = 'high';
                    $action['confidence_reason'] = 'recovered_at alineado a OK PRTG (Δ='.$delta.'s); match='.$kind;

                    return $action;
                }

                $action['confidence'] = 'medium';
                $action['confidence_reason'] = 'Cambio recovered_at (match débil)';

                return $action;
            }
        }

        $action['confidence'] = 'review';
        $action['confidence_reason'] = 'Sin regla de confianza';

        return $action;
    }

    /**
     * @param  array<string, mixed>  $action
     */
    private function passesBatchFilter(array $action, string $batch): bool
    {
        $verb = (string) ($action['action'] ?? '');
        $confidence = (string) ($action['confidence'] ?? '');
        $fields = $action['fields'] ?? [];

        return match ($batch) {
            'high' => $confidence === 'high' && in_array($verb, ['CREATE', 'UPDATE', 'UNCHANGED'], true),
            'high-time-earlier' => $verb === 'UPDATE'
                && $confidence === 'high'
                && isset($fields['started_at']['from'], $fields['started_at']['to'])
                && strtotime((string) $fields['started_at']['to']) < strtotime((string) $fields['started_at']['from']),
            'high-time-align' => $verb === 'UPDATE'
                && $confidence === 'high'
                && isset($fields['started_at']['from'], $fields['started_at']['to'])
                && strtotime((string) $fields['started_at']['to']) >= strtotime((string) $fields['started_at']['from']),
            'high-creates' => $verb === 'CREATE' && $confidence === 'high',
            'high-recovery' => $verb === 'UPDATE'
                && $confidence === 'high'
                && isset($fields['recovered_at'])
                && ! isset($fields['started_at']),
            'meta' => $verb === 'UPDATE'
                && $confidence === 'high'
                && ! isset($fields['started_at'])
                && ! isset($fields['recovered_at']),
            default => true,
        };
    }

    /**
     * @param  array<string, mixed>  $base
     * @return array<string, mixed>
     */
    private function decideUpdateOrUnchanged(
        Incident $incident,
        CarbonImmutable $start,
        ?CarbonImmutable $end,
        string $fp,
        array $base,
        bool $dryRun,
    ): array {
        $tz = OperationalTime::tz();
        $fields = [];
        $startDelta = abs($incident->started_at->getTimestamp() - $start->getTimestamp());
        if ($startDelta > $this->matchToleranceSeconds) {
            $fields['started_at'] = [
                'from' => $incident->started_at->timezone($tz)->format('Y-m-d H:i:s'),
                'to' => $start->timezone($tz)->format('Y-m-d H:i:s'),
                'delta_seconds' => $startDelta,
            ];
        }

        if ($end !== null) {
            if ($incident->recovered_at === null) {
                $fields['recovered_at'] = [
                    'from' => null,
                    'to' => $end->timezone($tz)->format('Y-m-d H:i:s'),
                ];
            } else {
                $endDelta = abs($incident->recovered_at->getTimestamp() - $end->getTimestamp());
                if ($endDelta > $this->matchToleranceSeconds) {
                    if ((int) ($incident->managements_count ?? $incident->managements()->count()) > 0) {
                        return $base + [
                            'action' => 'CONFLICT',
                            'reason' => 'CONFLICT_REQUIRES_REVIEW: recovered_at difiere y hay gestiones humanas',
                            'incident_id' => $incident->id,
                            'fields' => [
                                'recovered_at' => [
                                    'from' => $incident->recovered_at->timezone($tz)->format('Y-m-d H:i:s'),
                                    'to' => $end->timezone($tz)->format('Y-m-d H:i:s'),
                                    'delta_seconds' => $endDelta,
                                ],
                            ],
                        ];
                    }
                    $fields['recovered_at'] = [
                        'from' => $incident->recovered_at->timezone($tz)->format('Y-m-d H:i:s'),
                        'to' => $end->timezone($tz)->format('Y-m-d H:i:s'),
                        'delta_seconds' => $endDelta,
                    ];
                }
            }
        }

        $needsFp = $incident->prtg_down_fingerprint !== $fp;
        $metaStartDelta = $incident->prtg_down_started_at
            ? abs($incident->prtg_down_started_at->getTimestamp() - $start->getTimestamp())
            : PHP_INT_MAX;
        $metaUpDelta = ($end && $incident->prtg_up_at)
            ? abs($incident->prtg_up_at->getTimestamp() - $end->getTimestamp())
            : (($end === null && $incident->prtg_up_at === null) ? 0 : PHP_INT_MAX);
        $needsMeta = $metaStartDelta > 1 || ($end !== null && $metaUpDelta > 1);

        if ($fields === [] && ! $needsFp && ! $needsMeta) {
            return $base + [
                'action' => 'UNCHANGED',
                'incident_id' => $incident->id,
            ];
        }

        // Si solo metadatos drift de 1s por cast DB, no reescribir.
        if ($fields === [] && ! $needsFp && $needsMeta && $metaStartDelta <= 2 && $metaUpDelta <= 2) {
            return $base + [
                'action' => 'UNCHANGED',
                'incident_id' => $incident->id,
            ];
        }

        if (! $dryRun) {
            $payload = [
                'prtg_down_fingerprint' => $fp,
                'prtg_down_started_at' => OperationalTime::toStorage($start),
                'prtg_up_at' => $end ? OperationalTime::toStorage($end) : null,
            ];
            if (isset($fields['started_at'])) {
                $payload['started_at'] = OperationalTime::toStorage($start);
            }
            if (isset($fields['recovered_at']) && $incident->recovered_at === null && $end) {
                $payload['recovered_at'] = OperationalTime::toStorage($end);
                $payload['current_status'] = MonitoringStatus::Operativo->value;
                $payload['followup_status'] = FollowupStatus::Recuperado->value;
            } elseif (isset($fields['recovered_at']) && $end && $incident->recovered_at !== null
                && (int) ($incident->managements_count ?? 0) === 0) {
                $payload['recovered_at'] = OperationalTime::toStorage($end);
            }
            if ($incident->detection_source === null) {
                $payload['detection_source'] = self::SOURCE_REALTIME;
            }
            $incident->update($payload);

            if (isset($fields['started_at']) || isset($fields['recovered_at'])) {
                IncidentUpdate::query()->create([
                    'incident_id' => $incident->id,
                    'type' => 'SYSTEM',
                    'status_before' => null,
                    'status_after' => $incident->fresh()->followup_status?->value,
                    'observation' => 'Timestamps técnicos corregidos por reconciliación histórica PRTG (messages Fallo/OK).',
                    'created_at' => now(),
                ]);
            }
        }

        return $base + [
            'action' => 'UPDATE',
            'incident_id' => $incident->id,
            'fields' => $fields === [] ? ['fingerprint' => 'set'] : $fields,
            'reason' => $fields === [] ? 'Adjuntar fingerprint/metadatos PRTG' : 'Corregir timestamps técnicos',
        ];
    }

    /**
     * @param  array<string, mixed>  $base
     * @return array<string, mixed>
     */
    private function createIncident(
        NetworkAssignment $assignment,
        PrtgSensor $sensor,
        CarbonImmutable $start,
        ?CarbonImmutable $end,
        string $fp,
        array $base,
        bool $dryRun,
    ): array {
        $existing = Incident::query()->where('prtg_down_fingerprint', $fp)->first();
        if ($existing) {
            return $base + [
                'action' => 'UNCHANGED',
                'incident_id' => $existing->id,
                'reason' => 'Fingerprint ya existe',
                'match_kind' => 'fingerprint',
            ];
        }

        if ($dryRun) {
            return $base + [
                'action' => 'CREATE',
                'reason' => 'No matching incident',
                'match_kind' => 'none',
            ];
        }

        $school = $assignment->school()->first();
        $recovered = $end !== null;

        $incident = DB::transaction(function () use ($assignment, $sensor, $school, $start, $end, $fp, $recovered) {
            $incident = Incident::query()->create([
                'school_id' => $assignment->school_id,
                'network_assignment_id' => $assignment->id,
                'prtg_sensor_id' => $sensor->id,
                'detection_source' => self::SOURCE_RECONCILIATION,
                'prtg_down_fingerprint' => $fp,
                'prtg_down_started_at' => OperationalTime::toStorage($start),
                'prtg_up_at' => $end ? OperationalTime::toStorage($end) : null,
                'started_at' => OperationalTime::toStorage($start),
                'recovered_at' => $recovered && $end ? OperationalTime::toStorage($end) : null,
                'current_status' => $recovered
                    ? MonitoringStatus::Operativo->value
                    : MonitoringStatus::Caido->value,
                'followup_status' => $recovered
                    ? FollowupStatus::Recuperado
                    : FollowupStatus::PendienteContacto,
                'management_classification' => ManagementClassification::NewOutage,
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
                'status_after' => $incident->followup_status?->value,
                'observation' => $recovered
                    ? 'Incidencia histórica creada por reconciliación PRTG (Fallo→OK). Sin Tracking.'
                    : 'Incidencia histórica abierta por reconciliación PRTG (Fallo sin UP). Sin Tracking.',
                'created_at' => now(),
            ]);

            return $incident;
        });

        return $base + [
            'action' => 'CREATE',
            'incident_id' => $incident->id,
            'reason' => 'No matching incident',
            'match_kind' => 'none',
        ];
    }
}
