<?php

namespace Tests\Unit\Incidents;

use App\Enums\CidStatus;
use App\Domain\Incidents\Support\IncidentTimelineBuilder;
use App\Models\Incident;
use App\Models\IncidentUpdate;
use App\Models\NetworkAssignment;
use App\Models\School;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class IncidentTimelineNoiseFilterTest extends TestCase
{
    use RefreshDatabase;

    public function test_timeline_keeps_creation_and_recovery_hides_sync_noise(): void
    {
        $school = School::query()->create([
            'codigo_local' => 'T1',
            'local_educativo' => 'Test',
            'active' => true,
        ]);
        $assignment = NetworkAssignment::query()->create([
            'school_id' => $school->id,
            'cid' => '100',
            'cid_status' => CidStatus::Valid,
            'is_active' => true,
            'monitoring_eligible' => true,
        ]);
        $incident = Incident::query()->create([
            'school_id' => $school->id,
            'network_assignment_id' => $assignment->id,
            'current_status' => 'CAIDO',
            'started_at' => now()->subDay(),
        ]);

        IncidentUpdate::query()->create([
            'incident_id' => $incident->id,
            'type' => 'SYSTEM',
            'observation' => 'Incidencia creada. Estado CAÍDO (Ping).',
            'status_after' => 'PENDIENTE_CONTACTO',
        ]);
        IncidentUpdate::query()->create([
            'incident_id' => $incident->id,
            'type' => 'SYSTEM',
            'observation' => 'started_at alineado a downtimesince PRTG (sync tardío): 2026-09-21 — 2026-09-18.',
        ]);
        IncidentUpdate::query()->create([
            'incident_id' => $incident->id,
            'type' => 'SYSTEM',
            'observation' => 'PRTG reportó recuperación (Ping OPERATIVO). Requiere revisión operativa.',
            'status_before' => 'EN_GESTION',
            'status_after' => 'RECUPERADO',
        ]);

        $incident->load(['managements', 'updates.user']);
        $timeline = IncidentTimelineBuilder::build($incident);
        $titles = array_column($timeline, 'title');

        $this->assertContains('Incidencia creada', $titles);
        $this->assertContains('PRTG reportó recuperación', $titles);
        $this->assertNotContains('Evento del sistema', $titles);
        foreach ($timeline as $event) {
            $detail = mb_strtolower((string) ($event['detail'] ?? ''));
            $this->assertStringNotContainsString('sync tard', $detail);
            $this->assertStringNotContainsString('downtimesince', $detail);
        }
    }
}
