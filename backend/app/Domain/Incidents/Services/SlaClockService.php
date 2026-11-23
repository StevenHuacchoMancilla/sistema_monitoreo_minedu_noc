<?php

namespace App\Domain\Incidents\Services;

use App\Enums\MineduReason;
use App\Models\Incident;
use App\Models\School;
use App\Support\OperationalTime;
use Carbon\CarbonInterface;
use Illuminate\Support\Carbon;

/**
 * SLA mensual por colegio y parada de reloj.
 * Rural: 36 h. Urbano: 6 h. Solo descuenta el mes cuando la razón MINEDU es Incidencia.
 * Total = reloj de 24 h. Efectivo = solo 08:00–16:00 (America/Lima), menos la parada que cae en ese horario.
 */
class SlaClockService
{
    public const RURAL_SECONDS = 36 * 3600;

    public const URBAN_SECONDS = 6 * 3600;

    public const BUSINESS_START_HOUR = 8;

    public const BUSINESS_END_HOUR = 16;

    /**
     * @return array<string, mixed>
     */
    public function snapshot(Incident $incident): array
    {
        $incident->loadMissing('school');
        $zone = $this->zoneForSchool($incident->school);
        $cap = $zone['cap_seconds'];
        $reason = $incident->minedu_reason instanceof MineduReason
            ? $incident->minedu_reason
            : MineduReason::tryFrom((string) $incident->minedu_reason);
        $applies = $reason !== null;

        $now = OperationalTime::now();
        $total = $this->elapsedSeconds($incident, $now);
        $effective = $this->effectiveSeconds($incident, $now);
        $pause = $this->pauseSeconds($incident, $now);
        $used = $incident->school_id
            ? $this->monthUsageSeconds((int) $incident->school_id, $incident->id, $effective, $applies)
            : 0;

        return [
            'applies' => $applies,
            'zone' => $zone['zone'],
            'zone_label' => $zone['label'],
            'monthly_cap_seconds' => $cap,
            'used_seconds' => $used,
            'remaining_seconds' => $cap - $used,
            'incident_elapsed_seconds' => $total,
            'incident_total_seconds' => $total,
            'incident_effective_seconds' => $effective,
            'incident_pause_seconds' => $pause,
            'pause_bank_seconds' => (int) $incident->clock_pause_seconds,
            'incident_net_seconds' => $effective,
            'business_window' => '08:00–16:00',
            'clock_paused' => $incident->clock_paused_at !== null,
            'clock_paused_at' => $incident->clock_paused_at?->toIso8601String(),
            'started_at' => $incident->started_at?->toIso8601String(),
            'recovered_at' => $incident->recovered_at?->toIso8601String(),
            'pauses' => $this->pausePayload($incident, $now),
        ];
    }

    public function startPause(Incident $incident): void
    {
        if ($incident->clock_paused_at !== null) {
            return;
        }
        $incident->clock_paused_at = now();
        $incident->save();
    }

    public function endPause(Incident $incident): void
    {
        if ($incident->clock_paused_at === null) {
            return;
        }
        $started = $incident->clock_paused_at instanceof CarbonInterface
            ? $incident->clock_paused_at
            : Carbon::parse($incident->clock_paused_at);
        $ended = now();
        $extra = max(0, $ended->getTimestamp() - $started->getTimestamp());
        $pauses = is_array($incident->clock_pauses) ? $incident->clock_pauses : [];
        $pauses[] = [
            'started_at' => $started->toIso8601String(),
            'ended_at' => $ended->toIso8601String(),
        ];
        $incident->clock_pauses = $pauses;
        $incident->clock_pause_seconds = (int) $incident->clock_pause_seconds + $extra;
        $incident->clock_paused_at = null;
        $incident->save();
    }

    /** Horas de 08:00 a 16:00, menos la parada de reloj que cae en ese horario. */
    public function effectiveSeconds(Incident $incident, ?CarbonInterface $now = null): int
    {
        if ($incident->started_at === null) {
            return 0;
        }
        $now ??= OperationalTime::now();
        $end = $incident->recovered_at ?? $now;
        $business = $this->businessSeconds($incident->started_at, $end);
        $paused = 0;
        foreach ($this->pauseIntervals($incident, $now) as [$from, $to]) {
            $paused += $this->businessSeconds($from, $to);
        }
        if ($paused === 0 && $this->pauseIntervals($incident, $now) === []) {
            $paused = min($business, $this->pauseSeconds($incident, $now));
        }

        return max(0, $business - $paused);
    }

    public function netSeconds(Incident $incident, ?CarbonInterface $now = null): int
    {
        return $this->effectiveSeconds($incident, $now);
    }

