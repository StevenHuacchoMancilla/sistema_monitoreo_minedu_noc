<?php

namespace Tests\Feature\Tracking;

use App\Enums\CidStatus;
use App\Enums\FollowupStatus;
use App\Enums\ManagementClassification;
use App\Enums\MonitoringStatus;
use App\Enums\TrackingStatus;
use App\Enums\UserRole;
use App\Models\Incident;
use App\Models\NetworkAssignment;
use App\Models\School;
use App\Models\TrackingRecord;
use App\Models\TrackingUpdate;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class TrackingPurgeDevCommandTest extends TestCase
{
    use RefreshDatabase;

    public function test_purge_deletes_only_tracking_tables(): void
    {
        $user = User::factory()->create(['role' => UserRole::NocOperator]);
        $school = School::query()->create([
            'codigo_local' => '100001',
            'local_educativo' => 'COLEGIO PURGE',
            'current_sequence' => 10,
            'active' => true,
        ]);
        $assignment = NetworkAssignment::query()->create([
            'school_id' => $school->id,
            'cid' => '258001',
            'cid_status' => CidStatus::Valid,
            'monitoring_eligible' => true,
            'is_active' => true,
        ]);
        $incident = Incident::query()->create([
            'school_id' => $school->id,
            'network_assignment_id' => $assignment->id,
            'started_at' => now(),
            'current_status' => MonitoringStatus::Caido->value,
            'followup_status' => FollowupStatus::PendienteContacto,
            'management_classification' => ManagementClassification::NewOutage,
        ]);

        $tracking = TrackingRecord::query()->create([
            'incident_number' => 1,
            'incident_id' => $incident->id,
            'school_id' => $school->id,
            'network_assignment_id' => $assignment->id,
            'status' => TrackingStatus::Open,
            'opened_at' => now(),
            'opened_by_user_id' => $user->id,
        ]);
        TrackingUpdate::query()->create([
            'tracking_record_id' => $tracking->id,
            'body' => 'Seguimiento de prueba',
            'created_by_user_id' => $user->id,
            'occurred_at' => now(),
        ]);

        $this->artisan('tracking:purge-dev', ['--force' => true])
            ->assertSuccessful();

        $this->assertSame(0, TrackingRecord::query()->count());
        $this->assertSame(0, TrackingUpdate::query()->count());
        $this->assertSame(1, Incident::query()->count());
        $this->assertSame(1, School::query()->count());
        $this->assertDatabaseHas('users', ['id' => $user->id]);
    }

    public function test_purge_aborts_outside_local_or_testing(): void
    {
        $this->app['env'] = 'production';

        $this->artisan('tracking:purge-dev', ['--force' => true])
            ->assertFailed();
    }
}
