<?php

namespace Tests\Feature\History;

use App\Domain\Incidents\Services\IncidentHistoryService;
use App\Enums\CidStatus;
use App\Enums\FollowupStatus;
use App\Enums\MineduReason;
use App\Enums\MonitoringStatus;
use App\Models\Incident;
use App\Models\NetworkAssignment;
use App\Models\School;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SchoolHistoryCategoryFilterTest extends TestCase
{
    use RefreshDatabase;

    public function test_caidas_normales_lists_incidents_with_null_minedu_reason(): void
    {
        [$school, $assignment] = $this->seedSchool();
        $incident = $this->makeIncident($school, $assignment, [
            'root_cause_code' => 'LE07',
            'followup_status' => FollowupStatus::Cerrado,
            'recovered_at' => now()->subHour(),
            'current_status' => MonitoringStatus::Operativo->value,
        ]);

        $history = app(IncidentHistoryService::class);
        $overview = $history->schoolOverview($school);
        $this->assertSame(1, $overview['statistics']['por_categoria']['caidas_normales']);

        $page = $history->schoolIncidents($school, [
            'category' => 'caidas_normales',
            'per_page' => 25,
        ]);
        $this->assertSame(1, $page->total());
        $this->assertSame($incident->id, $page->items()[0]['id']);
    }

    public function test_averias_and_requerimientos_do_not_leak_into_caidas_normales(): void
    {
        [$school, $assignment] = $this->seedSchool();
        $this->makeIncident($school, $assignment, [
            'is_grave_incident' => true,
            'minedu_reason' => MineduReason::CaidaEnlace,
            'followup_status' => FollowupStatus::EnGestion,
        ]);
        $this->makeIncident($school, $assignment, [
            'is_requirement_case' => true,
            'minedu_reason' => MineduReason::Requerimiento,
            'followup_status' => FollowupStatus::EnGestion,
        ]);
        $normal = $this->makeIncident($school, $assignment, [
            'followup_status' => FollowupStatus::PendienteContacto,
        ]);

        $page = app(IncidentHistoryService::class)->schoolIncidents($school, [
            'category' => 'caidas_normales',
            'per_page' => 25,
        ]);
        $this->assertSame(1, $page->total());
        $this->assertSame($normal->id, $page->items()[0]['id']);
    }

    /**
     * @return array{0: School, 1: NetworkAssignment}
     */
    private function seedSchool(): array
    {
        $school = School::query()->create([
            'codigo_local' => '399175',
            'local_educativo' => 'COLEGIO HISTORIAL FILTER',
            'current_sequence' => 75,
            'active' => true,
        ]);
        $assignment = NetworkAssignment::query()->create([
            'school_id' => $school->id,
            'cid' => '258438',
            'cid_status' => CidStatus::Valid,
            'monitoring_eligible' => true,
            'is_active' => true,
        ]);

        return [$school, $assignment];
    }

    /**
     * @param  array<string, mixed>  $overrides
     */
    private function makeIncident(School $school, NetworkAssignment $assignment, array $overrides = []): Incident
    {
        return Incident::query()->create(array_merge([
            'school_id' => $school->id,
            'network_assignment_id' => $assignment->id,
            'detection_source' => 'REALTIME_SYNC',
            'started_at' => now()->subHours(3),
            'recovered_at' => null,
            'current_status' => MonitoringStatus::Caido->value,
            'followup_status' => FollowupStatus::PendienteContacto,
            'is_grave_incident' => false,
            'is_requirement_case' => false,
            'minedu_reason' => null,
        ], $overrides));
    }
}