    public function businessSeconds(CarbonInterface $start, CarbonInterface $end): int
    {
        $tz = OperationalTime::tz();
        $from = Carbon::instance($start)->timezone($tz);
        $to = Carbon::instance($end)->timezone($tz);
        if ($to->lessThanOrEqualTo($from)) {
            return 0;
        }

        $seconds = 0;
        $day = $from->copy()->startOfDay();
        $lastDay = $to->copy()->startOfDay();
        while ($day->lessThanOrEqualTo($lastDay)) {
            $open = $day->copy()->setTime(self::BUSINESS_START_HOUR, 0, 0);
            $close = $day->copy()->setTime(self::BUSINESS_END_HOUR, 0, 0);
            $segStart = $from->greaterThan($open) ? $from : $open;
            $segEnd = $to->lessThan($close) ? $to : $close;
            if ($segEnd->greaterThan($segStart)) {
                $seconds += $segEnd->getTimestamp() - $segStart->getTimestamp();
            }
            $day->addDay();
        }

        return $seconds;
    }

    public function pauseSeconds(Incident $incident, ?CarbonInterface $now = null): int
    {
        $pause = (int) $incident->clock_pause_seconds;
        if ($incident->clock_paused_at !== null) {
            $now ??= OperationalTime::now();
            $started = $incident->clock_paused_at instanceof CarbonInterface
                ? $incident->clock_paused_at
                : Carbon::parse($incident->clock_paused_at);
            $pause += max(0, $now->getTimestamp() - $started->getTimestamp());
        }

        return $pause;
    }

    public function elapsedSeconds(Incident $incident, ?CarbonInterface $now = null): int
    {
        if ($incident->started_at === null) {
            return 0;
        }
        $now ??= OperationalTime::now();
        $end = $incident->recovered_at ?? $now;

        return max(0, $end->getTimestamp() - $incident->started_at->getTimestamp());
    }

    /**
     * Ámbito del colegio: primero `ambito` (IMPLEMENTACION), luego clasificacion legacy.
     *
     * @return array{zone: string, label: string, cap_seconds: int}
     */
    public function zoneForSchool(?School $school): array
    {
        return $this->zoneForClassification($school?->ambito ?: $school?->clasificacion);
    }

    /**
     * @return array{zone: string, label: string, cap_seconds: int}
     */
    public function zoneForClassification(?string $clasificacion): array
    {
        $value = mb_strtoupper(trim((string) $clasificacion));
        if ($value !== '' && str_contains($value, 'RURAL')) {
            return [
                'zone' => 'RURAL',
                'label' => 'Rural · 36 h al mes',
                'cap_seconds' => self::RURAL_SECONDS,
            ];
        }
        if ($value !== '' && str_contains($value, 'URBAN')) {
            return [
                'zone' => 'URBANA',
                'label' => 'Urbano · 6 h al mes',
                'cap_seconds' => self::URBAN_SECONDS,
            ];
        }

        return [
            'zone' => 'SIN_ZONA',
            'label' => 'Sin ámbito URBANA/RURAL · se toma rural, 36 h al mes',
            'cap_seconds' => self::RURAL_SECONDS,
        ];
    }

    private function monthUsageSeconds(int $schoolId, int $currentId, int $currentNet, bool $currentApplies): int
    {
        // Cupo mensual = suma de horas efectivas recortadas al mes (no el neto total de la caída).
        unset($currentId, $currentNet, $currentApplies);

        return (int) ($this->monthlyBreakdown($schoolId, OperationalTime::now()->format('Y-m'))['used_seconds'] ?? 0);
    }

