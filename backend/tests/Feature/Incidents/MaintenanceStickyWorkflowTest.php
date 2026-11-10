<?php

namespace Tests\Feature\Incidents;

use App\Domain\Incidents\Services\IncidentService;
use App\Domain\Ticketera\Services\ServiceTicketService;
use App\Enums\CidStatus;
use App\Enums\FollowupStatus;
use App\Enums\MonitoringStatus;
use App\Models\Incident;
use App\Models\NetworkAssignment;
use App\Models\PrtgSensor;
use App\Models\School;
use App\Models\ServiceTicket;
use App\Support\OperationalTime;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

class MaintenanceStickyWorkflowTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->actingAsUser();
        $this->freezeLima('2026-11-09 10:00:00');
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function freezeLima(string $wallClock): void
    {
        $now = Carbon::parse($wallClock, OperationalTime::tz())->setTimezone(OperationalTime::storageTz());
        Carbon::setTestNow($now);
    }

    /**
     * @return array{0: NetworkAssignment, 1: PrtgSensor}
     */
    private function seedSchool(string $cid = '258910'): array
    {
        $school = School::query()->create([
            'codigo_local' => $cid,
            'local_educativo' => 'COLEGIO MANTENIMIENTO '.$cid,
            'provincia' => 'MAYNAS',
            'distrito' => 'IQUITOS',
            'current_sequence' => 910,
            'active' => true,
        ]);

        $assignment = NetworkAssignment::query()->create([
            'school_id' => $school->id,
            'cid' => $cid,
            'cid_status' => CidStatus::Valid,
            'monitoring_eligible' => true,
            'is_active' => true,
        ]);

        $sensor = PrtgSensor::query()->create([
            'network_assignment_id' => $assignment->id,
            'prtg_sensor_id' => '9910',
            'prtg_device_id' => '8910',
            'name' => 'Ping',
            'sensor_role' => 'PING',
            'device_name' => 'CID'.$cid.'_TEST',
            'normalized_status' => MonitoringStatus::Operativo,
            'status_raw' => '3',
            'last_synced_at' => now(),
        ]);

        return [$assignment, $sensor];
    }

    public function test_prtg_down_during_open_maintenance_reuses_case_without_new_fall(): void
    {
        [$assignment, $sensor] = $this->seedSchool();
        $user = $this->actingAsUser();

        $maint = app(ServiceTicketService::class)->openMaintenanceCorrective(
            $assignment,
            $user->id,
            now(),
            'Mantenimiento programado GS01'
        );

        $this->assertSame(Incident::DETECTION_MAINTENANCE, $maint->detection_source);
        $this->assertTrue($maint->isOpenMaintenance());
        $this->assertTrue($maint->isStickyOpen());
        $this->assertNull($maint->recovered_at);

        $sensor->update(['normalized_status' => MonitoringStatus::Caido]);
        $this->freezeLima('2026-11-09 11:30:00');

        $reopened = app(IncidentService::class)->ensureOpen($assignment, $sensor->fresh(), now());

        $this->assertSame($maint->id, $reopened->id);
        $this->assertNull($reopened->recovered_at);
        $this->assertSame(MonitoringStatus::Caido->value, $reopened->current_status);
        $this->assertSame(1, Incident::query()->count());
        $this->assertSame(
            0,
            Incident::query()->falls()->where('id', '!=', $maint->id)->count()
        );

        $ticket = ServiceTicket::query()->where('incident_id', $maint->id)->first();
        $this->assertNotNull($ticket);
        $this->assertTrue((bool) $ticket->is_maintenance);
        $this->assertSame(ServiceTicket::STATUS_OPEN, $ticket->status);
    }

    public function test_prtg_up_during_maintenance_does_not_close_or_go_to_pendiente_cierre(): void
    {
        [$assignment, $sensor] = $this->seedSchool('258911');
        $user = $this->actingAsUser();
        $svc = app(IncidentService::class);

        $maint = app(ServiceTicketService::class)->openMaintenanceCorrective(
            $assignment,
            $user->id,
            now(),
            'Correctivo en sitio'
        );

        $sensor->update(['normalized_status' => MonitoringStatus::Caido]);
        $svc->ensureOpen($assignment, $sensor->fresh(), now());

        $sensor->update(['normalized_status' => MonitoringStatus::Operativo]);
        $this->freezeLima('2026-11-09 12:00:00');
        $svc->applyTechnicalRecovery($maint->fresh(), 'PRTG UP durante mantenimiento', now());

        $maint->refresh();
        $this->assertNotNull($maint->recovered_at);
        $this->assertNotSame(FollowupStatus::PendienteCierre, $maint->followup_status);
        $this->assertNotSame(FollowupStatus::Cerrado, $maint->followup_status);
        $this->assertTrue($maint->isOpenMaintenance());
        $this->assertTrue($maint->isStickyOpen());

        $ticket = ServiceTicket::query()->where('incident_id', $maint->id)->first();
        $this->assertSame(ServiceTicket::STATUS_OPEN, $ticket?->status);

        // Segunda caída: sigue el mismo caso.
        $sensor->update(['normalized_status' => MonitoringStatus::Caido]);
        $this->freezeLima('2026-11-09 12:45:00');
        $again = $svc->ensureOpen($assignment, $sensor->fresh(), now());

        $this->assertSame($maint->id, $again->id);
        $this->assertSame(1, Incident::query()->count());
    }

    public function test_mark_maintenance_leaves_pendiente_cierre_like_incidencias(): void
    {
        [$assignment, $sensor] = $this->seedSchool('258815');
        $sensor->update(['normalized_status' => MonitoringStatus::Caido]);

        $incident = Incident::query()->create([
            'school_id' => $assignment->school_id,
            'network_assignment_id' => $assignment->id,
            'prtg_sensor_id' => $sensor->id,
            'started_at' => now()->subHour(),
            'prtg_down_started_at' => now()->subHour(),
            'current_status' => MonitoringStatus::Caido->value,
            'followup_status' => FollowupStatus::EnGestion,
            'management_classification' => \App\Enums\ManagementClassification::ContactConfirmed,
        ]);

        app(IncidentService::class)->applyTechnicalRecovery($incident->fresh(), 'PRTG UP', now());
        $incident->refresh();
        $this->assertSame(FollowupStatus::PendienteCierre, $incident->followup_status);

        app(ServiceTicketService::class)->markMaintenance($incident->fresh());
        $incident->refresh();

        $this->assertSame(FollowupStatus::EnGestion, $incident->followup_status);
        $this->assertTrue($incident->isOpenMaintenance());
        $this->assertTrue($incident->isStickyOpen());
        $this->assertSame(
            \App\Enums\RecoveryReviewStatus::ContinueMonitoring,
            $incident->recovery_review_status
        );

        $pendiente = $this->getJson('/api/incidents/queues/pendiente-cierre')->assertOk();
        $this->assertFalse(
            collect($pendiente->json('data'))->pluck('incident_id')->contains($incident->id)
        );

        // Tampoco debe quedar en En gestión: vive solo en Mantenimientos (como Incidencias).
        $managing = $this->getJson('/api/dashboard/managing')->assertOk();
        $this->assertFalse(
            collect($managing->json('data'))->pluck('incident_id')->contains($incident->id)
        );
    }
}
