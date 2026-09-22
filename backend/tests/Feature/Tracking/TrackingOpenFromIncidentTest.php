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
use App\Models\TrackingRecord;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class TrackingOpenFromIncidentTest extends TestCase
{
    use RefreshDatabase;

    private function seedIncident(): array
    {
        $school = School::query()->create([
            'codigo_local' => '364560',
            'local_educativo' => 'COLEGIO OPEN TRACKING',
            'current_sequence' => 88,
            'active' => true,
        ]);

        $assignment = NetworkAssignment::query()->create([
            'school_id' => $school->id,
            'cid' => '258450',
            'cid_status' => CidStatus::Valid,
            'is_active' => true,
            'monitoring_eligible' => true,
            'tecnologia_acceso' => 'GPON',
        ]);

        $sensor = PrtgSensor::query()->create([
            'network_assignment_id' => $assignment->id,
            'prtg_sensor_id' => '9101',
            'prtg_device_id' => '8101',
            'name' => 'Ping',
            'device_name' => 'CID258450_TEST',
            'normalized_status' => MonitoringStatus::Caido,
            'status_raw' => '5',
            'last_synced_at' => now(),
        ]);

        $incident = Incident::query()->create([
            'school_id' => $school->id,
            'network_assignment_id' => $assignment->id,
            'prtg_sensor_id' => $sensor->id,
            'started_at' => now()->subHour(),
            'current_status' => MonitoringStatus::Caido->value,
            'followup_status' => FollowupStatus::PendienteContacto,
            'management_classification' => ManagementClassification::NewOutage,
            'glpi_ticket' => 'TK-100',
        ]);

        return compact('school', 'assignment', 'incident');
    }

    public function test_operator_opens_tracking_from_incident(): void
    {
        ['incident' => $incident] = $this->seedIncident();
        $opener = $this->actingAsUser(null, UserRole::NocOperator);

        $response = $this->postJson('/api/tracking', [
            'incident_id' => $incident->id,
        ]);

        $response->assertCreated()
            ->assertJsonPath('created', true)
            ->assertJsonPath('data.incident_id', $incident->id)
            ->assertJsonPath('data.school_id', $incident->school_id)
            ->assertJsonPath('data.cid_snapshot', '258450')
            ->assertJsonPath('data.tss_snapshot', '88')
            ->assertJsonPath('data.description', 'LINK DOWN CID258450')
            ->assertJsonPath('data.ticket', 'TK-100')
            ->assertJsonPath('data.status', TrackingStatus::Open->value)
            ->assertJsonPath('data.opened_by_user_id', $opener->id)
            ->assertJsonPath('data.opened_by_name', $opener->name);

        $this->assertDatabaseHas('tracking_records', [
            'incident_id' => $incident->id,
            'opened_by_user_id' => $opener->id,
            'status' => TrackingStatus::Open->value,
        ]);

        $this->assertTrue(
            AuditLog::query()
                ->where('action', 'OPEN_TRACKING')
                ->where('user_id', $opener->id)
                ->exists()
        );
    }

    public function test_reopen_request_returns_existing_active_tracking(): void
    {
        ['incident' => $incident] = $this->seedIncident();
        $opener = $this->actingAsUser(null, UserRole::NocOperator);

        $first = $this->postJson('/api/tracking', ['incident_id' => $incident->id]);
        $first->assertCreated();
        $trackingId = (int) $first->json('data.id');

        $second = $this->postJson('/api/tracking', ['incident_id' => $incident->id]);
        $second->assertOk()
            ->assertJsonPath('created', false)
            ->assertJsonPath('data.id', $trackingId);

        $this->assertSame(1, TrackingRecord::query()->where('incident_id', $incident->id)->count());
    }

    public function test_viewer_cannot_open_tracking(): void
    {
        ['incident' => $incident] = $this->seedIncident();
        $this->actingAsUser(null, UserRole::Viewer);

        $this->postJson('/api/tracking', ['incident_id' => $incident->id])
            ->assertForbidden();
    }

    public function test_incident_show_includes_active_tracking(): void
    {
        ['incident' => $incident] = $this->seedIncident();
        $this->actingAsUser(null, UserRole::NocOperator);

        $opened = $this->postJson('/api/tracking', ['incident_id' => $incident->id]);
        $opened->assertCreated();
        $trackingId = (int) $opened->json('data.id');

        $this->getJson("/api/incidents/{$incident->id}")
            ->assertOk()
            ->assertJsonPath('active_tracking.id', $trackingId)
            ->assertJsonPath('estado.active_tracking_id', $trackingId);
    }

    public function test_opened_by_comes_from_authenticated_user_not_body(): void
    {
        ['incident' => $incident] = $this->seedIncident();
        $opener = $this->actingAsUser(null, UserRole::Admin);
        $other = User::factory()->create([
            'role' => UserRole::NocOperator,
            'active' => true,
            'name' => 'Otro Operador',
        ]);

        $this->postJson('/api/tracking', [
            'incident_id' => $incident->id,
            'opened_by_user_id' => $other->id,
        ])
            ->assertCreated()
            ->assertJsonPath('data.opened_by_user_id', $opener->id)
            ->assertJsonPath('data.opened_by_name', $opener->name);
    }
}