    /**
     * Desglose SLA del colegio en un mes (YYYY-MM).
     * Solo caídas con razón MINEDU. Horas = 08:00–16:00 menos parada, recortadas al mes.
     *
     * @return array{
     *   month: string,
     *   from: string,
     *   to: string,
     *   zone: string,
     *   zone_label: string,
     *   cap_seconds: int,
     *   used_seconds: int,
     *   remaining_seconds: int,
     *   exceeded: bool,
     *   business_window: string,
     *   incidents: list<array<string, mixed>>
     * }
     */
    public function monthlyBreakdown(int $schoolId, string $yearMonth): array
    {
        if (! preg_match('/^\d{4}-\d{2}$/', $yearMonth)) {
            $yearMonth = OperationalTime::now()->format('Y-m');
        }

        $school = School::query()->find($schoolId);
        $zone = $this->zoneForSchool($school);
        $cap = (int) $zone['cap_seconds'];

        $from = OperationalTime::dayStart($yearMonth.'-01');
        $lastDay = Carbon::parse($yearMonth.'-01', OperationalTime::tz())->endOfMonth()->toDateString();
        $to = OperationalTime::dayEnd($lastDay);
        $now = OperationalTime::now();

        $incidents = Incident::query()
            ->with(['serviceTicket:id,incident_id,ticket_code,status'])
            ->where('school_id', $schoolId)
            ->whereNotNull('minedu_reason')
            ->where('minedu_reason', '!=', '')
            ->whereNotNull('started_at')
            ->where('started_at', '<=', $to)
            ->where(function ($q) use ($from) {
                $q->whereNull('recovered_at')->orWhere('recovered_at', '>=', $from);
            })
            ->orderBy('started_at')
            ->orderBy('id')
            ->get();

        $rows = [];
        $used = 0;
        foreach ($incidents as $incident) {
            $slaSeconds = $this->effectiveSecondsInWindow($incident, $from, $to, $now);
            $used += $slaSeconds;
            $reason = $incident->minedu_reason instanceof MineduReason
                ? $incident->minedu_reason->value
                : (string) ($incident->minedu_reason ?? '');

            $rows[] = [
                'incident_id' => $incident->id,
                'ticket' => $incident->serviceTicket?->ticket_code,
                'started_at' => $incident->started_at?->toIso8601String(),
                'recovered_at' => $incident->recovered_at?->toIso8601String(),
                'minedu_reason' => $reason !== '' ? $reason : null,
                'sla_seconds' => $slaSeconds,
                'sla_label' => $this->secondsLabel($slaSeconds),
                'total_seconds' => $this->elapsedSeconds($incident, $now),
                'active' => $incident->recovered_at === null,
            ];
        }

        $remaining = $cap - $used;

        return [
            'month' => $yearMonth,
            'from' => $from->copy()->timezone(OperationalTime::tz())->toDateString(),
            'to' => $to->copy()->timezone(OperationalTime::tz())->toDateString(),
            'zone' => $zone['zone'],
            'zone_label' => $zone['label'],
            'cap_seconds' => $cap,
            'used_seconds' => $used,
            'remaining_seconds' => $remaining,
            'exceeded' => $used > $cap,
            'business_window' => '08:00–16:00',
            'incidents' => $rows,
        ];
    }

    /**
     * Horas efectivas de la incidencia recortadas a una ventana (mes).
     */
    public function effectiveSecondsInWindow(
        Incident $incident,
        CarbonInterface $windowStart,
        CarbonInterface $windowEnd,
        ?CarbonInterface $now = null,
    ): int {
        if ($incident->started_at === null) {
            return 0;
        }
        $now ??= OperationalTime::now();
        $start = $incident->started_at->greaterThan($windowStart) ? $incident->started_at : $windowStart;
        $rawEnd = $incident->recovered_at ?? $now;
        $end = $rawEnd->lessThan($windowEnd) ? $rawEnd : $windowEnd;
        if ($end->lessThanOrEqualTo($start)) {
            return 0;
        }

        $business = $this->businessSeconds($start, $end);
        $paused = 0;
        foreach ($this->pauseIntervals($incident, $now) as [$from, $to]) {
            $pStart = $from->greaterThan($start) ? $from : $start;
            $pEnd = $to->lessThan($end) ? $to : $end;
            if ($pEnd->greaterThan($pStart)) {
                $paused += $this->businessSeconds($pStart, $pEnd);
            }
        }

        return max(0, $business - $paused);
    }

    private function secondsLabel(int $seconds): string
    {
        $seconds = max(0, $seconds);
        $h = intdiv($seconds, 3600);
        $m = intdiv($seconds % 3600, 60);

        return sprintf('%d h %02d min', $h, $m);
    }

    /**
     * @return list<array{0: CarbonInterface, 1: CarbonInterface}>
     */
    private function pauseIntervals(Incident $incident, CarbonInterface $now): array
    {
        $out = [];
        $stored = is_array($incident->clock_pauses) ? $incident->clock_pauses : [];
        foreach ($stored as $row) {
            if (! is_array($row) || empty($row['started_at'])) {
                continue;
            }
            $start = Carbon::parse((string) $row['started_at']);
            $end = ! empty($row['ended_at']) ? Carbon::parse((string) $row['ended_at']) : $now;
            $out[] = [$start, $end];
        }
        if ($incident->clock_paused_at !== null) {
            $started = $incident->clock_paused_at instanceof CarbonInterface
                ? $incident->clock_paused_at
                : Carbon::parse($incident->clock_paused_at);
            $out[] = [$started, $now];
        }

        return $out;
    }

    /**
     * @return list<array{started_at: string, ended_at: ?string}>
     */
    private function pausePayload(Incident $incident, CarbonInterface $now): array
    {
        $rows = [];
        foreach ($this->pauseIntervals($incident, $now) as [$start, $end]) {
            $open = $incident->clock_paused_at !== null
                && $start->equalTo($incident->clock_paused_at)
                && $end->equalTo($now);
            $rows[] = [
                'started_at' => $start->toIso8601String(),
                'ended_at' => $open ? null : $end->toIso8601String(),
            ];
        }

        return $rows;
    }
}
