<?php

namespace Tests\Feature\Incidents;

use App\Enums\AffectedWanNode;
use App\Enums\CidStatus;
use App\Enums\FollowupStatus;
use App\Enums\ManagementClassification;
use App\Enums\MonitoringStatus;
use App\Models\Incident;
use App\Models\NetworkAssignment;
use App\Models\PrtgSensor;
use App\Models\School;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ManualPartialOutageTest extends TestCase
{
    use RefreshDatabase;

    public function test_creates_manual_partial_and_survives_close_operative(): void
    {
        $this->actingAsUser();

        $school = School::query()->create([
            'codigo_local' => '391900',
            'local_educativo' => 'COLEGIO DOBLE WAN',
            'provincia' => 'MAYNAS',
            'distrito' => 'IQUITOS',
            'active' => true,
        ]);

        $assignment = NetworkAssignment::query()->create([
            'school_id' => $school->id,
            'cid' => '259001',
            'cid_status' => CidStatus::Valid,
            'monitoring_eligible' => true,
            'is_active' => true,
            'nodo_acceso_a' => 'NA-A',
            'nodo_acceso_b' => 'NA-B',
            'ip_wan_principal' => '10.1.1.1',
            'ip_wan_secundaria' => '10.1.1.2',
            'prtg_device_name' => 'CID259001_TEST',
        ]);

        $sensor = PrtgSensor::query()->create([
            'network_assignment_id' => $assignment->id,
            'prtg_sensor_id' => '91001',
            'prtg_device_id' => '81001',
            'name' => 'Ping',
            'device_name' => 'CID259001_TEST',
            'normalized_status' => MonitoringStatus::Operativo,
            'status_raw' => '3',
            'last_synced_at' => now(),
        ]);

        $response = $this->postJson('/api/incidents/manual-partial', [
            'school_id' => $school->id,
            'affected_wan_node' => AffectedWanNode::Principal->value,
            'classification' => ManagementClassification::LinkOutage->value,
            'detail' => 'Caída NA principal',
        ]);

        $response->assertOk();
        $incidentId = (int) $response->json('estado.n_incidencia');
        $this->assertGreaterThan(0, $incidentId);
        $this->assertNotNull($response->json('tracking_sync.tracking_id'));

        $incident = Incident::query()->findOrFail($incidentId);
        $this->assertTrue($incident->isManualPartial());
        $this->assertSame(AffectedWanNode::Principal, $incident->affected_wan_node);
        $this->assertSame(ManagementClassification::LinkOutage, $incident->management_classification);
        $this->assertSame(FollowupStatus::EnEspera, $incident->followup_status);
        $this->assertNull($incident->recovered_at);

        // Safety-net PRTG no debe cerrar la parcial aunque Ping esté OPERATIVO.
        $closed = app(\App\Domain\Incidents\Services\IncidentService::class)->closeOperativeIncidents();
        $this->assertSame(0, $closed);
        $this->assertNull($incident->fresh()->recovered_at);

        // Escalada: Ping CAÍDO convierte a incidencia total.
        $sensor->update(['normalized_status' => MonitoringStatus::Caido]);
        app(\App\Domain\Incidents\Services\IncidentService::class)->ensureOpen($assignment, $sensor->fresh());
        $escalated = $incident->fresh();
        $this->assertFalse($escalated->isManualPartial());
        $this->assertNull($escalated->affected_wan_node);
        $this->assertSame(MonitoringStatus::Caido->value, $escalated->current_status);
    }

    public function test_rejects_when_ping_already_down(): void
    {
        $this->actingAsUser();

        $school = School::query()->create([
            'codigo_local' => '391901',
            'local_educativo' => 'COLEGIO YA CAIDO',
            'active' => true,
        ]);
        $assignment = NetworkAssignment::query()->create([
            'school_id' => $school->id,
            'cid' => '259002',
            'cid_status' => CidStatus::Valid,
            'monitoring_eligible' => true,
            'is_active' => true,
        ]);
        PrtgSensor::query()->create([
            'network_assignment_id' => $assignment->id,
            'prtg_sensor_id' => '91002',
            'prtg_device_id' => '81002',
            'name' => 'Ping',
            'normalized_status' => MonitoringStatus::Caido,
            'status_raw' => '5',
            'last_synced_at' => now(),
        ]);

        $this->postJson('/api/incidents/manual-partial', [
            'school_id' => $school->id,
            'affected_wan_node' => AffectedWanNode::Secundario->value,
            'classification' => ManagementClassification::NoResponse->value,
        ])->assertStatus(422);
    }
}
