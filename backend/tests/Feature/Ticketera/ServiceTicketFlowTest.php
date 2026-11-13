<?php

namespace Tests\Feature\Ticketera;

use App\Domain\Incidents\Services\IncidentService;
use App\Domain\Ticketera\Services\ServiceTicketService;
use App\Domain\Ticketera\Services\TicketeraWorkbookImporter;
use App\Enums\CidStatus;
use App\Enums\MonitoringStatus;
use App\Models\Incident;
use App\Models\NetworkAssignment;
use App\Models\PrtgSensor;
use App\Models\School;
use App\Models\ServiceTicket;
use Illuminate\Foundation\Testing\RefreshDatabase;
use InvalidArgumentException;
use Tests\TestCase;

class ServiceTicketFlowTest extends TestCase
{
    use RefreshDatabase;

    public function test_each_fall_gets_the_next_tgs_code_and_recovery_does_not_close_it(): void
    {
        [$assignment, $sensor] = $this->seedSchool('258900', MonitoringStatus::Caido);
        $incidents = app(IncidentService::class);

        $first = $incidents->ensureOpen($assignment, $sensor, now()->subHour());
        // TGS nace al gestionar (no al detectar PRTG).
        $ticket = app(ServiceTicketService::class)->ensureForIncident($first, 'Steven');
        $this->assertNotNull($ticket);
        $this->assertMatchesRegularExpression('/^TGS_258900_1_\d{14}$/', $ticket->ticket_code);
        $this->assertSame(ServiceTicket::KIND_CORRECTIVE, $ticket->kind);
        $this->assertSame(ServiceTicket::STATUS_OPEN, $ticket->status);

        $incidents->applyTechnicalRecovery($first, 'PRTG operativo.', now());
        $ticket->refresh();
        $this->assertNotNull($ticket->restored_at);
        $this->assertSame(ServiceTicket::STATUS_OPEN, $ticket->status);

        app(ServiceTicketService::class)->recordVisit($first->fresh(), [
            'technician_name' => 'Juan Perez',
            'polygon' => 'Iquitos',
            'visit_reason' => 'Restablecer enlace',
            'activities' => 'Cambio de patchcord',
            'materials' => 'Patchcord LC',
            'closed_at' => '2026-11-05 16:00',
        ], 'Steven');
        $ticket->refresh();
        // Guardar detalle no cierra: el cierre es solo vía close().
        $this->assertSame(ServiceTicket::STATUS_OPEN, $ticket->status);
        $this->assertNull($ticket->closed_at);
        $this->assertStringContainsString('Cambio de patchcord', app(ServiceTicketService::class)->eventText($ticket));
        $this->assertStringContainsString('Patchcord LC', app(ServiceTicketService::class)->eventText($ticket));

        app(ServiceTicketService::class)->close($first->fresh(), 'Steven', now());
        $ticket->refresh();
        $this->assertSame(ServiceTicket::STATUS_CLOSED, $ticket->status);
        $this->assertNotNull($ticket->closed_at);

        $this->assertMatchesRegularExpression('/^TGS_258900_2_\d{14}$/', app(ServiceTicketService::class)->nextCode('258900'));
    }

    public function test_preventive_ticket_is_rejected_while_ping_is_down_and_stays_out_of_outages(): void
    {
        [$assignment, $sensor] = $this->seedSchool('258901', MonitoringStatus::Caido);
        $user = $this->actingAsUser();
        $tickets = app(ServiceTicketService::class);

        try {
            $tickets->openPreventive($assignment, $user->id, now());
            $this->fail('El preventivo no debe abrirse con el Ping caído.');
        } catch (InvalidArgumentException $exception) {
            $this->assertStringContainsString('correctivo', $exception->getMessage());
        }

        $sensor->update(['normalized_status' => MonitoringStatus::Operativo]);
        $assignment->unsetRelation('sensors');
        $preventive = $tickets->openPreventive($assignment->fresh(), $user->id, now(), 'Mantenimiento de gabinete');
        $ticket = ServiceTicket::query()->where('incident_id', $preventive->id)->first();

        $this->assertNotNull($ticket);
        $this->assertSame(ServiceTicket::KIND_PREVENTIVE, $ticket->kind);
        $this->assertMatchesRegularExpression('/^TGS_258901_1_\d{14}$/', (string) $ticket->ticket_code);
        $this->assertSame(Incident::DETECTION_PREVENTIVE, $preventive->detection_source);

        $visible = Incident::query()
            ->active()
            ->where(function ($query) {
                $query->whereHas(
                    'sensor',
                    fn ($sensorQuery) => $sensorQuery->whereIn('normalized_status', MonitoringStatus::outageValues()),
                )->orWhere('detection_source', Incident::DETECTION_MANUAL_PARTIAL);
            })
            ->pluck('id');

        $this->assertFalse($visible->contains($preventive->id));
    }

    public function test_excel_serial_uses_lima_wall_clock(): void
    {
        $at = app(TicketeraWorkbookImporter::class)->excelDate('46328.068055555559');
        $this->assertNotNull($at);
        $this->assertSame('2026-11-02 01:38', $at->format('Y-m-d H:i'));
    }

    /**
     * @return array{0: NetworkAssignment, 1: PrtgSensor}
     */
    private function seedSchool(string $cid, MonitoringStatus $status): array
    {
        $school = School::query()->create([
            'codigo_local' => $cid,
            'local_educativo' => 'COLEGIO '.$cid,
            'provincia' => 'LORETO',
            'distrito' => 'NAUTA',
            'clasificacion' => 'RURAL',
            'current_sequence' => (int) substr($cid, -3),
            'active' => true,
        ]);

        $assignment = NetworkAssignment::query()->create([
            'school_id' => $school->id,
            'cid' => $cid,
            'cid_status' => CidStatus::Valid,
            'monitoring_eligible' => true,
            'is_active' => true,
        ]);

        $sensor = PrtgSensor::query()->create([
            'network_assignment_id' => $assignment->id,
            'prtg_sensor_id' => $cid,
            'prtg_device_id' => $cid,
            'name' => 'Ping',
            'normalized_status' => $status,
            'status_raw' => '5',
            'last_synced_at' => now(),
        ]);

        return [$assignment, $sensor];
    }
}
