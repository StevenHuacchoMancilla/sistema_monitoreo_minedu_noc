<?php

namespace Tests\Feature\Incidents;

use App\Enums\CidStatus;
use App\Enums\FollowupStatus;
use App\Enums\ManagementClassification;
use App\Enums\MonitoringStatus;
use App\Models\Incident;
use App\Models\NetworkAssignment;
use App\Models\PrtgSensor;
use App\Models\School;
use App\Models\SchoolContact;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class IncidentManagementWorkflowTest extends TestCase
{
    use RefreshDatabase;

    private int $seedSeq = 0;

    private function seedIncident(): Incident
    {
        $this->seedSeq++;
        $n = $this->seedSeq;

        $school = School::query()->create([
            'codigo_local' => (string) (364550 + $n),
            'local_educativo' => "COLEGIO TEST {$n}",
            'provincia' => 'MAYNAS',
            'distrito' => 'IQUITOS',
            'current_sequence' => 10 + $n,
            'active' => true,
        ]);

        $assignment = NetworkAssignment::query()->create([
            'school_id' => $school->id,
            'cid' => (string) (258400 + $n),
            'cid_status' => CidStatus::Valid,
            'monitoring_eligible' => true,
            'prtg_device_name' => "CID25840{$n}_TEST_LORETO_MAYNAS_IQUITOS",
            'is_active' => true,
        ]);

        $sensor = PrtgSensor::query()->create([
            'network_assignment_id' => $assignment->id,
            'prtg_sensor_id' => (string) (9000 + $n),
            'prtg_device_id' => (string) (8000 + $n),
            'name' => 'Ping',
            'device_name' => "CID25840{$n}_TEST_LORETO_MAYNAS_IQUITOS",
            'normalized_status' => MonitoringStatus::Caido,
            'status_raw' => '5',
            'last_synced_at' => now(),
        ]);

        SchoolContact::query()->create([
            'school_id' => $school->id,
            'position' => 1,
            'name' => 'Docente Test',
            'role' => 'Docente',
            'phone' => '999111222',
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

    public function test_new_outage_becomes_contact_confirmed_and_appears_in_closing(): void
    {
        $incident = $this->seedIncident();
        $contactId = SchoolContact::query()->where('school_id', $incident->school_id)->value('id');

        $response = $this->postJson("/api/incidents/{$incident->id}/managements", [
            'classification' => ManagementClassification::ContactConfirmed->value,
            'scope' => 'PEXT',
            'outage_text' => 'caído 11/09 p2p',
            'detail' => 'Equipos encendidos / sin internet',
            'contact_id' => $contactId,
        ]);

        $response->assertOk();
        $incident->refresh();

        $this->assertSame(ManagementClassification::ContactConfirmed, $incident->management_classification);
        $this->assertSame(FollowupStatus::EnGestion, $incident->followup_status);
        $this->assertSame('Equipos encendidos / sin internet', $incident->detail_text);
        $this->assertDatabaseCount('incident_managements', 1);

        $closing = $this->getJson('/api/reports/closing-preview');
        $closing->assertOk();
        $this->assertSame(1, $closing->json('total'));
    }

    public function test_no_response_and_complaint_are_excluded_from_closing(): void
    {
        $a = $this->seedIncident();
        $this->postJson("/api/incidents/{$a->id}/managements", [
            'classification' => ManagementClassification::NoResponse->value,
            'outage_text' => 'sin respuesta',
            'detail' => 'SIN RESPUESTA',
        ])->assertOk();

        $b = $this->seedIncident();
        $this->postJson("/api/incidents/{$b->id}/managements", [
            'classification' => ManagementClassification::Complaint->value,
            'outage_text' => 'queja',
            'detail' => 'internet lento',
        ])->assertOk();

        $closing = $this->getJson('/api/reports/closing-preview');
        $closing->assertOk();
        $this->assertSame(0, $closing->json('total'));
    }

    public function test_recovered_contact_confirmed_excluded_from_closing(): void
    {
        $incident = $this->seedIncident();
        $this->postJson("/api/incidents/{$incident->id}/managements", [
            'classification' => ManagementClassification::ContactConfirmed->value,
            'outage_text' => 'caído',
            'detail' => 'confirmado',
            'scope' => 'PINT',
        ])->assertOk();

        $incident->update(['recovered_at' => now(), 'followup_status' => FollowupStatus::Recuperado]);

        $closing = $this->getJson('/api/reports/closing-preview');
        $closing->assertOk();
        $this->assertSame(0, $closing->json('total'));
        $this->assertDatabaseCount('incident_managements', 1);
    }

    public function test_classification_can_evolve_no_response_to_confirmed(): void
    {
        $incident = $this->seedIncident();

        $this->postJson("/api/incidents/{$incident->id}/managements", [
            'classification' => ManagementClassification::NoResponse->value,
            'outage_text' => 'sin respuesta',
            'detail' => 'SIN RESPUESTA',
        ])->assertOk();

        $this->postJson("/api/incidents/{$incident->id}/managements", [
            'classification' => ManagementClassification::ContactConfirmed->value,
            'outage_text' => 'caído 11/09 p2p',
            'detail' => 'Equipos encendidos',
            'scope' => 'PEXT',
        ])->assertOk();

        $incident->refresh();
        $this->assertSame(ManagementClassification::ContactConfirmed, $incident->management_classification);
        $this->assertDatabaseCount('incident_managements', 2);
    }
}
