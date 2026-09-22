<?php

namespace Tests\Feature\Tracking;

use App\Domain\Incidents\Services\IncidentService;
use App\Enums\CidStatus;
use App\Enums\DatePrecision;
use App\Enums\FollowupStatus;
use App\Enums\ManagementClassification;
use App\Enums\MonitoringStatus;
use App\Enums\TrackingEventType;
use App\Enums\TrackingStatus;
use App\Enums\TrackingTechnicalStatus;
use App\Enums\UserRole;
use App\Models\Incident;
use App\Models\NetworkAssignment;
use App\Models\PrtgSensor;
use App\Models\School;
use App\Models\TrackingRecord;
use App\Models\TrackingUpdate;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class TrackingPrtgRecoveryHookTest extends TestCase
{
    use RefreshDatabase;

    /**
     * @return array{school: School, assignment: NetworkAssignment, sensor: PrtgSensor, incident: Incident, tracking: TrackingRecord}
     */
    private function seedOpenTracking(): array
    {
        $school = School::query()->create([
            'codigo_local' => '364570',
            'local_educativo' => 'COLEGIO RECOVERY HOOK',
            'current_sequence' => 91,
            'active' => true,
        ]);

        $assignment = NetworkAssignment::query()->create([
            'school_id' => $school->id,
            'cid' => '258460',
            'cid_status' => CidStatus::Valid,
            'is_active' => true,
            'monitoring_eligible' => true,
        ]);

        $sensor = PrtgSensor::query()->create([
            'network_assignment_id' => $assignment->id,
            'prtg_sensor_id' => '9201',
            'prtg_device_id' => '8201',
            'name' => 'Ping',
            'device_name' => 'CID258460_TEST',
            'normalized_status' => MonitoringStatus::Caido,
            'status_raw' => '5',
            'last_synced_at' => now(),
        ]);

        $incident = Incident::query()->create([
            'school_id' => $school->id,
            'network_assignment_id' => $assignment->id,
            'prtg_sensor_id' => $sensor->id,
            'started_at' => now()->subHours(2),
            'current_status' => MonitoringStatus::Caido->value,
            'followup_status' => FollowupStatus::PendienteContacto,
            'management_classification' => ManagementClassification::NewOutage,
        ]);

        $opener = $this->actingAsUser(null, UserRole::NocOperator);

        $tracking = TrackingRecord::query()->create([
            'incident_number' => 501,
            'incident_id' => $incident->id,
            'school_id' => $school->id,
            'network_assignment_id' => $assignment->id,
            'tss_snapshot' => '91',
            'cid_snapshot' => '258460',
            'description' => 'LINK DOWN CID258460',
            'status' => TrackingStatus::InProgress,
            'technical_status' => TrackingTechnicalStatus::Down,
            'opened_at' => now()->subHour(),
            'opened_at_precision' => DatePrecision::DateTime,
            'opened_by_user_id' => $opener->id,
            'lock_version' => 1,
        ]);

        return compact('school', 'assignment', 'sensor', 'incident', 'tracking');
    }

    public function test_prtg_recovery_marks_tracking_technically_recovered_without_closing(): void
    {
        ['assignment' => $assignment, 'sensor' => $sensor, 'incident' => $incident, 'tracking' => $tracking] = $this->seedOpenTracking();

        $sensor->update(['normalized_status' => MonitoringStatus::Operativo]);

        app(IncidentService::class)->applyTechnicalRecovery(
            $incident,
            'PRTG reportó recuperación (Ping OPERATIVO).'
        );

        $tracking->refresh();

        $this->assertSame(TrackingStatus::TechnicallyRecovered, $tracking->status);
        $this->assertSame(TrackingTechnicalStatus::Recovered, $tracking->technical_status);
        $this->assertNotNull($tracking->technical_recovered_at);
        $this->assertNull($tracking->closed_at);
        $this->assertTrue($tracking->isOpen());
        $this->assertFalse($tracking->isClosed());

        $this->assertDatabaseHas('tracking_updates', [
            'tracking_record_id' => $tracking->id,
            'event_type' => TrackingEventType::TechnicalRecovery->value,
            'created_by_user_id' => null,
        ]);

        $this->assertSame(
            1,
            TrackingUpdate::query()
                ->where('tracking_record_id', $tracking->id)
                ->where('event_type', TrackingEventType::TechnicalRecovery->value)
                ->count()
        );

        // Segunda llamada (incidencia ya recuperada) no duplica ni cierra.
        app(IncidentService::class)->applyTechnicalRecovery($incident->fresh(), 'otra');
        $this->assertSame(
            1,
            TrackingUpdate::query()
                ->where('tracking_record_id', $tracking->id)
                ->where('event_type', TrackingEventType::TechnicalRecovery->value)
                ->count()
        );
        $tracking->refresh();
        $this->assertNull($tracking->closed_at);
    }

    public function test_prtg_reoutage_relinks_open_tracking_without_closing(): void
    {
        ['assignment' => $assignment, 'sensor' => $sensor, 'incident' => $oldIncident, 'tracking' => $tracking] = $this->seedOpenTracking();

        app(IncidentService::class)->applyTechnicalRecovery(
            $oldIncident,
            'PRTG reportó recuperación (Ping OPERATIVO).'
        );

        $tracking->refresh();
        $this->assertSame(TrackingStatus::TechnicallyRecovered, $tracking->status);
        $this->assertNotNull($oldIncident->fresh()->recovered_at);

        $sensor->update(['normalized_status' => MonitoringStatus::Caido]);

        $newIncident = app(IncidentService::class)->ensureOpen($assignment, $sensor->fresh());

        $this->assertNotSame($oldIncident->id, $newIncident->id);

        $tracking->refresh();
        $this->assertSame($newIncident->id, $tracking->incident_id);
        $this->assertSame(TrackingStatus::InProgress, $tracking->status);
        $this->assertSame(TrackingTechnicalStatus::Down, $tracking->technical_status);
        $this->assertNull($tracking->closed_at);

        $this->assertDatabaseHas('tracking_updates', [
            'tracking_record_id' => $tracking->id,
            'event_type' => TrackingEventType::SystemEvent->value,
        ]);
    }

    public function test_recovery_without_open_tracking_is_noop_for_tracking(): void
    {
        $school = School::query()->create([
            'codigo_local' => '364571',
            'local_educativo' => 'SIN TRACKING',
            'current_sequence' => 92,
            'active' => true,
        ]);
        $assignment = NetworkAssignment::query()->create([
            'school_id' => $school->id,
            'cid' => '258461',
            'cid_status' => CidStatus::Valid,
            'is_active' => true,
            'monitoring_eligible' => true,
        ]);
        $sensor = PrtgSensor::query()->create([
            'network_assignment_id' => $assignment->id,
            'prtg_sensor_id' => '9202',
            'prtg_device_id' => '8202',
            'name' => 'Ping',
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
        ]);

        app(IncidentService::class)->applyTechnicalRecovery($incident, 'ok');

        $this->assertSame(0, TrackingRecord::query()->count());
        $this->assertSame(0, TrackingUpdate::query()->count());
        $this->assertNotNull($incident->fresh()->recovered_at);
    }
}
