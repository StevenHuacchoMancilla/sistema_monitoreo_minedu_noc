<?php

namespace Tests\Feature\Tracking;

use App\Enums\CidStatus;
use App\Enums\FollowupStatus;
use App\Enums\ManagementClassification;
use App\Enums\MonitoringStatus;
use App\Enums\TrackingEventType;
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

class TrackingCloseMultiactorTest extends TestCase
{
    use RefreshDatabase;

    private function seedIncident(): Incident
    {
        $school = School::query()->create([
            'codigo_local' => '367010',
            'local_educativo' => 'COLEGIO CIERRE MULTIACTOR',
            'current_sequence' => 403,
            'active' => true,
        ]);
        $assignment = NetworkAssignment::query()->create([
            'school_id' => $school->id,
            'cid' => '258766',
            'cid_status' => CidStatus::Valid,
            'monitoring_eligible' => true,
            'is_active' => true,
        ]);
        $sensor = PrtgSensor::query()->create([
            'network_assignment_id' => $assignment->id,
            'prtg_sensor_id' => '92010',
            'prtg_device_id' => '82010',
            'name' => 'Ping',
            'normalized_status' => MonitoringStatus::Caido,
            'status_raw' => '5',
            'last_synced_at' => now(),
        ]);
        SchoolContact::query()->create([
            'school_id' => $school->id,
            'position' => 1,
            'name' => 'Docente',
            'role' => 'Docente',
            'phone' => '999111000',
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

    public function test_steven_opens_luis_follows_judith_closes_with_immutable_case_code(): void
    {
        $incident = $this->seedIncident();

        $steven = User::factory()->create(['name' => 'Steven', 'role' => UserRole::NocOperator, 'active' => true]);
        $luis = User::factory()->create(['name' => 'Luis', 'role' => UserRole::NocOperator, 'active' => true]);
        $judith = User::factory()->create(['name' => 'Judith', 'role' => UserRole::NocOperator, 'active' => true]);

        $this->actingAs($steven);
        $first = $this->postJson("/api/incidents/{$incident->id}/managements", [
            'classification' => ManagementClassification::ContactConfirmed->value,
            'observation' => 'Se realizaron descartes con el responsable del local.',
        ])->assertOk();

        $trackingId = (int) $first->json('tracking_sync.tracking_id');
        $this->assertGreaterThan(0, $trackingId);

        $tracking = TrackingRecord::query()->findOrFail($trackingId);
        $caseCode = $tracking->case_code;
        $publicId = $tracking->public_id;
        $this->assertSame($steven->id, $tracking->opened_by_user_id);
        $this->assertStringContainsString('_COPEN_', (string) $tracking->report_ticket);

        $this->actingAs($luis);
        $this->postJson("/api/incidents/{$incident->id}/managements", [
            'classification' => ManagementClassification::ContactConfirmed->value,
            'observation' => 'Se coordinó atención con soporte.',
        ])
            ->assertOk()
            ->assertJsonPath('tracking_sync.created', false)
            ->assertJsonPath('tracking_sync.tracking_id', $trackingId);

        $this->assertDatabaseCount('tracking_records', 1);
        $this->assertSame(2, TrackingUpdate::query()->where('tracking_record_id', $trackingId)->count());

        $this->actingAs($judith);
        $closed = $this->postJson("/api/tracking/{$trackingId}/close", [
            'lock_version' => (int) $tracking->fresh()->lock_version,
            'closing_note' => 'Servicio validado en sitio',
        ])->assertOk();

        $closed->assertJsonPath('data.status', TrackingStatus::Closed->value)
            ->assertJsonPath('data.opened_by_user_id', $steven->id)
            ->assertJsonPath('data.opened_by_name', 'Steven')
            ->assertJsonPath('data.closed_by_user_id', $judith->id)
            ->assertJsonPath('data.closed_by_name', 'Judith')
            ->assertJsonPath('data.case_code', $caseCode)
            ->assertJsonPath('data.public_id', $publicId);

        $finalTicket = (string) $closed->json('data.report_ticket');
        $this->assertStringNotContainsString('_COPEN_', $finalTicket);
        $this->assertMatchesRegularExpression('/_C\d{14}_/', $finalTicket);

        $this->assertTrue(
            TrackingUpdate::query()
                ->where('tracking_record_id', $trackingId)
                ->where('event_type', TrackingEventType::SystemEvent->value)
                ->where('body', 'like', '%Judith%')
                ->exists()
        );

        $audit = AuditLog::query()
            ->where('action', 'CLOSE_TRACKING')
            ->where('user_id', $judith->id)
            ->latest('id')
            ->first();
        $this->assertNotNull($audit);
        $after = $audit->after_json;
        $this->assertSame($caseCode, $after['case_code'] ?? null);
        $this->assertSame($steven->id, $after['opened_by_user_id'] ?? null);
        $this->assertSame($judith->id, $after['closed_by_user_id'] ?? null);
        $this->assertSame($finalTicket, $after['final_ticket_code'] ?? null);
    }
}
