<?php

namespace Tests\Feature\Tracking;

use App\Enums\CidStatus;
use App\Enums\DatePrecision;
use App\Enums\TrackingEventType;
use App\Enums\TrackingStatus;
use App\Enums\UserRole;
use App\Models\NetworkAssignment;
use App\Models\School;
use App\Models\TrackingRecord;
use App\Models\TrackingUpdate;
use App\Support\OperationalTime;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class TrackingTimezoneDisplayTest extends TestCase
{
    use RefreshDatabase;

    public function test_list_report_and_xlsx_show_same_lima_wall_clock(): void
    {
        config(['app.timezone' => 'UTC', 'app.display_timezone' => 'America/Lima']);

        $this->actingAsUser(null, UserRole::NocOperator);

        $school = School::query()->create([
            'codigo_local' => 'TZ001',
            'local_educativo' => 'COLEGIO TZ',
            'current_sequence' => 1,
            'active' => true,
        ]);
        $assignment = NetworkAssignment::query()->create([
            'school_id' => $school->id,
            'cid' => '258546',
            'cid_status' => CidStatus::Valid,
            'is_active' => true,
            'monitoring_eligible' => true,
        ]);

        // 2026-09-23 23:07 UTC ≡ 18:07 America/Lima
        $openedUtc = Carbon::parse('2026-09-23 23:07:00', 'UTC');
        $updateUtc = Carbon::parse('2026-09-23 23:19:00', 'UTC');

        $tracking = TrackingRecord::query()->create([
            'incident_number' => 1,
            'school_id' => $school->id,
            'network_assignment_id' => $assignment->id,
            'ticket' => 'TK-TZ-1',
            'tss_snapshot' => '1',
            'cid_snapshot' => '258546',
            'description' => 'LINK DOWN CID258546',
            'status' => TrackingStatus::InProgress,
            'opened_at' => $openedUtc,
            'opened_at_precision' => DatePrecision::DateTime,
            'opened_by_user_id' => auth()->id(),
            'lock_version' => 1,
        ]);

        TrackingUpdate::query()->create([
            'tracking_record_id' => $tracking->id,
            'event_type' => TrackingEventType::Comment,
            'body' => 'REALIZAR VALIDACIÓN EN LOCAL.',
            'created_by_user_id' => auth()->id(),
            'occurred_on' => $updateUtc->toDateString(),
            'occurred_at' => $updateUtc,
        ]);

        $expectedOpen = OperationalTime::format($openedUtc, 'd/m/Y H:i');
        $expectedUpdate = OperationalTime::format($updateUtc, 'd/m/Y H:i');
        $this->assertSame('23/09/2026 18:07', $expectedOpen);
        $this->assertSame('23/09/2026 18:19', $expectedUpdate);

        $list = $this->getJson('/api/tracking')->assertOk();
        $this->assertSame($expectedOpen, $list->json('data.0.opened_at_display'));

        $report = $this->getJson('/api/tracking/report')->assertOk();
        $this->assertSame($expectedOpen, $report->json('data.0.apertura'));
        $this->assertStringContainsString($expectedUpdate, (string) $report->json('data.0.seguimiento'));
        $this->assertStringNotContainsString('23:07', (string) $report->json('data.0.apertura'));
        $this->assertStringNotContainsString('23:19', (string) $report->json('data.0.seguimiento'));

        $xlsx = $this->get('/api/tracking/report.xlsx')->assertOk();
        $tmp = tempnam(sys_get_temp_dir(), 'trk');
        $this->assertNotFalse($tmp);
        file_put_contents($tmp, $xlsx->streamedContent());
        $sheet = \PhpOffice\PhpSpreadsheet\IOFactory::load($tmp)->getActiveSheet();
        @unlink($tmp);

        $this->assertSame($expectedOpen, (string) $sheet->getCell('F2')->getValue());
        $this->assertStringContainsString($expectedUpdate, (string) $sheet->getCell('H2')->getValue());
    }
}
