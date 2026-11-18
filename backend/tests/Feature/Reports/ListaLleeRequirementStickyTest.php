<?php

namespace Tests\Feature\Reports;

use App\Domain\Reports\Services\ListaLleeDayService;
use App\Enums\CidStatus;
use App\Enums\FollowupStatus;
use App\Enums\ListaLleeEstado;
use App\Enums\ManagementClassification;
use App\Enums\MineduReason;
use App\Enums\MonitoringStatus;
use App\Models\Incident;
use App\Models\NetworkAssignment;
use App\Models\PrtgSensor;
use App\Models\School;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ListaLleeRequirementStickyTest extends TestCase
{
    use RefreshDatabase;

    public function test_open_requirement_appears_on_lista_even_when_prtg_recovered(): void
    {
        $school = School::query()->create([
            'codigo_local' => '399057',
            'local_educativo' => 'REQ STICKY LISTA',
            'current_sequence' => 57,
            'active' => true,
        ]);
        $assignment = NetworkAssignment::query()->create([
            'school_id' => $school->id,
            'cid' => '258420',
            'cid_status' => CidStatus::Valid,
            'monitoring_eligible' => true,
            'is_active' => true,
        ]);
        $sensor = PrtgSensor::query()->create([
            'network_assignment_id' => $assignment->id,
            'prtg_sensor_id' => '9057',
            'name' => 'Ping',
            'device_name' => 'CID258420',
            'normalized_status' => MonitoringStatus::Operativo,
            'status_raw' => 3,
            'last_synced_at' => now(),
        ]);

        $req = Incident::query()->create([
            'school_id' => $school->id,
            'network_assignment_id' => $assignment->id,
            'prtg_sensor_id' => $sensor->id,
            'detection_source' => 'REALTIME_SYNC',
            'started_at' => now()->subDays(1),
            'recovered_at' => now()->subHours(2),
            'current_status' => MonitoringStatus::Operativo->value,
            'followup_status' => FollowupStatus::PendienteContacto,
            'management_classification' => ManagementClassification::LinkOutage,
            'minedu_reason' => MineduReason::Requerimiento,
            'is_requirement_case' => true,
            'requirement_opened_at' => now()->subDays(1),
            'requirement_closed_at' => null,
            'lista_llee_estado' => ListaLleeEstado::Requerimiento,
        ]);

        $lista = app(ListaLleeDayService::class);
        $payload = $lista->reportForDate($lista->todayDate());
        $row = collect($payload['rows'])->firstWhere('cid', '258420');

        $this->assertNotNull($row);
        $this->assertSame($req->id, $row['incident_id']);
        $this->assertSame(ListaLleeEstado::Requerimiento->value, $row['lista_estado']);
    }

    public function test_open_requirement_wins_dedupe_over_parallel_unrecovered_outage(): void
    {
        $school = School::query()->create([
            'codigo_local' => '399287',
            'local_educativo' => 'REQ DEDUPE LISTA',
            'current_sequence' => 287,
            'active' => true,
        ]);
        $assignment = NetworkAssignment::query()->create([
            'school_id' => $school->id,
            'cid' => '258650',
            'cid_status' => CidStatus::Valid,
            'monitoring_eligible' => true,
            'is_active' => true,
        ]);
        $sensor = PrtgSensor::query()->create([
            'network_assignment_id' => $assignment->id,
            'prtg_sensor_id' => '9287',
            'name' => 'Ping',
            'device_name' => 'CID258650',
            'normalized_status' => MonitoringStatus::Caido,
            'status_raw' => 5,
            'last_synced_at' => now(),
        ]);

        $req = Incident::query()->create([
            'school_id' => $school->id,
            'network_assignment_id' => $assignment->id,
            'prtg_sensor_id' => $sensor->id,
            'detection_source' => 'REALTIME_SYNC',
            'started_at' => now()->subDays(1),
            'recovered_at' => now()->subHours(5),
            'current_status' => MonitoringStatus::Operativo->value,
            'followup_status' => FollowupStatus::EnEspera,
            'management_classification' => ManagementClassification::LinkOutage,
            'minedu_reason' => MineduReason::Requerimiento,
            'is_requirement_case' => true,
            'requirement_opened_at' => now()->subDays(1),
            'requirement_closed_at' => null,
            'lista_llee_estado' => ListaLleeEstado::Requerimiento,
        ]);

        Incident::query()->create([
            'school_id' => $school->id,
            'network_assignment_id' => $assignment->id,
            'prtg_sensor_id' => $sensor->id,
            'detection_source' => 'REALTIME_SYNC',
            'started_at' => now()->subHour(),
            'recovered_at' => null,
            'current_status' => MonitoringStatus::Caido->value,
            'followup_status' => FollowupStatus::PendienteContacto,
            'management_classification' => ManagementClassification::NewOutage,
            'lista_llee_estado' => null,
        ]);

        $lista = app(ListaLleeDayService::class);
        $payload = $lista->reportForDate($lista->todayDate());
        $row = collect($payload['rows'])->firstWhere('cid', '258650');

        $this->assertNotNull($row);
        $this->assertSame($req->id, $row['incident_id']);
        $this->assertSame(ListaLleeEstado::Requerimiento->value, $row['lista_estado']);
    }
}
