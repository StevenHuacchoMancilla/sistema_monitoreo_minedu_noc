<?php

namespace Tests\Feature\Prtg;

use App\Domain\Monitoring\PRTG\Services\PrtgHistoricOutageReader;
use App\Domain\Monitoring\PRTG\Services\PrtgIncidentReconciliationService;
use App\Enums\CidStatus;
use App\Enums\FollowupStatus;
use App\Enums\ManagementClassification;
use App\Enums\MonitoringStatus;
use App\Models\Incident;
use App\Models\NetworkAssignment;
use App\Models\PrtgSensor;
use App\Models\School;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PrtgIncidentReconciliationTest extends TestCase
{
    use RefreshDatabase;

    /**
     * @return array{0: NetworkAssignment, 1: PrtgSensor}
     */
    private function seedSensor(): array
    {
        $school = School::query()->create([
            'codigo_local' => '393757',
            'local_educativo' => 'JESUS DE NAZARETH',
            'current_sequence' => 1,
            'active' => true,
        ]);
        $assignment = NetworkAssignment::query()->create([
            'school_id' => $school->id,
            'cid' => '258738',
            'cid_status' => CidStatus::Valid,
            'monitoring_eligible' => true,
            'is_active' => true,
        ]);
        $sensor = PrtgSensor::query()->create([
            'network_assignment_id' => $assignment->id,
            'prtg_sensor_id' => '9053',
            'name' => 'Ping',
            'normalized_status' => MonitoringStatus::Operativo,
            'status_raw' => 3,
            'last_synced_at' => now(),
        ]);

        return [$assignment, $sensor];
    }

    public function test_create_missing_short_outage_without_tracking(): void
    {
        config(['incidents.reconciliation_allow_creates' => true]);
        [$assignment, $sensor] = $this->seedSensor();
        $svc = app(PrtgIncidentReconciliationService::class);

        $outages = [[
            'started_at' => CarbonImmutable::parse('2026-09-22 19:42:50', 'UTC'),
            'recovered_at' => CarbonImmutable::parse('2026-09-22 19:46:25', 'UTC'),
        ]];

        $dry = $svc->reconcileSensor(
            $sensor,
            CarbonImmutable::parse('2026-09-22 05:00:00', 'UTC'),
            CarbonImmutable::parse('2026-09-23 05:00:00', 'UTC'),
            true,
            $outages,
        );
        $this->assertSame(1, $dry['summary']['create']);

        $apply = $svc->reconcileSensor(
            $sensor,
            CarbonImmutable::parse('2026-09-22 05:00:00', 'UTC'),
            CarbonImmutable::parse('2026-09-23 05:00:00', 'UTC'),
            false,
            $outages,
        );
        $this->assertSame(1, $apply['summary']['create']);
        $this->assertDatabaseCount('incidents', 1);
        $this->assertDatabaseCount('tracking_records', 0);

        $incident = Incident::query()->first();
        $this->assertSame(PrtgIncidentReconciliationService::SOURCE_RECONCILIATION, $incident->detection_source);
        $this->assertSame(FollowupStatus::Recuperado, $incident->followup_status);
        $this->assertNotNull($incident->prtg_down_fingerprint);

        // Idempotent
        $again = $svc->reconcileSensor(
            $sensor,
            CarbonImmutable::parse('2026-09-22 05:00:00', 'UTC'),
            CarbonImmutable::parse('2026-09-23 05:00:00', 'UTC'),
            false,
            $outages,
        );
        $this->assertSame(1, $again['summary']['unchanged']);
        $this->assertDatabaseCount('incidents', 1);
    }

    public function test_updates_late_started_at_when_recovery_matches(): void
    {
        [$assignment, $sensor] = $this->seedSensor();

        $incident = Incident::query()->create([
            'school_id' => $assignment->school_id,
            'network_assignment_id' => $assignment->id,
            'prtg_sensor_id' => $sensor->id,
            'started_at' => CarbonImmutable::parse('2026-09-22 13:49:54', 'UTC'), // 08:49 Lima
            'recovered_at' => CarbonImmutable::parse('2026-09-22 16:41:41', 'UTC'), // 11:41 Lima
            'current_status' => MonitoringStatus::Operativo->value,
            'followup_status' => FollowupStatus::Recuperado,
            'management_classification' => ManagementClassification::NewOutage,
        ]);

        $outages = [[
            'started_at' => CarbonImmutable::parse('2026-09-22 10:57:50', 'UTC'), // 05:57 Lima
            'recovered_at' => CarbonImmutable::parse('2026-09-22 16:40:25', 'UTC'), // 11:40 Lima
        ]];

        $result = app(PrtgIncidentReconciliationService::class)->reconcileSensor(
            $sensor,
            CarbonImmutable::parse('2026-09-22 05:00:00', 'UTC'),
            CarbonImmutable::parse('2026-09-23 05:00:00', 'UTC'),
            false,
            $outages,
        );

        $this->assertSame(1, $result['summary']['update']);
        $incident->refresh();
        $this->assertSame('05:57:50', $incident->started_at->timezone('America/Lima')->format('H:i:s'));
        $this->assertDatabaseCount('tracking_records', 0);
    }

    public function test_idempotent_ten_runs(): void
    {
        config(['incidents.reconciliation_allow_creates' => true]);
        [$assignment, $sensor] = $this->seedSensor();
        $svc = app(PrtgIncidentReconciliationService::class);
        $outages = [
            [
                'started_at' => CarbonImmutable::parse('2026-09-23 14:10:12', 'UTC'),
                'recovered_at' => CarbonImmutable::parse('2026-09-23 14:11:57', 'UTC'),
            ],
            [
                'started_at' => CarbonImmutable::parse('2026-09-23 14:14:11', 'UTC'),
                'recovered_at' => CarbonImmutable::parse('2026-09-23 14:15:47', 'UTC'),
            ],
        ];

        for ($i = 0; $i < 10; $i++) {
            $svc->reconcileSensor(
                $sensor,
                CarbonImmutable::parse('2026-09-23 05:00:00', 'UTC'),
                CarbonImmutable::parse('2026-09-24 05:00:00', 'UTC'),
                false,
                $outages,
            );
        }

        $this->assertDatabaseCount('incidents', 2);
        $this->assertDatabaseCount('tracking_records', 0);
    }

    public function test_case_9053_day22_fixture(): void
    {
        config(['incidents.reconciliation_allow_creates' => true]);
        [$assignment, $sensor] = $this->seedSensor();

        // Existing DB state: only morning with late start
        Incident::query()->create([
            'school_id' => $assignment->school_id,
            'network_assignment_id' => $assignment->id,
            'prtg_sensor_id' => $sensor->id,
            'started_at' => CarbonImmutable::parse('2026-09-22 13:49:54', 'UTC'),
            'recovered_at' => CarbonImmutable::parse('2026-09-22 16:41:41', 'UTC'),
            'current_status' => MonitoringStatus::Operativo->value,
            'followup_status' => FollowupStatus::Recuperado,
            'management_classification' => ManagementClassification::NewOutage,
        ]);

        $outages = [
            [
                'started_at' => CarbonImmutable::parse('2026-09-22 10:57:50', 'UTC'),
                'recovered_at' => CarbonImmutable::parse('2026-09-22 16:40:25', 'UTC'),
            ],
            [
                'started_at' => CarbonImmutable::parse('2026-09-22 19:42:50', 'UTC'),
                'recovered_at' => CarbonImmutable::parse('2026-09-22 19:46:25', 'UTC'),
            ],
        ];

        $dry = app(PrtgIncidentReconciliationService::class)->reconcileSensor(
            $sensor,
            CarbonImmutable::parse('2026-09-22 05:00:00', 'UTC'),
            CarbonImmutable::parse('2026-09-23 05:00:00', 'UTC'),
            true,
            $outages,
        );

        $this->assertSame(1, $dry['summary']['update']);
        $this->assertSame(1, $dry['summary']['create']);
        $this->assertSame(0, $dry['summary']['conflict']);
    }

    public function test_updates_wrong_recovered_at_to_prtg_ok(): void
    {
        [$assignment, $sensor] = $this->seedSensor();

        $incident = Incident::query()->create([
            'school_id' => $assignment->school_id,
            'network_assignment_id' => $assignment->id,
            'prtg_sensor_id' => $sensor->id,
            'started_at' => CarbonImmutable::parse('2026-09-22 23:32:51', 'UTC'), // 18:32 Lima
            'recovered_at' => CarbonImmutable::parse('2026-09-23 14:09:46', 'UTC'), // wrong late recovery
            'current_status' => MonitoringStatus::Operativo->value,
            'followup_status' => FollowupStatus::Recuperado,
            'management_classification' => ManagementClassification::NewOutage,
        ]);

        $outages = [[
            'started_at' => CarbonImmutable::parse('2026-09-22 23:32:19', 'UTC'),
            'recovered_at' => CarbonImmutable::parse('2026-09-23 00:19:59', 'UTC'), // 19:19 Lima
        ]];

        $dry = app(PrtgIncidentReconciliationService::class)->reconcileSensor(
            $sensor,
            CarbonImmutable::parse('2026-09-22 05:00:00', 'UTC'),
            CarbonImmutable::parse('2026-09-24 05:00:00', 'UTC'),
            true,
            $outages,
        );

        $update = collect($dry['actions'])->firstWhere('action', 'UPDATE');
        $this->assertNotNull($update);
        $this->assertSame('high', $update['confidence']);
        $this->assertArrayHasKey('recovered_at', $update['fields']);

        $apply = app(PrtgIncidentReconciliationService::class)->reconcileSensor(
            $sensor,
            CarbonImmutable::parse('2026-09-22 05:00:00', 'UTC'),
            CarbonImmutable::parse('2026-09-24 05:00:00', 'UTC'),
            false,
            $outages,
            'high-recovery',
        );

        $this->assertSame(1, $apply['summary']['update']);
        $incident->refresh();
        $this->assertSame('19:19:59', $incident->recovered_at->timezone('America/Lima')->format('H:i:s'));
        $this->assertDatabaseCount('tracking_records', 0);
    }

    public function test_historical_creates_skipped_when_disabled(): void
    {
        config(['incidents.reconciliation_allow_creates' => false]);
        [$assignment, $sensor] = $this->seedSensor();
        $svc = app(PrtgIncidentReconciliationService::class);

        $outages = [[
            'started_at' => CarbonImmutable::parse('2026-09-22 19:42:50', 'UTC'),
            'recovered_at' => CarbonImmutable::parse('2026-09-22 19:46:25', 'UTC'),
        ]];

        $dry = $svc->reconcileSensor(
            $sensor,
            CarbonImmutable::parse('2026-09-22 05:00:00', 'UTC'),
            CarbonImmutable::parse('2026-09-23 05:00:00', 'UTC'),
            true,
            $outages,
        );

        $this->assertSame(0, $dry['summary']['create']);
        $this->assertSame(1, $dry['summary']['skipped']);
        $this->assertDatabaseCount('incidents', 0);
    }

    public function test_fingerprint_helper_is_stable(): void
    {
        $a = PrtgHistoricOutageReader::fingerprint('9053', CarbonImmutable::parse('2026-09-22 10:57:50', 'UTC'));
        $b = PrtgHistoricOutageReader::fingerprint('9053', CarbonImmutable::parse('2026-09-22 10:57:50', 'UTC'));
        $c = PrtgHistoricOutageReader::fingerprint('9053', CarbonImmutable::parse('2026-09-22 10:57:51', 'UTC'));
        $this->assertSame($a, $b);
        $this->assertNotSame($a, $c);
    }
}
