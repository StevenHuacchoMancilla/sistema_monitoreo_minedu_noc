<?php

namespace Tests\Feature\Incidents;

use App\Domain\Incidents\Services\IncidentFlapCoalesceService;
use App\Enums\CidStatus;
use App\Enums\FollowupStatus;
use App\Enums\ManagementClassification;
use App\Enums\MonitoringStatus;
use App\Models\Incident;
use App\Models\IncidentManagement;
use App\Models\NetworkAssignment;
use App\Models\PrtgSensor;
use App\Models\School;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class IncidentFlapCoalesceTest extends TestCase
{
    use RefreshDatabase;

    /**
     * @return array{0: NetworkAssignment, 1: PrtgSensor, 2: School}
     */
    private function seedFixture(): array
    {
        $school = School::query()->create([
            'codigo_local' => '393757',
            'local_educativo' => 'TEST COALESCE',
            'current_sequence' => 1,
            'active' => true,
        ]);
        $assignment = NetworkAssignment::query()->create([
            'school_id' => $school->id,
            'cid' => '258999',
            'cid_status' => CidStatus::Valid,
            'monitoring_eligible' => true,
            'is_active' => true,
        ]);
        $sensor = PrtgSensor::query()->create([
            'network_assignment_id' => $assignment->id,
            'prtg_sensor_id' => '99901',
            'name' => 'Ping',
            'normalized_status' => MonitoringStatus::Operativo,
            'status_raw' => 3,
            'last_synced_at' => now(),
        ]);

        return [$assignment, $sensor, $school];
    }

    private function makeIncident(
        NetworkAssignment $assignment,
        PrtgSensor $sensor,
        string $startUtc,
        ?string $endUtc,
    ): Incident {
        return Incident::query()->create([
            'school_id' => $assignment->school_id,
            'network_assignment_id' => $assignment->id,
            'prtg_sensor_id' => $sensor->id,
            'started_at' => CarbonImmutable::parse($startUtc, 'UTC'),
            'recovered_at' => $endUtc ? CarbonImmutable::parse($endUtc, 'UTC') : null,
            'current_status' => $endUtc ? MonitoringStatus::Operativo->value : MonitoringStatus::Caido->value,
            'followup_status' => $endUtc ? FollowupStatus::Recuperado : FollowupStatus::PendienteContacto,
            'management_classification' => ManagementClassification::NewOutage,
        ]);
    }

    public function test_merges_flaps_within_window(): void
    {
        [$assignment, $sensor, $school] = $this->seedFixture();
        $a = $this->makeIncident($assignment, $sensor, '2026-09-23 20:34:00', '2026-09-23 20:38:00');
        $b = $this->makeIncident($assignment, $sensor, '2026-09-23 20:40:00', '2026-09-23 20:44:00');
        $c = $this->makeIncident($assignment, $sensor, '2026-09-23 20:46:00', '2026-09-23 20:58:00');
        // Lejos (>30 min)
        $d = $this->makeIncident($assignment, $sensor, '2026-09-23 22:00:00', '2026-09-23 22:05:00');

        $dry = app(IncidentFlapCoalesceService::class)->coalesce($school->id, null, 1800, true);
        $this->assertSame(1, $dry['summary']['chains']);
        $this->assertSame(2, $dry['summary']['absorbed']);

        $apply = app(IncidentFlapCoalesceService::class)->coalesce($school->id, null, 1800, false);
        $this->assertSame(1, $apply['summary']['chains']);
        $this->assertDatabaseCount('incidents', 2);
        $a->refresh();
        $this->assertSame('15:58:00', $a->recovered_at->timezone('America/Lima')->format('H:i:s'));
        $this->assertSame('20:58:00', $a->recovered_at->timezone('UTC')->format('H:i:s'));
        $this->assertNull(Incident::query()->find($b->id));
        $this->assertNull(Incident::query()->find($c->id));
        $this->assertNotNull(Incident::query()->find($d->id));
    }

    public function test_skips_chain_with_management(): void
    {
        [$assignment, $sensor, $school] = $this->seedFixture();
        $a = $this->makeIncident($assignment, $sensor, '2026-09-23 20:34:00', '2026-09-23 20:38:00');
        $b = $this->makeIncident($assignment, $sensor, '2026-09-23 20:40:00', '2026-09-23 20:44:00');

        IncidentManagement::query()->create([
            'incident_id' => $b->id,
            'classification' => ManagementClassification::ContactConfirmed->value,
            'detail' => 'contacto',
        ]);

        $result = app(IncidentFlapCoalesceService::class)->coalesce($school->id, null, 1800, false);
        $this->assertSame(0, $result['summary']['chains']);
        $this->assertSame(1, $result['summary']['skipped_protected']);
        $this->assertDatabaseCount('incidents', 2);
        $this->assertNotNull(Incident::query()->find($a->id));
        $this->assertNotNull(Incident::query()->find($b->id));
    }
}
