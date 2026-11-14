<?php

namespace Tests\Feature\Incidents;

use App\Domain\Incidents\Services\IncidentService;
use App\Enums\CidStatus;
use App\Enums\FollowupStatus;
use App\Enums\MonitoringStatus;
use App\Models\Incident;
use App\Models\IncidentUpdate;
use App\Models\NetworkAssignment;
use App\Models\PrtgSensor;
use App\Models\School;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class RequirementParallelOutageTest extends TestCase
{
    use RefreshDatabase;

    public function test_open_requirement_already_recovered_does_not_absorb_new_prtg_outage(): void
    {
        [$assignment, $sensor, $requirement] = $this->seedRequirement(
            recoveredAt: now()->subHour(),
            currentStatus: MonitoringStatus::Operativo->value,
        );

        $sensor->update(['normalized_status' => MonitoringStatus::Caido, 'status_raw' => '5']);
        $fresh = app(IncidentService::class)->ensureOpen($assignment, $sensor->fresh());

        $this->assertNotSame($requirement->id, $fresh->id);
        $this->assertNull($fresh->recovered_at);
        $this->assertFalse((bool) $fresh->is_requirement_case);
        $this->assertTrue($requirement->fresh()->isOpenRequirement());
        $this->assertNotNull($requirement->fresh()->recovered_at);
    }

    public function test_continuous_requirement_outage_stays_as_same_ticket(): void
    {
        // Caídas antiguas marcadas como requerimiento (sin recuperación PRTG): no partir.
        [$assignment, $sensor, $requirement] = $this->seedRequirement(
            recoveredAt: null,
            currentStatus: MonitoringStatus::Caido->value,
        );

        $sensor->update(['normalized_status' => MonitoringStatus::Caido, 'status_raw' => '5']);
        $fresh = app(IncidentService::class)->ensureOpen($assignment, $sensor->fresh());

        $this->assertSame($requirement->id, $fresh->id);
        $this->assertNull($fresh->recovered_at);
        $this->assertTrue($fresh->isOpenRequirement());
    }

    public function test_requirement_with_prior_recovery_is_parked_and_new_ticket_opens(): void
    {
        // Caso CID 258636: hubo recuperación y luego re-caída pegada al requerimiento.
        [$assignment, $sensor, $requirement] = $this->seedRequirement(
            recoveredAt: null,
            currentStatus: MonitoringStatus::Caido->value,
            withRecoveryUpdate: true,
        );

        $sensor->update(['normalized_status' => MonitoringStatus::Caido, 'status_raw' => '5']);
        $fresh = app(IncidentService::class)->ensureOpen($assignment, $sensor->fresh());

        $requirement = $requirement->fresh();
        $this->assertNotSame($requirement->id, $fresh->id);
        $this->assertTrue($requirement->isOpenRequirement());
        $this->assertNotNull($requirement->recovered_at);
        $this->assertNull($fresh->recovered_at);
        $this->assertFalse((bool) $fresh->is_requirement_case);
        $this->assertSame(FollowupStatus::PendienteContacto, $fresh->followup_status);
    }

    /**
     * @return array{0: NetworkAssignment, 1: PrtgSensor, 2: Incident}
     */
    private function seedRequirement(
        ?\DateTimeInterface $recoveredAt,
        string $currentStatus,
        bool $withRecoveryUpdate = false,
    ): array {
        $school = School::query()->create([
            'codigo_local' => '392100',
            'local_educativo' => 'COLEGIO REQ PASSWORD',
            'provincia' => 'MAYNAS',
            'distrito' => 'IQUITOS',
            'active' => true,
        ]);

        $assignment = NetworkAssignment::query()->create([
            'school_id' => $school->id,
            'cid' => '259100',
            'cid_status' => CidStatus::Valid,
            'monitoring_eligible' => true,
            'is_active' => true,
        ]);

        $sensor = PrtgSensor::query()->create([
            'network_assignment_id' => $assignment->id,
            'prtg_sensor_id' => '99100',
            'prtg_device_id' => '89100',
            'name' => 'Ping',
            'sensor_role' => 'PING',
            'device_name' => 'CID259100_TEST',
            'normalized_status' => MonitoringStatus::Operativo,
            'status_raw' => '3',
            'last_synced_at' => now(),
        ]);

        $requirement = Incident::query()->create([
            'school_id' => $school->id,
            'network_assignment_id' => $assignment->id,
            'prtg_sensor_id' => $sensor->id,
            'detection_source' => 'REALTIME_SYNC',
            'started_at' => now()->subHours(6),
            'recovered_at' => $recoveredAt,
            'current_status' => $currentStatus,
            'followup_status' => FollowupStatus::EnGestion,
            'is_requirement_case' => true,
            'requirement_opened_at' => now()->subHours(5),
            'requirement_closed_at' => null,
        ]);

        if ($withRecoveryUpdate) {
            IncidentUpdate::query()->create([
                'incident_id' => $requirement->id,
                'type' => 'SYSTEM',
                'status_before' => FollowupStatus::EnGestion->value,
                'status_after' => FollowupStatus::EnGestion->value,
                'observation' => 'PRTG reportó recuperación (Ping OPERATIVO). Requerimiento permanece abierto (cierre manual).',
                'created_at' => now()->subHours(2),
            ]);
        }

        return [$assignment, $sensor, $requirement];
    }
}
