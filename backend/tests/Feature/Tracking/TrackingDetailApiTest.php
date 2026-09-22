<?php

namespace Tests\Feature\Tracking;

use App\Enums\CidStatus;
use App\Enums\DatePrecision;
use App\Enums\TrackingStatus;
use App\Enums\UserRole;
use App\Models\NetworkAssignment;
use App\Models\School;
use App\Models\TrackingRecord;
use App\Models\TrackingUpdate;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class TrackingDetailApiTest extends TestCase
{
    use RefreshDatabase;

    private function seedTracking(User $opener): TrackingRecord
    {
        $school = School::query()->create([
            'codigo_local' => '364552',
            'local_educativo' => 'COLEGIO DETALLE',
            'current_sequence' => 77,
            'active' => true,
        ]);
        $assignment = NetworkAssignment::query()->create([
            'school_id' => $school->id,
            'cid' => '258440',
            'cid_status' => CidStatus::Valid,
            'is_active' => true,
            'monitoring_eligible' => true,
            'tecnologia_acceso' => 'GPON',
            'prtg_province' => 'MAYNAS',
            'prtg_district' => 'IQUITOS',
        ]);

        return TrackingRecord::query()->create([
            'incident_number' => 24,
            'school_id' => $school->id,
            'network_assignment_id' => $assignment->id,
            'ticket' => null,
            'tss_snapshot' => '77',
            'cid_snapshot' => '258440',
            'description' => 'LINK DOWN CID258440',
            'status' => TrackingStatus::Open,
            'opened_at' => now()->subHours(5),
            'opened_at_precision' => DatePrecision::DateTime,
            'opened_by_user_id' => $opener->id,
            'lock_version' => 1,
        ]);
    }

    public function test_show_includes_timeline_and_summary(): void
    {
        $opener = $this->actingAsUser(role: UserRole::NocOperator);
        $tracking = $this->seedTracking($opener);

        TrackingUpdate::query()->create([
            'tracking_record_id' => $tracking->id,
            'event_type' => 'COMMENT',
            'body' => 'Descarte inicial',
            'created_by_user_id' => $opener->id,
            'occurred_at' => now()->subHour(),
        ]);

        $this->getJson("/api/tracking/{$tracking->id}")
            ->assertOk()
            ->assertJsonPath('data.incident_number', 24)
            ->assertJsonPath('data.cid_snapshot', '258440')
            ->assertJsonPath('data.can_add_update', true)
            ->assertJsonPath('data.updates.0.body', 'Descarte inicial')
            ->assertJsonPath('data.activity.0.kind', 'OPENED');
    }

    public function test_operator_can_add_update_and_moves_to_in_progress(): void
    {
        $opener = $this->actingAsUser(role: UserRole::NocOperator);
        $tracking = $this->seedTracking($opener);

        $other = User::factory()->create(['name' => 'Luis', 'role' => UserRole::NocOperator]);
        $this->actingAs($other);

        $this->postJson("/api/tracking/{$tracking->id}/updates", [
            'body' => 'Se reporta en grupo marcha blanca',
        ])
            ->assertCreated()
            ->assertJsonPath('data.status', 'IN_PROGRESS')
            ->assertJsonPath('data.updates.0.body', 'Se reporta en grupo marcha blanca')
            ->assertJsonPath('data.updates.0.actor_name', 'Luis');

        $this->assertDatabaseHas('tracking_updates', [
            'tracking_record_id' => $tracking->id,
            'created_by_user_id' => $other->id,
            'body' => 'Se reporta en grupo marcha blanca',
        ]);
    }

    public function test_closed_tracking_rejects_updates(): void
    {
        $opener = $this->actingAsUser(role: UserRole::NocOperator);
        $tracking = $this->seedTracking($opener);
        $tracking->update([
            'status' => TrackingStatus::Closed,
            'closed_at' => now(),
            'closed_by_user_id' => $opener->id,
        ]);

        $this->postJson("/api/tracking/{$tracking->id}/updates", [
            'body' => 'No debería entrar',
        ])->assertStatus(422);
    }

    public function test_viewer_cannot_add_update(): void
    {
        $opener = User::factory()->create(['role' => UserRole::NocOperator]);
        $tracking = $this->seedTracking($opener);
        $this->actingAsUser(role: UserRole::Viewer);

        $this->postJson("/api/tracking/{$tracking->id}/updates", [
            'body' => 'Viewer intenta',
        ])->assertForbidden();
    }
}
