<?php

namespace Tests\Feature\Tracking;

use App\Enums\CidStatus;
use App\Enums\DatePrecision;
use App\Enums\MonitoringStatus;
use App\Enums\TrackingEventType;
use App\Enums\TrackingStatus;
use App\Enums\TrackingTechnicalStatus;
use App\Enums\UserRole;
use App\Models\Incident;
use App\Models\NetworkAssignment;
use App\Models\School;
use App\Models\TrackingRecord;
use App\Models\TrackingUpdate;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class TrackingRecordModelTest extends TestCase
{
    use RefreshDatabase;

    /**
     * @return array{school: School, assignment: NetworkAssignment, incident: Incident, opener: User}
     */
    private function seedContext(): array
    {
        $opener = User::factory()->create([
            'name' => 'Elias',
            'role' => UserRole::NocOperator,
        ]);

        $school = School::query()->create([
            'codigo_local' => '364552',
            'local_educativo' => 'COLEGIO TRACKING',
            'provincia' => 'MAYNAS',
            'distrito' => 'IQUITOS',
            'current_sequence' => 77,
            'active' => true,
        ]);

        $assignment = NetworkAssignment::query()->create([
            'school_id' => $school->id,
            'cid' => '258440',
            'cid_status' => CidStatus::Valid,
            'monitoring_eligible' => true,
            'is_active' => true,
            'tecnologia_acceso' => 'GPON',
        ]);

        $incident = Incident::query()->create([
            'school_id' => $school->id,
            'network_assignment_id' => $assignment->id,
            'started_at' => now()->subHour(),
            'current_status' => MonitoringStatus::Caido->value,
        ]);

        return compact('school', 'assignment', 'incident', 'opener');
    }

    public function test_can_create_tracking_with_append_only_updates(): void
    {
        ['school' => $school, 'assignment' => $assignment, 'incident' => $incident, 'opener' => $opener] = $this->seedContext();
        $closer = User::factory()->create(['name' => 'Judith', 'role' => UserRole::NocOperator]);

        $tracking = TrackingRecord::query()->create([
            'incident_number' => 1,
            'incident_id' => $incident->id,
            'school_id' => $school->id,
            'network_assignment_id' => $assignment->id,
            'ticket' => null,
            'tss_snapshot' => '77',
            'cid_snapshot' => '258440',
            'description' => 'LINK DOWN CID258440',
            'status' => TrackingStatus::Open,
            'technical_status' => TrackingTechnicalStatus::Down,
            'opened_at' => now(),
            'opened_at_precision' => DatePrecision::DateTime,
            'opened_by_user_id' => $opener->id,
            'lock_version' => 1,
        ]);

        TrackingUpdate::query()->create([
            'tracking_record_id' => $tracking->id,
            'event_type' => TrackingEventType::Comment,
            'body' => 'Se realizan descartes',
            'created_by_user_id' => $opener->id,
        ]);

        TrackingUpdate::query()->create([
            'tracking_record_id' => $tracking->id,
            'event_type' => TrackingEventType::FieldAction,
            'body' => 'Cambio de patchcord',
            'created_by_user_id' => $closer->id,
        ]);

        TrackingUpdate::query()->create([
            'tracking_record_id' => $tracking->id,
            'event_type' => TrackingEventType::TechnicalRecovery,
            'body' => 'PRTG reportó recuperación del servicio.',
            'legacy_actor_name' => null,
            'created_by_user_id' => null,
        ]);

        $tracking->refresh()->load(['updates.createdBy', 'openedBy']);

        $this->assertTrue($tracking->isOpen());
        $this->assertSame('Elias', $tracking->openedByDisplayName());
        $this->assertCount(3, $tracking->updates);
        $this->assertSame('Elias', $tracking->updates[0]->actorDisplayName());
        $this->assertSame('Judith', $tracking->updates[1]->actorDisplayName());
        $this->assertSame('Sistema', $tracking->updates[2]->actorDisplayName());
        $this->assertTrue($incident->activeTracking()->exists());
        $this->assertTrue($school->trackingRecords()->whereKey($tracking->id)->exists());
    }

    public function test_legacy_names_used_when_user_missing(): void
    {
        ['school' => $school, 'assignment' => $assignment] = $this->seedContext();

        $tracking = TrackingRecord::query()->create([
            'incident_number' => 2,
            'school_id' => $school->id,
            'network_assignment_id' => $assignment->id,
            'tss_snapshot' => '77',
            'cid_snapshot' => '258440',
            'description' => 'LINK DOWN CID258440',
            'status' => TrackingStatus::Closed,
            'opened_at' => now()->subDays(2)->startOfDay(),
            'opened_at_precision' => DatePrecision::Date,
            'opened_by_legacy_name' => 'Alvaro',
            'closed_at' => now()->subDay()->startOfDay(),
            'closed_at_precision' => DatePrecision::Date,
            'closed_by_legacy_name' => 'Judith',
            'lock_version' => 1,
        ]);

        $this->assertSame('Alvaro', $tracking->openedByDisplayName());
        $this->assertSame('Judith', $tracking->closedByDisplayName());
        $this->assertTrue($tracking->isClosed());
        $this->assertFalse($tracking->isOpen());
    }

    public function test_only_one_open_tracking_per_incident(): void
    {
        ['school' => $school, 'assignment' => $assignment, 'incident' => $incident, 'opener' => $opener] = $this->seedContext();

        TrackingRecord::query()->create([
            'incident_number' => 10,
            'incident_id' => $incident->id,
            'school_id' => $school->id,
            'network_assignment_id' => $assignment->id,
            'tss_snapshot' => '77',
            'cid_snapshot' => '258440',
            'description' => 'LINK DOWN CID258440',
            'status' => TrackingStatus::InProgress,
            'opened_at' => now(),
            'opened_at_precision' => DatePrecision::DateTime,
            'opened_by_user_id' => $opener->id,
            'lock_version' => 1,
        ]);

        $this->expectException(QueryException::class);

        TrackingRecord::query()->create([
            'incident_number' => 11,
            'incident_id' => $incident->id,
            'school_id' => $school->id,
            'network_assignment_id' => $assignment->id,
            'tss_snapshot' => '77',
            'cid_snapshot' => '258440',
            'description' => 'Duplicado activo',
            'status' => TrackingStatus::Open,
            'opened_at' => now(),
            'opened_at_precision' => DatePrecision::DateTime,
            'opened_by_user_id' => $opener->id,
            'lock_version' => 1,
        ]);
    }

    public function test_closed_tracking_still_blocks_second_row_for_same_incident(): void
    {
        ['school' => $school, 'assignment' => $assignment, 'incident' => $incident, 'opener' => $opener] = $this->seedContext();

        TrackingRecord::query()->create([
            'incident_number' => 20,
            'incident_id' => $incident->id,
            'school_id' => $school->id,
            'network_assignment_id' => $assignment->id,
            'tss_snapshot' => '77',
            'cid_snapshot' => '258440',
            'description' => 'Primero',
            'status' => TrackingStatus::Closed,
            'opened_at' => now()->subDay(),
            'opened_by_user_id' => $opener->id,
            'closed_at' => now()->subHour(),
            'closed_by_user_id' => $opener->id,
            'lock_version' => 1,
        ]);

        $this->expectException(QueryException::class);

        TrackingRecord::query()->create([
            'incident_number' => 21,
            'incident_id' => $incident->id,
            'school_id' => $school->id,
            'network_assignment_id' => $assignment->id,
            'tss_snapshot' => '77',
            'cid_snapshot' => '258440',
            'description' => 'Segundo abierto',
            'status' => TrackingStatus::Open,
            'opened_at' => now(),
            'opened_by_user_id' => $opener->id,
            'lock_version' => 1,
        ]);
    }

    public function test_lock_version_bumps(): void
    {
        ['school' => $school, 'assignment' => $assignment, 'opener' => $opener] = $this->seedContext();

        $tracking = TrackingRecord::query()->create([
            'incident_number' => 30,
            'school_id' => $school->id,
            'network_assignment_id' => $assignment->id,
            'tss_snapshot' => '77',
            'cid_snapshot' => '258440',
            'description' => 'Lock test',
            'status' => TrackingStatus::Open,
            'opened_at' => now(),
            'opened_by_user_id' => $opener->id,
            'lock_version' => 1,
        ]);

        $tracking->bumpLockVersion();
        $tracking->save();

        $this->assertSame(2, $tracking->fresh()->lock_version);
    }
}
