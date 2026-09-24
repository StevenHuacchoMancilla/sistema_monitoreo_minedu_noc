<?php

namespace Tests\Feature\Tracking;

use App\Enums\CidStatus;
use App\Enums\FollowupStatus;
use App\Enums\ManagementClassification;
use App\Enums\MonitoringStatus;
use App\Enums\TrackingStatus;
use App\Enums\UserRole;
use App\Models\AuditLog;
use App\Models\Incident;
use App\Models\NetworkAssignment;
use App\Models\PrtgSensor;
use App\Models\School;
use App\Models\SchoolContact;
use App\Models\TrackingRecord;
use App\Models\TrackingUpdate;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class TrackingFromManagementTest extends TestCase
{
    use RefreshDatabase;

    private function seedIncident(): Incident
    {
        $school = School::query()->create([
            'codigo_local' => '365100',
            'local_educativo' => 'COLEGIO GESTION TRACKING',
            'provincia' => 'MAYNAS',
            'distrito' => 'IQUITOS',
            'current_sequence' => 403,
            'active' => true,
        ]);

        $assignment = NetworkAssignment::query()->create([
            'school_id' => $school->id,
            'cid' => '258766',
            'cid_status' => CidStatus::Valid,
            'monitoring_eligible' => true,
            'prtg_device_name' => 'CID258766_TEST_LORETO_MAYNAS_IQUITOS',
            'is_active' => true,
        ]);

        $sensor = PrtgSensor::query()->create([
            'network_assignment_id' => $assignment->id,
            'prtg_sensor_id' => '91001',
            'prtg_device_id' => '81001',
            'name' => 'Ping',
            'device_name' => 'CID258766_TEST_LORETO_MAYNAS_IQUITOS',
            'normalized_status' => MonitoringStatus::Caido,
            'status_raw' => '5',
            'last_synced_at' => now(),
        ]);

        SchoolContact::query()->create([
            'school_id' => $school->id,
            'position' => 1,
            'name' => 'Responsable',
            'role' => 'Docente',
            'phone' => '999000111',
        ]);

        return Incident::query()->create([
            'school_id' => $school->id,
            'network_assignment_id' => $assignment->id,
            'prtg_sensor_id' => $sensor->id,
            'started_at' => now()->subHour(),
            'current_status' => MonitoringStatus::Caido->value,
            'followup_status' => FollowupStatus::PendienteContacto,
            'management_classification' => ManagementClassification::NewOutage,
        ]);
    }

    public function test_first_management_creates_tracking_with_actor_and_update(): void
    {
        $incident = $this->seedIncident();
        $steven = $this->actingAsUser(
            User::factory()->create(['name' => 'Steven', 'role' => UserRole::NocOperator]),
            UserRole::NocOperator
        );

        $response = $this->postJson("/api/incidents/{$incident->id}/managements", [
            'classification' => ManagementClassification::ContactConfirmed->value,
            'scope' => 'PEXT',
            'detail' => 'Confirmado en sitio',
            'observation' => 'Se realizaron descartes con el responsable del local.',
        ]);

        $response->assertOk()
            ->assertJsonPath('tracking_sync.created', true)
            ->assertJsonPath('tracking_sync.status', TrackingStatus::InProgress->value)
            ->assertJsonPath('active_tracking.opened_by_name', 'Steven')
            ->assertJsonPath('estado.active_tracking_id', $response->json('tracking_sync.tracking_id'));

        $this->assertDatabaseCount('tracking_records', 1);
        $this->assertDatabaseCount('tracking_updates', 1);

        $tracking = TrackingRecord::query()->firstOrFail();
        $this->assertSame($incident->id, $tracking->incident_id);
        $this->assertSame($steven->id, $tracking->opened_by_user_id);
        $this->assertSame('258766', $tracking->cid_snapshot);
        $this->assertSame('403', $tracking->tss_snapshot);
        $this->assertSame('LINK DOWN CID258766', $tracking->description);
        $this->assertNotNull($tracking->opened_at);

        $update = TrackingUpdate::query()->firstOrFail();
        $this->assertSame('Se realizaron descartes con el responsable del local.', $update->body);
        $this->assertSame($steven->id, $update->created_by_user_id);

        $this->assertTrue(
            AuditLog::query()->where('action', 'OPEN_TRACKING')->where('user_id', $steven->id)->exists()
        );
        $this->assertTrue(
            AuditLog::query()->where('action', 'ADD_TRACKING_UPDATE')->where('user_id', $steven->id)->exists()
        );
    }

    public function test_second_management_reuses_same_tracking_with_new_author(): void
    {
        $incident = $this->seedIncident();
        $steven = $this->actingAsUser(
            User::factory()->create(['name' => 'Steven', 'role' => UserRole::NocOperator]),
            UserRole::NocOperator
        );

        $this->postJson("/api/incidents/{$incident->id}/managements", [
            'classification' => ManagementClassification::ContactConfirmed->value,
            'observation' => 'Primera gestión de Steven',
        ])->assertOk();

        $luis = User::factory()->create(['name' => 'Luis', 'role' => UserRole::NocOperator]);
        $this->actingAs($luis);

        $second = $this->postJson("/api/incidents/{$incident->id}/managements", [
            'classification' => ManagementClassification::ContactConfirmed->value,
            'observation' => 'Se coordinó atención con soporte.',
        ]);

        $second->assertOk()
            ->assertJsonPath('tracking_sync.created', false);

        $this->assertDatabaseCount('tracking_records', 1);
        $this->assertDatabaseCount('tracking_updates', 2);

        $bodies = TrackingUpdate::query()->orderBy('id')->pluck('body')->all();
        $this->assertSame([
            'Primera gestión de Steven',
            'Se coordinó atención con soporte.',
        ], $bodies);

        $authors = TrackingUpdate::query()->orderBy('id')->pluck('created_by_user_id')->all();
        $this->assertSame([$steven->id, $luis->id], $authors);

        $tracking = TrackingRecord::query()->firstOrFail();
        $this->assertSame($steven->id, $tracking->opened_by_user_id);
    }

    public function test_opening_incident_detail_does_not_create_tracking(): void
    {
        $incident = $this->seedIncident();
        $this->actingAsUser(null, UserRole::NocOperator);

        $this->getJson("/api/incidents/{$incident->id}")->assertOk();

        $this->assertDatabaseCount('tracking_records', 0);
        $this->assertDatabaseCount('tracking_updates', 0);
    }
}
