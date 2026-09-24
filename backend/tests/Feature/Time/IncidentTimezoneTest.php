<?php

namespace Tests\Feature\Time;

use App\Domain\Incidents\Services\IncidentService;
use App\Domain\Monitoring\PRTG\Support\PrtgTimestamps;
use App\Enums\CidStatus;
use App\Enums\DatePrecision;
use App\Enums\FollowupStatus;
use App\Enums\MonitoringStatus;
use App\Enums\TrackingStatus;
use App\Enums\TrackingTechnicalStatus;
use App\Models\Incident;
use App\Models\NetworkAssignment;
use App\Models\PrtgSensor;
use App\Models\School;
use App\Models\TrackingRecord;
use App\Support\OperationalTime;
use Carbon\Carbon;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class IncidentTimezoneTest extends TestCase
{
    use RefreshDatabase;

    private int $n = 0;

    protected function setUp(): void
    {
        parent::setUp();
        $this->actingAsUser();
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        CarbonImmutable::setTestNow();
        parent::tearDown();
    }

    private function lima(string $wallClock): Carbon
    {
        return Carbon::parse($wallClock, 'America/Lima');
    }

    private function freezeLima(string $wallClock): void
    {
        $now = $this->lima($wallClock)->utc();
        Carbon::setTestNow($now);
        CarbonImmutable::setTestNow($now);
    }

    /**
     * @return array{0: NetworkAssignment, 1: PrtgSensor}
     */
    private function seedAssignment(MonitoringStatus $status = MonitoringStatus::Caido): array
    {
        $this->n++;
        $school = School::query()->create([
            'codigo_local' => (string) (480000 + $this->n),
            'local_educativo' => "COLEGIO TZ {$this->n}",
            'current_sequence' => 700 + $this->n,
            'active' => true,
        ]);
        $assignment = NetworkAssignment::query()->create([
            'school_id' => $school->id,
            'cid' => (string) (258000 + $this->n),
            'cid_status' => CidStatus::Valid,
            'monitoring_eligible' => true,
            'is_active' => true,
        ]);
        $sensor = PrtgSensor::query()->create([
            'network_assignment_id' => $assignment->id,
            'prtg_sensor_id' => (string) (8800 + $this->n),
            'name' => 'Ping',
            'normalized_status' => $status,
            'status_raw' => $status === MonitoringStatus::Caido ? 5 : 3,
            'last_synced_at' => now(),
        ]);

        return [$assignment, $sensor];
    }

    private function seedIncident(Carbon $startedLima, ?Carbon $recoveredLima = null): Incident
    {
        [$assignment, $sensor] = $this->seedAssignment(
            $recoveredLima ? MonitoringStatus::Operativo : MonitoringStatus::Caido
        );

        return Incident::query()->create([
            'school_id' => $assignment->school_id,
            'network_assignment_id' => $assignment->id,
            'prtg_sensor_id' => $sensor->id,
            'started_at' => $startedLima->copy()->utc(),
            'recovered_at' => $recoveredLima?->copy()->utc(),
            'current_status' => $recoveredLima ? MonitoringStatus::Operativo->value : MonitoringStatus::Caido->value,
            'followup_status' => $recoveredLima ? FollowupStatus::Recuperado : FollowupStatus::PendienteContacto,
        ]);
    }

    private static function oleFor(Carbon $instant): float
    {
        return $instant->getTimestamp() / 86400 + 25569;
    }

    public function test_prtg_ole_raw_converts_once_to_utc(): void
    {
        $lima1120 = $this->lima('2026-09-23 11:20:00');

        $parsed = PrtgTimestamps::fromOle(self::oleFor($lima1120));

        $this->assertSame('2026-09-23T16:20:00+00:00', $parsed?->toIso8601String());
        $this->assertSame('11:20', OperationalTime::format($parsed, 'H:i'));
    }

    public function test_down_since_derived_from_prtg_is_stored_utc_and_displays_lima(): void
    {
        config(['incidents.use_system_clock' => false]);
        $this->freezeLima('2026-09-23 11:30:00');
        [$assignment, $sensor] = $this->seedAssignment();

        // check 11:30 Lima, caído hace 600 s → 11:20 Lima = 16:20Z.
        $row = ['lastcheck_raw' => self::oleFor(now()), 'downtimesince_raw' => 600];
        $since = PrtgTimestamps::stateSince($row, 'downtimesince', now());
        $incident = app(IncidentService::class)->ensureOpen($assignment, $sensor, $since['at']);

        $raw = DB::table('incidents')->where('id', $incident->id)->value('started_at');
        $this->assertSame('2026-09-23 16:20:00', substr((string) $raw, 0, 19));
        $this->assertSame('2026-09-23T16:20:00+00:00', $incident->fresh()->started_at->toIso8601String());
        $this->assertSame('11:20', OperationalTime::format($incident->fresh()->started_at, 'H:i'));
    }

    public function test_system_clock_uses_detection_time_and_keeps_prtg_evidence(): void
    {
        config(['incidents.use_system_clock' => true, 'incidents.flap_reopen_seconds' => 0]);
        $this->freezeLima('2026-09-23 11:30:00');
        [$assignment, $sensor] = $this->seedAssignment();

        $prtgDown = $this->lima('2026-09-23 11:20:00');
        $incident = app(IncidentService::class)->ensureOpen($assignment, $sensor, $prtgDown);

        $this->assertSame('11:30', OperationalTime::format($incident->fresh()->started_at, 'H:i'));
        $this->assertSame('11:20', OperationalTime::format($incident->fresh()->prtg_down_started_at, 'H:i'));
        $this->assertSame('REALTIME_SYNC', $incident->fresh()->detection_source);
    }

    public function test_prtg_clock_aligns_late_detection_to_downtimesince(): void
    {
        config(['incidents.use_system_clock' => false, 'incidents.flap_reopen_seconds' => 0]);
        $this->freezeLima('2026-09-23 09:09:00');
        [$assignment, $sensor] = $this->seedAssignment();
        $svc = app(IncidentService::class);

        // Primera detección con reloj de sistema equivocado (simula bug previo).
        config(['incidents.use_system_clock' => true]);
        $incident = $svc->ensureOpen($assignment, $sensor, $this->lima('2026-09-22 22:43:00'));
        $this->assertSame('09:09', OperationalTime::format($incident->fresh()->started_at, 'H:i'));

        // Sync posterior con modo PRTG: adelanta started_at a downtimesince.
        config(['incidents.use_system_clock' => false]);
        $again = $svc->ensureOpen($assignment, $sensor, $this->lima('2026-09-22 22:43:00'));
        $this->assertSame($incident->id, $again->id);
        $this->assertSame('22:43', OperationalTime::format($again->fresh()->started_at, 'H:i'));
    }

    public function test_flap_reopens_same_incident_within_window(): void
    {
        config(['incidents.use_system_clock' => true, 'incidents.flap_reopen_seconds' => 900]);
        $this->freezeLima('2026-09-23 11:00:00');
        [$assignment, $sensor] = $this->seedAssignment();
        $svc = app(IncidentService::class);

        $first = $svc->ensureOpen($assignment, $sensor);
        $this->freezeLima('2026-09-23 11:05:00');
        $svc->recover($assignment, $sensor);
        $this->assertNotNull($first->fresh()->recovered_at);

        $this->freezeLima('2026-09-23 11:08:00');
        $again = $svc->ensureOpen($assignment, $sensor);

        $this->assertSame($first->id, $again->id);
        $this->assertNull($again->fresh()->recovered_at);
        $this->assertSame('11:00', OperationalTime::format($again->fresh()->started_at, 'H:i'));
        $this->assertSame(1, Incident::query()->count());
    }

    public function test_future_prtg_timestamp_is_flagged_and_not_persisted(): void
    {
        config(['incidents.use_system_clock' => false]);
        $this->freezeLima('2026-09-23 11:30:00');
        [$assignment, $sensor] = $this->seedAssignment();

        $row = ['lastcheck_raw' => self::oleFor(now()->addHours(5)), 'downtimesince_raw' => 60];
        $since = PrtgTimestamps::stateSince($row, 'downtimesince', now());
        $this->assertTrue($since['future']);
        $this->assertNull($since['at']);

        $codes = [];
        $incident = app(IncidentService::class)->ensureOpen(
            $assignment,
            $sensor,
            now()->addHours(5),
            function (string $code) use (&$codes): void {
                $codes[] = $code;
            },
        );

        $this->assertContains('PRTG_FUTURE_TIMESTAMP', $codes);
        $this->assertFalse($incident->fresh()->started_at->isFuture());
    }

    public function test_invalid_recovery_before_start_is_flagged(): void
    {
        config(['incidents.use_system_clock' => false]);
        $this->freezeLima('2026-09-23 11:30:00');
        $incident = $this->seedIncident($this->lima('2026-09-23 11:00:00'));

        $codes = [];
        $fresh = app(IncidentService::class)->applyTechnicalRecovery(
            $incident,
            'test',
            $this->lima('2026-09-23 10:00:00'),
            function (string $code) use (&$codes): void {
                $codes[] = $code;
            },
        );

        $this->assertContains('INVALID_RECOVERY_TIMESTAMP', $codes);
        $this->assertTrue($fresh->recovered_at->greaterThanOrEqualTo($fresh->started_at));
    }

    public function test_started_at_is_immutable_while_active(): void
    {
        config(['incidents.use_system_clock' => true, 'incidents.flap_reopen_seconds' => 0]);
        $this->freezeLima('2026-09-23 11:30:00');
        [$assignment, $sensor] = $this->seedAssignment();
        $service = app(IncidentService::class);

        $first = $service->ensureOpen($assignment, $sensor, $this->lima('2026-09-23 11:20:00'));
        $again = $service->ensureOpen($assignment, $sensor, $this->lima('2026-09-23 09:00:00'));

        $this->assertSame($first->id, $again->id);
        // Reloj de sistema: apertura = detección 11:30; PRTG evidence no mueve started_at.
        $this->assertSame('11:30', OperationalTime::format($again->fresh()->started_at, 'H:i'));
    }

    public function test_active_outages_sorted_started_at_desc_then_id_desc(): void
    {
        $this->freezeLima('2026-09-23 12:00:00');
        $old = $this->seedIncident($this->lima('2026-09-23 08:00:00'));
        $newest = $this->seedIncident($this->lima('2026-09-23 11:50:00'));
        $tieA = $this->seedIncident($this->lima('2026-09-23 10:00:00'));
        $tieB = $this->seedIncident($this->lima('2026-09-23 10:00:00'));

        $ids = collect($this->getJson('/api/dashboard/outages')->assertOk()->json('data'))
            ->pluck('incident_id')
            ->all();

        $this->assertSame([$newest->id, $tieB->id, $tieA->id, $old->id], $ids);
    }

    public function test_recoveries_sorted_recovered_at_desc_then_id_desc(): void
    {
        $this->freezeLima('2026-09-23 12:00:00');
        $a = $this->seedIncident($this->lima('2026-09-23 06:00:00'), $this->lima('2026-09-23 07:00:00'));
        $b = $this->seedIncident($this->lima('2026-09-23 06:00:00'), $this->lima('2026-09-23 11:00:00'));
        $c = $this->seedIncident($this->lima('2026-09-23 08:00:00'), $this->lima('2026-09-23 09:00:00'));

        $ids = collect($this->getJson('/api/incidents/recovered?preset=today')->assertOk()->json('data'))
            ->pluck('id')
            ->all();

        $this->assertSame([$b->id, $c->id, $a->id], $ids);
    }

    public function test_same_day_uses_lima_calendar(): void
    {
        $this->freezeLima('2026-09-24 12:00:00');
        // 18:00 → 20:00 Lima del 23: en UTC cruza al 24, pero es el mismo día local.
        $sameLima = $this->seedIncident($this->lima('2026-09-23 18:00:00'), $this->lima('2026-09-23 20:00:00'));
        // 23:30 del 22 → 00:30 del 23 Lima: mismo día en UTC, distinto día local.
        $crossLima = $this->seedIncident($this->lima('2026-09-22 23:30:00'), $this->lima('2026-09-23 00:30:00'));

        $rows = collect($this->getJson('/api/incidents/recovered?date_from=2026-09-23&date_to=2026-09-23')
            ->assertOk()
            ->json('data'))->keyBy('id');

        $this->assertTrue($rows[$sameLima->id]['same_day']);
        $this->assertFalse($rows[$crossLima->id]['same_day']);

        $sameDayIds = collect($this->getJson('/api/incidents/recovered?date_from=2026-09-23&date_to=2026-09-23&same_day=1')
            ->assertOk()
            ->json('data'))->pluck('id')->all();
        $this->assertSame([$sameLima->id], $sameDayIds);
    }

    public function test_recovered_today_counters_agree_in_lima(): void
    {
        // 22:00 Lima = 03:00Z del día siguiente: "hoy" debe seguir siendo el 23 local.
        $this->freezeLima('2026-09-23 22:00:00');
        $today1 = $this->seedIncident($this->lima('2026-09-23 20:00:00'), $this->lima('2026-09-23 21:00:00'));
        $today2 = $this->seedIncident($this->lima('2026-09-23 00:10:00'), $this->lima('2026-09-23 00:20:00'));
        $this->seedIncident($this->lima('2026-09-22 22:00:00'), $this->lima('2026-09-22 23:50:00'));

        $list = $this->getJson('/api/incidents/recovered?preset=today')->assertOk();
        $summary = $this->getJson('/api/incidents/recovered/summary?preset=today')->assertOk();

        $this->assertEqualsCanonicalizing([$today1->id, $today2->id], collect($list->json('data'))->pluck('id')->all());
        $this->assertSame(2, $list->json('meta.total'));
        $this->assertSame(2, $summary->json('data.recovered_today'));
        $this->assertSame(2, $summary->json('data.recovered_in_period'));
        $this->assertSame('2026-09-23', $list->json('filters.date_from'));
    }

    public function test_outages_payload_includes_duration_and_tracking(): void
    {
        $this->freezeLima('2026-09-23 12:00:00');
        $incident = $this->seedIncident($this->lima('2026-09-23 11:00:00'));

        $tracking = TrackingRecord::query()->create([
            'incident_number' => 900 + $this->n,
            'incident_id' => $incident->id,
            'school_id' => $incident->school_id,
            'network_assignment_id' => $incident->network_assignment_id,
            'tss_snapshot' => '91',
            'cid_snapshot' => (string) (258000 + $this->n),
            'description' => 'LINK DOWN',
            'status' => TrackingStatus::InProgress,
            'technical_status' => TrackingTechnicalStatus::Down,
            'ticket' => 'LEGACY-TK',
            'report_ticket' => 'INC91_258001_A20260923110000_01_COPEN_120000',
            'opened_at' => now()->subHour(),
            'opened_at_precision' => DatePrecision::DateTime,
            'lock_version' => 1,
        ]);

        $row = collect($this->getJson('/api/dashboard/outages')->assertOk()->json('data'))
            ->firstWhere('incident_id', $incident->id);

        $this->assertNotNull($row);
        $this->assertSame(3600, $row['duration_seconds']);
        $this->assertGreaterThanOrEqual(0, $row['duration_seconds']);
        $this->assertSame([
            'id' => $tracking->id,
            'status' => TrackingStatus::InProgress->value,
            'status_label' => TrackingStatus::InProgress->label(),
            'ticket' => 'INC91_258001_A20260923110000_01_COPEN_120000',
        ], $row['tracking']);
    }

    public function test_reoutage_creates_new_incident_keeping_previous_started_at(): void
    {
        config(['incidents.use_system_clock' => true, 'incidents.flap_reopen_seconds' => 900]);
        $this->freezeLima('2026-09-23 10:00:00');
        [$assignment, $sensor] = $this->seedAssignment();
        $service = app(IncidentService::class);

        $first = $service->ensureOpen($assignment, $sensor);
        $this->freezeLima('2026-09-23 11:00:00');
        $service->applyTechnicalRecovery($first, 'PRTG OK');
        // Más allá de la ventana de flaps (15 min): nueva incidencia.
        $this->freezeLima('2026-09-23 11:30:00');
        $second = $service->ensureOpen($assignment, $sensor);

        $this->assertNotSame($first->id, $second->id);
        $this->assertSame('10:00', OperationalTime::format($first->fresh()->started_at, 'H:i'));
        $this->assertSame('11:30', OperationalTime::format($second->fresh()->started_at, 'H:i'));
        $this->assertNotNull($first->fresh()->recovered_at);
        $this->assertNull($second->fresh()->recovered_at);
    }
}
