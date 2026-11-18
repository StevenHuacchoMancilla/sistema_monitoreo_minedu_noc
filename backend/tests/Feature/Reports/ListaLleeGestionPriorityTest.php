<?php

namespace Tests\Feature\Reports;

use App\Domain\Reports\Services\ListaLleeDayService;
use App\Enums\CidStatus;
use App\Enums\FollowupStatus;
use App\Enums\ListaLleeEstado;
use App\Enums\ManagementClassification;
use App\Enums\MonitoringStatus;
use App\Models\Incident;
use App\Models\ListaLleeDay;
use App\Models\ListaLleeDayRow;
use App\Models\NetworkAssignment;
use App\Models\School;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ListaLleeGestionPriorityTest extends TestCase
{
    use RefreshDatabase;

    public function test_gestion_estado_on_active_outage_wins_over_manual_recovered_row(): void
    {
        [$school, $assignment] = $this->seedSchool();
        $lista = app(ListaLleeDayService::class);
        $today = $lista->todayDate();

        $recovered = Incident::query()->create([
            'school_id' => $school->id,
            'network_assignment_id' => $assignment->id,
            'detection_source' => 'REALTIME_SYNC',
            'started_at' => now()->subHours(5),
            'recovered_at' => now()->subHour(),
            'current_status' => MonitoringStatus::Operativo->value,
            'followup_status' => FollowupStatus::PendienteCierre,
            'management_classification' => ManagementClassification::NewOutage,
            'lista_llee_estado' => ListaLleeEstado::DescartesEnCurso,
        ]);

        $active = Incident::query()->create([
            'school_id' => $school->id,
            'network_assignment_id' => $assignment->id,
            'detection_source' => 'REALTIME_SYNC',
            'started_at' => now()->subMinutes(40),
            'recovered_at' => null,
            'current_status' => MonitoringStatus::Caido->value,
            'followup_status' => FollowupStatus::EnGestion,
            'management_classification' => ManagementClassification::FollowUp,
            'lista_llee_estado' => ListaLleeEstado::SinRespuesta,
        ]);

        $day = ListaLleeDay::query()->create([
            'report_date' => $today,
        ]);
        ListaLleeDayRow::query()->create([
            'lista_llee_day_id' => $day->id,
            'incident_id' => $recovered->id,
            'tss' => 210,
            'cid' => '258573',
            'local_educativo' => $school->local_educativo,
            'lista_estado' => ListaLleeEstado::DescartesEnCurso,
            'estado_prtg' => '✖',
        ]);

        $payload = $lista->reportForDate($today);
        $row = collect($payload['rows'])->firstWhere('cid', '258573');

        $this->assertNotNull($row);
        $this->assertSame($active->id, $row['incident_id']);
        $this->assertSame(ListaLleeEstado::SinRespuesta->value, $row['lista_estado']);
    }

    public function test_manual_day_estado_kept_when_incident_has_no_lista_option(): void
    {
        [$school, $assignment] = $this->seedSchool('258599', 211);
        $lista = app(ListaLleeDayService::class);
        $today = $lista->todayDate();

        $active = Incident::query()->create([
            'school_id' => $school->id,
            'network_assignment_id' => $assignment->id,
            'detection_source' => 'REALTIME_SYNC',
            'started_at' => now()->subHour(),
            'recovered_at' => null,
            'current_status' => MonitoringStatus::Caido->value,
            'followup_status' => FollowupStatus::EnGestion,
            'management_classification' => ManagementClassification::NewOutage,
            'lista_llee_estado' => null,
        ]);

        $day = ListaLleeDay::query()->create([
            'report_date' => $today,
        ]);
        ListaLleeDayRow::query()->create([
            'lista_llee_day_id' => $day->id,
            'incident_id' => $active->id,
            'tss' => 211,
            'cid' => '258599',
            'local_educativo' => $school->local_educativo,
            'lista_estado' => ListaLleeEstado::DescartesEnCurso,
            'estado_prtg' => '✖',
        ]);

        $payload = $lista->reportForDate($today);
        $row = collect($payload['rows'])->firstWhere('cid', '258599');

        $this->assertNotNull($row);
        $this->assertSame(ListaLleeEstado::DescartesEnCurso->value, $row['lista_estado']);
    }

    public function test_export_keeps_only_prtg_down_except_averias(): void
    {
        $lista = app(ListaLleeDayService::class);
        $dayDate = '2026-11-10';
        $day = ListaLleeDay::query()->create(['report_date' => $dayDate]);

        $cases = [
            ['cid' => '258701', 'tss' => 701, 'estado' => ListaLleeEstado::EquiposApagados, 'up' => true, 'keep' => false],
            ['cid' => '258702', 'tss' => 702, 'estado' => ListaLleeEstado::EquiposApagados, 'up' => false, 'keep' => true],
            ['cid' => '258703', 'tss' => 703, 'estado' => ListaLleeEstado::Averias, 'up' => true, 'keep' => true],
            ['cid' => '258704', 'tss' => 704, 'estado' => ListaLleeEstado::Averias, 'up' => false, 'keep' => true],
            ['cid' => '258705', 'tss' => 705, 'estado' => ListaLleeEstado::Activo, 'up' => true, 'keep' => false],
        ];

        foreach ($cases as $case) {
            [$school, $assignment] = $this->seedSchool($case['cid'], $case['tss']);
            $sensor = \App\Models\PrtgSensor::query()->create([
                'network_assignment_id' => $assignment->id,
                'prtg_sensor_id' => (string) (9000 + $case['tss']),
                'name' => 'Ping',
                'device_name' => 'CID'.$case['cid'],
                'normalized_status' => $case['up']
                    ? MonitoringStatus::Operativo
                    : MonitoringStatus::Caido,
                'status_raw' => $case['up'] ? 3 : 5,
                'last_synced_at' => now(),
            ]);

            $incident = Incident::query()->create([
                'school_id' => $school->id,
                'network_assignment_id' => $assignment->id,
                'prtg_sensor_id' => $sensor->id,
                'detection_source' => 'REALTIME_SYNC',
                'started_at' => now()->subHours(2),
                'recovered_at' => $case['up'] ? now()->subHour() : null,
                'current_status' => $case['up']
                    ? MonitoringStatus::Operativo->value
                    : MonitoringStatus::Caido->value,
                'followup_status' => FollowupStatus::EnGestion,
                'management_classification' => ManagementClassification::NewOutage,
                'lista_llee_estado' => $case['estado'],
                'is_grave_incident' => $case['estado'] === ListaLleeEstado::Averias,
            ]);

            ListaLleeDayRow::query()->create([
                'lista_llee_day_id' => $day->id,
                'incident_id' => $incident->id,
                'tss' => $case['tss'],
                'cid' => $case['cid'],
                'local_educativo' => $school->local_educativo,
                'lista_estado' => $case['estado'],
                'estado_prtg' => $case['up'] ? '✔' : '✖',
            ]);
        }

        $export = collect($lista->exportRowsForDate($dayDate));
        $cids = $export->pluck('cid')->all();

        foreach ($cases as $case) {
            if ($case['keep']) {
                $this->assertContains($case['cid'], $cids, $case['cid'].' debería salir en el informe');
            } else {
                $this->assertNotContains($case['cid'], $cids, $case['cid'].' no debería salir en el informe');
            }
        }
    }

    /**
     * @return array{0: School, 1: NetworkAssignment}
     */
    private function seedSchool(string $cid = '258573', int $tss = 210): array
    {
        $school = School::query()->create([
            'codigo_local' => '399'.$tss,
            'local_educativo' => 'COLEGIO LISTA '.$tss,
            'current_sequence' => $tss,
            'active' => true,
        ]);
        $assignment = NetworkAssignment::query()->create([
            'school_id' => $school->id,
            'cid' => $cid,
            'cid_status' => CidStatus::Valid,
            'monitoring_eligible' => true,
            'is_active' => true,
        ]);

        return [$school, $assignment];
    }
}
