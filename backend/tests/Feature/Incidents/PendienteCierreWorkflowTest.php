<?php

namespace Tests\Feature\Incidents;

use App\Domain\Incidents\Services\IncidentService;
use App\Enums\CidStatus;
use App\Enums\FollowupStatus;
use App\Enums\ManagementClassification;
use App\Enums\MonitoringStatus;
use App\Models\Incident;
use App\Models\NetworkAssignment;
use App\Models\PrtgSensor;
use App\Models\School;
use App\Support\OperationalTime;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

class PendienteCierreWorkflowTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->actingAsUser();
        // Lunes laboral en Lima (evita sáb/dom de la fecha real del runner).
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

    private function seedManagingIncident(): Incident
    {
        $school = School::query()->create([
            'codigo_local' => '364599',
            'local_educativo' => 'COLEGIO PENDIENTE CIERRE',
            'provincia' => 'MAYNAS',
            'distrito' => 'IQUITOS',
            'current_sequence' => 99,
            'active' => true,
        ]);

        $assignment = NetworkAssignment::query()->create([
            'school_id' => $school->id,
            'cid' => '258499',
            'cid_status' => CidStatus::Valid,
            'monitoring_eligible' => true,
            'prtg_device_name' => 'CID258499_TEST_LORETO_MAYNAS_IQUITOS',
            'is_active' => true,
        ]);

        $sensor = PrtgSensor::query()->create([
            'network_assignment_id' => $assignment->id,
            'prtg_sensor_id' => '9099',
            'prtg_device_id' => '8099',
            'name' => 'Ping',
            'sensor_role' => 'PING',
            'device_name' => 'CID258499_TEST_LORETO_MAYNAS_IQUITOS',
            'normalized_status' => MonitoringStatus::Caido,
            'status_raw' => '5',
            'last_synced_at' => now(),
        ]);

        return Incident::query()->create([
            'school_id' => $school->id,
            'network_assignment_id' => $assignment->id,
            'prtg_sensor_id' => $sensor->id,
            'started_at' => now()->subHour(),
            'current_status' => MonitoringStatus::Caido->value,
            'followup_status' => FollowupStatus::EnGestion,
            'management_classification' => ManagementClassification::ContactConfirmed,
        ]);
    }

    public function test_recovery_from_managing_goes_to_pendiente_cierre(): void
    {
        $incident = $this->seedManagingIncident();

        app(IncidentService::class)->applyTechnicalRecovery($incident, 'Test recovery');

        $incident->refresh();
        $this->assertNotNull($incident->recovered_at);
        $this->assertTrue((bool) $incident->recovered_while_managing);
        $this->assertSame(FollowupStatus::PendienteCierre, $incident->followup_status);
    }

    public function test_recovery_without_management_goes_to_pendiente_cierre_on_weekday(): void
    {
        $incident = $this->seedManagingIncident();
        $incident->update(['followup_status' => FollowupStatus::PendienteContacto]);

        app(IncidentService::class)->applyTechnicalRecovery($incident->fresh(), 'Test recovery unmanaged');

        $incident->refresh();
        $this->assertNotNull($incident->recovered_at);
        $this->assertFalse((bool) $incident->recovered_while_managing);
        $this->assertSame(FollowupStatus::PendienteCierre, $incident->followup_status);
    }

    public function test_weekend_recovery_does_not_go_to_pendiente_cierre(): void
    {
        // Domingo 8 nov 2026 Lima
        $this->freezeLima('2026-11-08 16:00:00');
        $incident = $this->seedManagingIncident();

        app(IncidentService::class)->applyTechnicalRecovery($incident->fresh(), 'Weekend recovery');

        $incident->refresh();
        $this->assertNotNull($incident->recovered_at);
        $this->assertSame(FollowupStatus::Cerrado, $incident->followup_status);
        $this->assertNotSame(FollowupStatus::PendienteCierre, $incident->followup_status);
    }

    public function test_saturday_recovery_from_caidas_auto_closes(): void
    {
        // Sábado 7 nov 2026 Lima
        $this->freezeLima('2026-11-07 11:30:00');
        $incident = $this->seedManagingIncident();
        $incident->update(['followup_status' => FollowupStatus::PendienteContacto]);

        app(IncidentService::class)->applyTechnicalRecovery($incident->fresh(), 'Saturday recovery');

        $incident->refresh();
        $this->assertNotNull($incident->recovered_at);
        $this->assertSame(FollowupStatus::Cerrado, $incident->followup_status);
    }

    public function test_mark_and_close_grave_endpoints(): void
    {
        $incident = $this->seedManagingIncident();

        $this->postJson("/api/incidents/{$incident->id}/mark-grave", ['observation' => 'grave'])
            ->assertOk();

        $incident->refresh();
        $this->assertTrue((bool) $incident->is_grave_incident);
        $this->assertNull($incident->grave_closed_at);

        $this->postJson("/api/incidents/{$incident->id}/close-grave")
            ->assertOk();

        $incident->refresh();
        $this->assertNotNull($incident->grave_closed_at);
    }

    public function test_close_ticket_endpoint(): void
    {
        $incident = $this->seedManagingIncident();

        $this->postJson("/api/incidents/{$incident->id}/close-ticket", ['observation' => 'ok'])
            ->assertOk();

        $incident->refresh();
        $this->assertSame(FollowupStatus::Cerrado, $incident->followup_status);
        $this->assertNotNull($incident->recovered_at);
    }

    public function test_grave_recovery_does_not_leave_grave_or_auto_close(): void
    {
        $incident = $this->seedManagingIncident();
        $incident->update([
            'is_grave_incident' => true,
            'grave_opened_at' => now(),
            'grave_closed_at' => null,
        ]);

        app(IncidentService::class)->applyTechnicalRecovery($incident->fresh(), 'PRTG UP grave');

        $incident->refresh();
        $this->assertNotNull($incident->recovered_at);
        $this->assertTrue((bool) $incident->is_grave_incident);
        $this->assertNull($incident->grave_closed_at);
        $this->assertSame(FollowupStatus::EnGestion, $incident->followup_status);
        $this->assertNotSame(FollowupStatus::Cerrado, $incident->followup_status);
        $this->assertNotSame(FollowupStatus::PendienteCierre, $incident->followup_status);
    }

    public function test_close_ticket_closes_open_tracking_with_user(): void
    {
        $incident = $this->seedManagingIncident();

        $open = $this->postJson('/api/tracking', ['incident_id' => $incident->id]);
        $open->assertSuccessful();
        $trackingId = (int) $open->json('data.id');
        $this->assertGreaterThan(0, $trackingId);

        $this->postJson("/api/incidents/{$incident->id}/close-ticket", ['observation' => 'cierre unificado'])
            ->assertOk();

        $incident->refresh();
        $this->assertSame(FollowupStatus::Cerrado, $incident->followup_status);

        $tracking = \App\Models\TrackingRecord::query()->findOrFail($trackingId);
        $this->assertTrue($tracking->isClosed());
        $this->assertNotNull($tracking->closed_by_user_id);

        $this->assertDatabaseHas('incident_updates', [
            'incident_id' => $incident->id,
            'status_after' => FollowupStatus::Cerrado->value,
        ]);
        $update = \App\Models\IncidentUpdate::query()
            ->where('incident_id', $incident->id)
            ->where('status_after', FollowupStatus::Cerrado->value)
            ->latest('id')
            ->first();
        $this->assertNotNull($update?->user_id);
    }

    public function test_followup_label_pendiente_gestion(): void
    {
        $this->assertSame('Pendiente de gestión', FollowupStatus::PendienteContacto->label());
    }
}
