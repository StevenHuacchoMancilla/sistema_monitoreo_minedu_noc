<?php

namespace Tests\Feature\Tracking;

use App\Domain\Incidents\Services\IncidentService;
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
use App\Models\TrackingRecord;
use App\Models\TrackingUpdate;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * FASE 14 — validación del flujo operativo multiusuario Tracking General.
 *
 * Cubre el checklist de aceptación:
 * operator abre · opened_by=auth · otro agrega update · PRTG no cierra ·
 * tercero cierra · doble cierre 409 · cerrado bloquea update · reopen + auditoría · viewer 403.
 */
class TrackingMultiactorWorkflowTest extends TestCase
{
    use RefreshDatabase;

    public function test_end_to_end_multiactor_tracking_lifecycle(): void
    {
        $school = School::query()->create([
            'codigo_local' => '364600',
            'local_educativo' => 'COLEGIO WORKFLOW',
            'current_sequence' => 200,
            'active' => true,
        ]);
        $assignment = NetworkAssignment::query()->create([
            'school_id' => $school->id,
            'cid' => '258600',
            'cid_status' => CidStatus::Valid,
            'is_active' => true,
            'monitoring_eligible' => true,
        ]);
        $sensor = PrtgSensor::query()->create([
            'network_assignment_id' => $assignment->id,
            'prtg_sensor_id' => '9600',
            'prtg_device_id' => '8600',
            'name' => 'Ping',
            'device_name' => 'CID258600_TEST',
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

        $opener = User::factory()->create([
            'name' => 'Elias',
            'role' => UserRole::NocOperator,
            'active' => true,
        ]);
        $follower = User::factory()->create([
            'name' => 'Luis',
            'role' => UserRole::NocOperator,
            'active' => true,
        ]);
        $closer = User::factory()->create([
            'name' => 'Judith',
            'role' => UserRole::NocOperator,
            'active' => true,
        ]);
        $viewer = User::factory()->create([
            'name' => 'Solo Lectura',
            'role' => UserRole::Viewer,
            'active' => true,
        ]);

        // 1) Operator abre Tracking; opened_by = auth (ignora body).
        $this->actingAs($opener);
        $opened = $this->postJson('/api/tracking', [
            'incident_id' => $incident->id,
            'opened_by_user_id' => $follower->id,
        ]);
        $opened->assertCreated()
            ->assertJsonPath('created', true)
            ->assertJsonPath('data.opened_by_user_id', $opener->id)
            ->assertJsonPath('data.opened_by_name', 'Elias')
            ->assertJsonPath('data.description', 'LINK DOWN CID258600')
            ->assertJsonPath('data.status', TrackingStatus::Open->value);

        $trackingId = (int) $opened->json('data.id');

        // Viewer no modifica.
        $this->actingAs($viewer);
        $this->postJson("/api/tracking/{$trackingId}/updates", [
            'body' => 'Viewer no debe',
        ])->assertForbidden();

        // 2) Otro usuario agrega seguimiento; actor correcto.
        $this->actingAs($follower);
        $this->postJson("/api/tracking/{$trackingId}/updates", [
            'body' => 'Contacto con el local',
        ])
            ->assertCreated()
            ->assertJsonPath('data.status', TrackingStatus::InProgress->value)
            ->assertJsonPath('data.updates.0.actor_name', 'Luis')
            ->assertJsonPath('data.updates.0.created_by_user_id', $follower->id);

        $this->assertDatabaseHas('tracking_updates', [
            'tracking_record_id' => $trackingId,
            'created_by_user_id' => $follower->id,
            'body' => 'Contacto con el local',
        ]);

        // 3) PRTG recovery → TECHNICAL_RECOVERY, NO cierra.
        $sensor->update(['normalized_status' => MonitoringStatus::Operativo]);
        app(IncidentService::class)->applyTechnicalRecovery(
            $incident->fresh(),
            'PRTG reportó recuperación (Ping OPERATIVO).'
        );

        $tracking = TrackingRecord::query()->findOrFail($trackingId);
        $this->assertSame(TrackingStatus::TechnicallyRecovered, $tracking->status);
        $this->assertNull($tracking->closed_at);
        $this->assertTrue($tracking->isOpen());
        $this->assertDatabaseHas('tracking_updates', [
            'tracking_record_id' => $trackingId,
            'event_type' => TrackingEventType::TechnicalRecovery->value,
            'created_by_user_id' => null,
        ]);

        // 4) Tercer usuario cierra; closed_by = Judith.
        $this->actingAs($closer);
        $lock = (int) $tracking->fresh()->lock_version;
        $closed = $this->postJson("/api/tracking/{$trackingId}/close", [
            'lock_version' => $lock,
            'closing_note' => 'Validado en campo',
        ]);
        $closed->assertOk()
            ->assertJsonPath('data.status', TrackingStatus::Closed->value)
            ->assertJsonPath('data.closed_by_user_id', $closer->id)
            ->assertJsonPath('data.closed_by_name', 'Judith')
            ->assertJsonPath('data.can_add_update', false);

        $this->assertTrue(
            AuditLog::query()->where('action', 'CLOSE_TRACKING')->where('user_id', $closer->id)->exists()
        );

        // Tracking cerrado no permite update normal.
        $this->postJson("/api/tracking/{$trackingId}/updates", [
            'body' => 'Tras cierre',
        ])->assertStatus(422);

        // Doble cierre → 409.
        $lock2 = (int) $closed->json('data.lock_version');
        $this->postJson("/api/tracking/{$trackingId}/close", [
            'lock_version' => $lock2,
        ])
            ->assertStatus(409)
            ->assertJsonPath('error', 'ALREADY_CLOSED');

        // 5) Reopen registra auditoría y vuelve a permitir updates.
        $reopened = $this->postJson("/api/tracking/{$trackingId}/reopen", [
            'lock_version' => $lock2,
            'note' => 'Revisión adicional',
        ]);
        $reopened->assertOk()
            ->assertJsonPath('data.status', TrackingStatus::InProgress->value)
            ->assertJsonPath('data.can_add_update', true);

        $this->assertTrue(
            AuditLog::query()->where('action', 'REOPEN_TRACKING')->where('user_id', $closer->id)->exists()
        );

        $this->postJson("/api/tracking/{$trackingId}/updates", [
            'body' => 'Seguimiento post-reapertura',
        ])->assertCreated();

        $this->assertSame(
            1,
            TrackingRecord::query()->whereKey($trackingId)->where('status', '!=', TrackingStatus::Closed->value)->count()
        );
    }

    public function test_checklist_auth_and_import_smoke(): void
    {
        // Smoke: login OK / inválido / desactivado ya viven en AuthLoginTest;
        // import cerrado/mismatch en TrackingImportServiceTest.
        // Aquí solo aseguramos que el módulo Tracking exige auth.
        $this->getJson('/api/tracking')->assertUnauthorized();
        $this->getJson('/api/tracking/report')->assertUnauthorized();
        $this->getJson('/api/tracking/report.xlsx')->assertUnauthorized();
    }
}
