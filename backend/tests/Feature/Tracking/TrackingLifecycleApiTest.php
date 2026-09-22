<?php

namespace Tests\Feature\Tracking;

use App\Enums\CidStatus;
use App\Enums\DatePrecision;
use App\Enums\TrackingStatus;
use App\Enums\UserRole;
use App\Models\AuditLog;
use App\Models\NetworkAssignment;
use App\Models\School;
use App\Models\TrackingRecord;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class TrackingLifecycleApiTest extends TestCase
{
    use RefreshDatabase;

    private function seedOpenTracking(User $opener, int $number = 801): TrackingRecord
    {
        $school = School::query()->create([
            'codigo_local' => (string) (364580 + $number),
            'local_educativo' => "COLEGIO CLOSE {$number}",
            'current_sequence' => $number,
            'active' => true,
        ]);
        $assignment = NetworkAssignment::query()->create([
            'school_id' => $school->id,
            'cid' => (string) (258500 + $number),
            'cid_status' => CidStatus::Valid,
            'is_active' => true,
            'monitoring_eligible' => true,
        ]);

        return TrackingRecord::query()->create([
            'incident_number' => $number,
            'school_id' => $school->id,
            'network_assignment_id' => $assignment->id,
            'tss_snapshot' => (string) $number,
            'cid_snapshot' => (string) (258500 + $number),
            'description' => 'LINK DOWN',
            'status' => TrackingStatus::InProgress,
            'opened_at' => now()->subHours(3),
            'opened_at_precision' => DatePrecision::DateTime,
            'opened_by_user_id' => $opener->id,
            'lock_version' => 1,
        ]);
    }

    public function test_third_user_can_close_and_closed_by_is_that_user(): void
    {
        $opener = User::factory()->create(['role' => UserRole::NocOperator, 'active' => true, 'name' => 'Elias']);
        $closer = User::factory()->create(['role' => UserRole::NocOperator, 'active' => true, 'name' => 'Judith']);
        $tracking = $this->seedOpenTracking($opener);

        $this->actingAs($closer);

        $this->postJson("/api/tracking/{$tracking->id}/close", [
            'lock_version' => 1,
            'closing_note' => 'Enlace restablecido y validado',
        ])
            ->assertOk()
            ->assertJsonPath('data.status', TrackingStatus::Closed->value)
            ->assertJsonPath('data.closed_by_user_id', $closer->id)
            ->assertJsonPath('data.closed_by_name', 'Judith')
            ->assertJsonPath('data.closing_note', 'Enlace restablecido y validado')
            ->assertJsonPath('data.can_add_update', false)
            ->assertJsonPath('data.can_reopen', true);

        $this->assertTrue(
            AuditLog::query()->where('action', 'CLOSE_TRACKING')->where('user_id', $closer->id)->exists()
        );
    }

    public function test_double_close_returns_409_with_message(): void
    {
        $opener = User::factory()->create(['role' => UserRole::NocOperator, 'active' => true, 'name' => 'Luis']);
        $tracking = $this->seedOpenTracking($opener, 802);
        $this->actingAs($opener);

        $this->postJson("/api/tracking/{$tracking->id}/close", [
            'lock_version' => 1,
            'closing_note' => 'Primero',
        ])->assertOk();

        $tracking->refresh();

        $this->postJson("/api/tracking/{$tracking->id}/close", [
            'lock_version' => (int) $tracking->lock_version,
        ])
            ->assertStatus(409)
            ->assertJsonPath('error', 'ALREADY_CLOSED')
            ->assertJsonFragment(['error' => 'ALREADY_CLOSED']);

        $message = (string) $this->postJson("/api/tracking/{$tracking->id}/close", [
            'lock_version' => (int) $tracking->fresh()->lock_version,
        ])->json('message');

        $this->assertStringContainsString('ya fue cerrado por Luis', $message);
    }

    public function test_stale_lock_version_returns_409(): void
    {
        $opener = $this->actingAsUser(null, UserRole::NocOperator);
        $tracking = $this->seedOpenTracking($opener, 803);

        $this->postJson("/api/tracking/{$tracking->id}/close", [
            'lock_version' => 99,
        ])
            ->assertStatus(409)
            ->assertJsonPath('error', 'STALE_VERSION');
    }

    public function test_closed_tracking_rejects_normal_updates(): void
    {
        $opener = $this->actingAsUser(null, UserRole::NocOperator);
        $tracking = $this->seedOpenTracking($opener, 804);

        $this->postJson("/api/tracking/{$tracking->id}/close", ['lock_version' => 1])->assertOk();

        $this->postJson("/api/tracking/{$tracking->id}/updates", [
            'body' => 'No debería entrar',
        ])->assertStatus(422);
    }

    public function test_reopen_registers_audit_and_allows_updates(): void
    {
        $opener = User::factory()->create(['role' => UserRole::Admin, 'active' => true, 'name' => 'Alvaro']);
        $reopener = User::factory()->create(['role' => UserRole::NocOperator, 'active' => true, 'name' => 'Elias']);
        $tracking = $this->seedOpenTracking($opener, 805);

        $this->actingAs($opener);
        $closed = $this->postJson("/api/tracking/{$tracking->id}/close", [
            'lock_version' => 1,
            'closing_note' => 'Cerrado temporal',
        ])->assertOk();

        $lock = (int) $closed->json('data.lock_version');

        $this->actingAs($reopener);
        $this->postJson("/api/tracking/{$tracking->id}/reopen", [
            'lock_version' => $lock,
            'note' => 'Volvió a caer',
        ])
            ->assertOk()
            ->assertJsonPath('data.status', TrackingStatus::InProgress->value)
            ->assertJsonPath('data.closed_at', null)
            ->assertJsonPath('data.can_add_update', true)
            ->assertJsonPath('data.can_close', true);

        $this->assertTrue(
            AuditLog::query()->where('action', 'REOPEN_TRACKING')->where('user_id', $reopener->id)->exists()
        );

        $this->postJson("/api/tracking/{$tracking->id}/updates", [
            'body' => 'Nuevo seguimiento tras reapertura',
        ])->assertCreated();
    }

    public function test_viewer_cannot_close_or_reopen(): void
    {
        $opener = User::factory()->create(['role' => UserRole::NocOperator, 'active' => true]);
        $tracking = $this->seedOpenTracking($opener, 806);

        $this->actingAsUser(null, UserRole::Viewer);

        $this->postJson("/api/tracking/{$tracking->id}/close", ['lock_version' => 1])
            ->assertForbidden();

        $tracking->update([
            'status' => TrackingStatus::Closed,
            'closed_at' => now(),
            'closed_by_user_id' => $opener->id,
            'lock_version' => 2,
        ]);

        $this->postJson("/api/tracking/{$tracking->id}/reopen", ['lock_version' => 2])
            ->assertForbidden();
    }

    public function test_acknowledge_recovery_only_when_technically_recovered(): void
    {
        $opener = $this->actingAsUser(null, UserRole::NocOperator);
        $tracking = $this->seedOpenTracking($opener, 807);

        $this->postJson("/api/tracking/{$tracking->id}/acknowledge-recovery", [
            'lock_version' => 1,
        ])->assertStatus(422);

        $tracking->update([
            'status' => TrackingStatus::TechnicallyRecovered,
            'lock_version' => 2,
        ]);

        $this->postJson("/api/tracking/{$tracking->id}/acknowledge-recovery", [
            'lock_version' => 2,
            'note' => 'Validado en sitio',
        ])
            ->assertOk()
            ->assertJsonPath('data.status', TrackingStatus::TechnicallyRecovered->value)
            ->assertJsonPath('data.can_close', true);

        $this->assertTrue(
            AuditLog::query()->where('action', 'ACKNOWLEDGE_TRACKING_RECOVERY')->exists()
        );
    }
}
