<?php

namespace Tests\Feature\Incidents;

use App\Domain\Incidents\Services\IncidentService;
use App\Domain\Incidents\Services\RecoveryReviewService;
use App\Enums\CidStatus;
use App\Enums\FollowupStatus;
use App\Enums\ManagementClassification;
use App\Enums\MonitoringStatus;
use App\Enums\RecoveryReviewStatus;
use App\Models\Incident;
use App\Models\NetworkAssignment;
use App\Models\PrtgSensor;
use App\Models\School;
use App\Support\OperationalTime;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

class KeepManagingStickyWorkflowTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->actingAsUser();
        $this->freezeLima('2026-11-09 10:00:00');
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function freezeLima(string $wallClock): void
    {
        $now = Carbon::parse($wallClock, OperationalTime::tz())->setTimezone(OperationalTime::storageTz());
        Carbon::setTestNow($now);
    }

    /**
     * @return array{0: Incident, 1: NetworkAssignment, 2: PrtgSensor}
     */
    private function seedManagingDown(): array
    {
        $school = School::query()->create([
            'codigo_local' => '364487',
            'local_educativo' => 'NUESTRA SENORA DE LORETO',
            'provincia' => 'LORETO',
            'distrito' => 'NAUTA',
            'current_sequence' => 487,
            'active' => true,
        ]);

        $assignment = NetworkAssignment::query()->create([
            'school_id' => $school->id,
            'cid' => '258850',
            'cid_status' => CidStatus::Valid,
            'monitoring_eligible' => true,
            'is_active' => true,
        ]);

        $sensor = PrtgSensor::query()->create([
            'network_assignment_id' => $assignment->id,
            'prtg_sensor_id' => '9487',
            'prtg_device_id' => '8487',
            'name' => 'Ping',
            'sensor_role' => 'PING',
            'device_name' => 'CID258850_TEST',
            'normalized_status' => MonitoringStatus::Caido,
            'status_raw' => '5',
            'last_synced_at' => now(),
        ]);

        $incident = Incident::query()->create([
            'school_id' => $school->id,
            'network_assignment_id' => $assignment->id,
            'prtg_sensor_id' => $sensor->id,
            'started_at' => now()->subHours(2),
            'prtg_down_started_at' => now()->subHours(2),
            'current_status' => MonitoringStatus::Caido->value,
            'followup_status' => FollowupStatus::EnGestion,
            'management_classification' => ManagementClassification::ContactConfirmed,
        ]);

        return [$incident, $assignment, $sensor];
    }

    public function test_keep_managing_survives_recover_and_refall_same_ticket(): void
    {
        [$incident, $assignment, $sensor] = $this->seedManagingDown();
        $svc = app(IncidentService::class);
        $user = $this->actingAsUser();

        $svc->applyTechnicalRecovery($incident->fresh(), 'PRTG UP', now());
        $incident->refresh();
        $this->assertSame(FollowupStatus::PendienteCierre, $incident->followup_status);

        app(RecoveryReviewService::class)->keepManaging($incident->fresh(), (int) $user->id, 'Seguir abierto');
        $incident->refresh();
        $this->assertTrue($incident->isKeptInManagement());
        $this->assertSame(RecoveryReviewStatus::ContinueMonitoring, $incident->recovery_review_status);
        $this->assertSame(FollowupStatus::EnGestion, $incident->followup_status);
        $this->assertNotNull($incident->recovered_at);

        $sensor->update(['normalized_status' => MonitoringStatus::Caido]);
        $this->freezeLima('2026-11-09 14:00:00');
        $reopened = $svc->ensureOpen($assignment, $sensor->fresh(), now());

        $this->assertSame($incident->id, $reopened->id);
        $this->assertNull($reopened->recovered_at);
        $this->assertTrue($reopened->isKeptInManagement());
        $this->assertSame(RecoveryReviewStatus::ContinueMonitoring, $reopened->recovery_review_status);
        $this->assertSame(1, Incident::query()->count());

        // Segunda recuperación: no debe ir a Pendiente de cierre ni perder CONTINUE_MONITORING.
        $sensor->update(['normalized_status' => MonitoringStatus::Operativo]);
        $this->freezeLima('2026-11-09 15:00:00');
        $svc->applyTechnicalRecovery($reopened->fresh(), 'PRTG UP otra vez', now());
        $reopened->refresh();

        $this->assertNotNull($reopened->recovered_at);
        $this->assertSame(FollowupStatus::EnGestion, $reopened->followup_status);
        $this->assertSame(RecoveryReviewStatus::ContinueMonitoring, $reopened->recovery_review_status);
        $this->assertTrue($reopened->isKeptInManagement());
        $this->assertNotSame(FollowupStatus::PendienteCierre, $reopened->followup_status);

        // Tercera caída: sigue el mismo caso (no nace Pendiente de gestión).
        $sensor->update(['normalized_status' => MonitoringStatus::Caido]);
        $this->freezeLima('2026-11-09 16:00:00');
        $again = $svc->ensureOpen($assignment, $sensor->fresh(), now());

        $this->assertSame($incident->id, $again->id);
        $this->assertSame(1, Incident::query()->count());
        $this->assertTrue($again->isKeptInManagement());
    }

    public function test_orphan_pendiente_is_absorbed_by_keep_managing_sticky(): void
    {
        [$sticky, $assignment, $sensor] = $this->seedManagingDown();
        $svc = app(IncidentService::class);
        $user = $this->actingAsUser();

        $svc->applyTechnicalRecovery($sticky->fresh(), 'PRTG UP', now());
        app(RecoveryReviewService::class)->keepManaging($sticky->fresh(), (int) $user->id);
        $sticky->refresh();
        $this->assertTrue($sticky->isKeptInManagement());

        // En prod el índice es parcial (solo unrecovered). En SQLite de tests a veces queda
        // sin WHERE; aflojamos el índice para simular la carrera real del caso 487.
        \Illuminate\Support\Facades\DB::statement('DROP INDEX IF EXISTS incidents_one_active_per_assignment_sensor');

        $orphan = Incident::query()->create([
            'school_id' => $sticky->school_id,
            'network_assignment_id' => $assignment->id,
            'prtg_sensor_id' => $sensor->id,
            'started_at' => now(),
            'prtg_down_started_at' => now(),
            'current_status' => MonitoringStatus::Caido->value,
            'followup_status' => FollowupStatus::PendienteContacto,
            'management_classification' => ManagementClassification::NewOutage,
            'recovered_at' => null,
        ]);

        $sensor->update(['normalized_status' => MonitoringStatus::Caido]);
        $this->freezeLima('2026-11-09 18:00:00');
        $result = $svc->ensureOpen($assignment, $sensor->fresh(), now());

        $this->assertSame($sticky->id, $result->id);
        $this->assertNull($result->recovered_at);
        $this->assertTrue($result->isKeptInManagement());

        $orphan->refresh();
        $this->assertSame(FollowupStatus::Cerrado, $orphan->followup_status);
        $this->assertSame(
            1,
            Incident::query()->whereNull('recovered_at')->where('followup_status', '!=', FollowupStatus::Cerrado->value)->count()
        );
    }
}
