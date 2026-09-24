<?php

namespace Tests\Feature\Reports;

use App\Enums\CidStatus;
use App\Enums\FollowupStatus;
use App\Enums\ManagementClassification;
use App\Enums\MonitoringStatus;
use App\Models\Incident;
use App\Models\NetworkAssignment;
use App\Models\PrtgSensor;
use App\Models\School;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class OperationalReportColumnsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->actingAsUser();
    }

    private function seedActive(string $tech = 'GPON', ?ManagementClassification $classification = null): Incident
    {
        $school = School::query()->create([
            'codigo_local' => '387025',
            'local_educativo' => '601014',
            'provincia' => 'MARISCAL RAMON CASTILLA',
            'distrito' => 'SAN PABLO',
            'current_sequence' => 269,
            'active' => true,
        ]);

        $assignment = NetworkAssignment::query()->create([
            'school_id' => $school->id,
            'cid' => '258632',
            'cid_status' => CidStatus::Valid,
            'monitoring_eligible' => true,
            'prtg_device_name' => 'CID258632_601014_LORETO_MARISCAL_RAMON_CASTILLA_SAN_PABLO',
            'tecnologia_acceso' => $tech,
            'is_active' => true,
        ]);

        $sensor = PrtgSensor::query()->create([
            'network_assignment_id' => $assignment->id,
            'prtg_sensor_id' => '9911',
            'name' => 'Ping',
            'device_name' => 'CID258632_601014_LORETO_MARISCAL_RAMON_CASTILLA_SAN_PABLO',
            'normalized_status' => MonitoringStatus::Caido,
            'status_raw' => 5,
            'last_synced_at' => now(),
        ]);

        $started = Carbon::parse('2026-09-21 12:12:41', 'America/Lima')->utc();

        return Incident::query()->create([
            'school_id' => $school->id,
            'network_assignment_id' => $assignment->id,
            'prtg_sensor_id' => $sensor->id,
            'started_at' => $started,
            'current_status' => MonitoringStatus::Caido->value,
            'followup_status' => FollowupStatus::EnGestion,
            'management_classification' => $classification ?? ManagementClassification::NewOutage,
            'outage_text' => 'caído 15/09 GPON',
            'detail_text' => 'REINICIO DEL UPS',
            'management_scope' => 'PINT',
        ]);
    }

    public function test_operational_row_uses_started_at_and_technology_type(): void
    {
        $this->seedActive('gpon');

        $response = $this->getJson('/api/reports/operational?active_only=1');
        $response->assertOk();
        $row = $response->json('rows.0');

        $this->assertSame(269, $row['n']);
        $this->assertSame('258632', $row['cid']);
        $this->assertSame('GPON', $row['tipo']);
        $this->assertSame('GPON', $row['technology_type']);
        $this->assertSame('21/09/2026 12:12', $row['caida']);
        $this->assertSame('started_at', $row['caida_source']);
        $this->assertSame('REINICIO DEL UPS', $row['detalle']);
        $this->assertSame('MARISCAL RAMON CASTILLA', $row['provincia']);
        $this->assertSame('SAN PABLO', $row['distrito']);
        $this->assertSame('387025', $row['codigo_local']);
        $this->assertStringContainsString('CID258632', (string) $row['presentacion_nombre_prtg']);
    }

    public function test_closing_preview_has_same_official_columns_including_tipo(): void
    {
        $incident = $this->seedActive('P2P', ManagementClassification::ContactConfirmed);

        $preview = $this->getJson('/api/reports/closing-preview');
        $preview->assertOk();
        $this->assertSame(1, $preview->json('total'));
        $row = $preview->json('rows.0');

        $this->assertSame($incident->id, $row['incident_id']);
        $this->assertSame('P2P', $row['tipo']);
        $this->assertArrayHasKey('presentacion_nombre_prtg', $row);
        $this->assertArrayHasKey('detalle', $row);
        $this->assertArrayHasKey('provincia', $row);
        $this->assertArrayHasKey('distrito', $row);
        $this->assertArrayHasKey('codigo_local', $row);
        $this->assertSame('21/09/2026 12:12', $row['caida']);
        $this->assertContains('TIPO', $preview->json('columns'));
    }

    public function test_technology_filter_is_server_side(): void
    {
        $this->seedActive('GPON', ManagementClassification::ContactConfirmed);

        $school = School::query()->create([
            'codigo_local' => '111',
            'local_educativo' => 'OTHER',
            'provincia' => 'MAYNAS',
            'distrito' => 'IQUITOS',
            'active' => true,
        ]);
        $assignment = NetworkAssignment::query()->create([
            'school_id' => $school->id,
            'cid' => '100001',
            'cid_status' => CidStatus::Valid,
            'tecnologia_acceso' => 'P2P',
            'is_active' => true,
            'monitoring_eligible' => true,
        ]);
        Incident::query()->create([
            'school_id' => $school->id,
            'network_assignment_id' => $assignment->id,
            'started_at' => now()->subHour(),
            'current_status' => MonitoringStatus::Caido->value,
            'followup_status' => FollowupStatus::PendienteContacto,
            'management_classification' => ManagementClassification::NewOutage,
        ]);

        $gpon = $this->getJson('/api/reports/operational?technology=GPON&active_only=1');
        $gpon->assertOk();
        $this->assertSame(1, $gpon->json('total'));
        $this->assertSame('GPON', $gpon->json('rows.0.tipo'));
    }
}
