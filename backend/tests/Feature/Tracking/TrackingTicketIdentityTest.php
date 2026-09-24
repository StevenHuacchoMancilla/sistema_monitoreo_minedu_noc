<?php

namespace Tests\Feature\Tracking;

use App\Domain\Tracking\Support\TrackingTicketCodes;
use App\Enums\CidStatus;
use App\Enums\FollowupStatus;
use App\Enums\ManagementClassification;
use App\Enums\MonitoringStatus;
use App\Enums\TrackingStatus;
use App\Enums\UserRole;
use App\Models\Incident;
use App\Models\NetworkAssignment;
use App\Models\PrtgSensor;
use App\Models\School;
use App\Models\TrackingRecord;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class TrackingTicketIdentityTest extends TestCase
{
    use RefreshDatabase;

    public function test_codes_follow_architecture_and_close_updates_only_report_ticket(): void
    {
        $codes = app(TrackingTicketCodes::class);
        $opened = Carbon::parse('2026-09-23 09:14:32', 'America/Lima');
        $closed = Carbon::parse('2026-09-23 11:47:08', 'America/Lima');

        $minted = $codes->mint('403', '258766', $opened);
        $this->assertSame(26, strlen($minted['public_id']));
        $this->assertSame(8, strlen($minted['suffix']));
        $this->assertSame(
            'INC403_258766_A20260923091432_'.$minted['suffix'],
            $minted['case_code']
        );
        $this->assertSame(
            'INC403_258766_A20260923091432_COPEN_'.$minted['suffix'],
            $minted['report_ticket']
        );

        $final = $codes->reportTicketClosed($minted['case_code'], $closed);
        $this->assertSame(
            'INC403_258766_A20260923091432_C20260923114708_'.$minted['suffix'],
            $final
        );
        $this->assertSame(
            $minted['report_ticket'],
            $codes->reportTicketOpen($minted['case_code'])
        );
    }

    public function test_same_school_same_day_different_opened_at_yield_distinct_case_codes(): void
    {
        $school = School::query()->create([
            'codigo_local' => '366001',
            'local_educativo' => 'COLEGIO TICKET DIA',
            'current_sequence' => 403,
            'active' => true,
        ]);
        $assignment = NetworkAssignment::query()->create([
            'school_id' => $school->id,
            'cid' => '258766',
            'cid_status' => CidStatus::Valid,
            'monitoring_eligible' => true,
            'is_active' => true,
        ]);

        $makeIncident = function (string $at) use ($school, $assignment): Incident {
            $sensor = PrtgSensor::query()->create([
                'network_assignment_id' => $assignment->id,
                'prtg_sensor_id' => (string) random_int(20000, 90000),
                'prtg_device_id' => (string) random_int(20000, 90000),
                'name' => 'Ping',
                'normalized_status' => MonitoringStatus::Caido,
                'status_raw' => '5',
                'last_synced_at' => now(),
            ]);

            return Incident::query()->create([
                'school_id' => $school->id,
                'network_assignment_id' => $assignment->id,
                'prtg_sensor_id' => $sensor->id,
                'started_at' => Carbon::parse($at, 'America/Lima'),
                'current_status' => MonitoringStatus::Caido->value,
                'followup_status' => FollowupStatus::PendienteContacto,
                'management_classification' => ManagementClassification::NewOutage,
            ]);
        };

        $a = $makeIncident('2026-09-23 09:14:32');
        $b = $makeIncident('2026-09-23 09:16:00');
        $this->actingAsUser(null, UserRole::NocOperator);

        Carbon::setTestNow(Carbon::parse('2026-09-23 09:14:32', 'America/Lima'));
        $ra = $this->postJson('/api/tracking', ['incident_id' => $a->id])->assertCreated();
        Carbon::setTestNow(Carbon::parse('2026-09-23 09:16:00', 'America/Lima'));
        $rb = $this->postJson('/api/tracking', ['incident_id' => $b->id])->assertCreated();
        Carbon::setTestNow();

        $codeA = (string) $ra->json('data.case_code');
        $codeB = (string) $rb->json('data.case_code');
        $this->assertNotSame($codeA, $codeB);
        $this->assertNotSame($ra->json('data.public_id'), $rb->json('data.public_id'));
        $this->assertStringContainsString('_A20260923091432_', $codeA);
        $this->assertStringContainsString('_A20260923091600_', $codeB);
        $this->assertSame(2, TrackingRecord::query()->count());
    }

    public function test_close_updates_report_ticket_but_keeps_case_code_and_public_id(): void
    {
        $codes = app(TrackingTicketCodes::class);
        $openedAt = Carbon::parse('2026-09-23 09:14:32', 'America/Lima');
        $identity = $codes->mint('403', '258766', $openedAt);

        $school = School::query()->create([
            'codigo_local' => '366002',
            'local_educativo' => 'COLEGIO CLOSE TICKET',
            'current_sequence' => 403,
            'active' => true,
        ]);
        $assignment = NetworkAssignment::query()->create([
            'school_id' => $school->id,
            'cid' => '258766',
            'cid_status' => CidStatus::Valid,
            'monitoring_eligible' => true,
            'is_active' => true,
        ]);
        $opener = $this->actingAsUser(null, UserRole::NocOperator);
        $tracking = TrackingRecord::query()->create([
            'public_id' => $identity['public_id'],
            'incident_number' => 9001,
            'school_id' => $school->id,
            'network_assignment_id' => $assignment->id,
            'ticket' => $identity['report_ticket'],
            'case_code' => $identity['case_code'],
            'report_ticket' => $identity['report_ticket'],
            'tss_snapshot' => '403',
            'cid_snapshot' => '258766',
            'status' => TrackingStatus::InProgress,
            'opened_at' => $openedAt,
            'opened_by_user_id' => $opener->id,
            'lock_version' => 1,
        ]);

        Carbon::setTestNow(Carbon::parse('2026-09-23 11:47:08', 'America/Lima'));
        $this->postJson("/api/tracking/{$tracking->id}/close", [
            'lock_version' => 1,
            'closing_note' => 'Cierre formal',
        ])->assertOk()
            ->assertJsonPath('data.case_code', $identity['case_code'])
            ->assertJsonPath('data.public_id', $identity['public_id'])
            ->assertJsonPath(
                'data.report_ticket',
                'INC403_258766_A20260923091432_C20260923114708_'.$identity['suffix']
            )
            ->assertJsonPath('data.status', TrackingStatus::Closed->value);
        Carbon::setTestNow();
    }
}
