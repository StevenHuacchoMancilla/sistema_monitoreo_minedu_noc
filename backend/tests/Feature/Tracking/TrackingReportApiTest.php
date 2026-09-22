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
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class TrackingReportApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_report_returns_excel_shaped_columns_and_seguimiento(): void
    {
        $opener = $this->actingAsUser(null, UserRole::NocOperator);
        $closer = User::factory()->create([
            'role' => UserRole::NocOperator,
            'active' => true,
            'name' => 'Judith',
        ]);

        $school = School::query()->create([
            'codigo_local' => '364590',
            'local_educativo' => 'COLEGIO REPORT',
            'current_sequence' => 120,
            'active' => true,
        ]);
        $assignment = NetworkAssignment::query()->create([
            'school_id' => $school->id,
            'cid' => '258490',
            'cid_status' => CidStatus::Valid,
            'is_active' => true,
            'monitoring_eligible' => true,
        ]);

        $tracking = TrackingRecord::query()->create([
            'incident_number' => 12,
            'school_id' => $school->id,
            'network_assignment_id' => $assignment->id,
            'ticket' => 'TK-12',
            'tss_snapshot' => '120',
            'cid_snapshot' => '258490',
            'description' => 'LINK DOWN CID258490',
            'status' => TrackingStatus::Closed,
            'opened_at' => now()->subDays(2)->setTime(10, 0),
            'opened_at_precision' => DatePrecision::DateTime,
            'opened_by_user_id' => $opener->id,
            'closed_at' => now()->subDay()->setTime(16, 30),
            'closed_at_precision' => DatePrecision::DateTime,
            'closed_by_user_id' => $closer->id,
            'closing_note' => 'OK',
            'lock_version' => 2,
        ]);

        TrackingUpdate::query()->create([
            'tracking_record_id' => $tracking->id,
            'event_type' => TrackingEventType::Comment,
            'body' => 'Sin respuesta del local',
            'created_by_user_id' => $opener->id,
            'occurred_on' => now()->subDays(2)->toDateString(),
            'occurred_at' => null,
        ]);
        TrackingUpdate::query()->create([
            'tracking_record_id' => $tracking->id,
            'event_type' => TrackingEventType::Comment,
            'body' => 'Se restableció el enlace',
            'created_by_user_id' => $closer->id,
            'occurred_on' => now()->subDay()->toDateString(),
            'occurred_at' => null,
        ]);

        $response = $this->getJson('/api/tracking/report');

        $response->assertOk()
            ->assertJsonPath('meta.total', 1)
            ->assertJsonPath('columns.0.key', 'n_incidente')
            ->assertJsonPath('columns.7.key', 'seguimiento')
            ->assertJsonPath('data.0.n_incidente', 12)
            ->assertJsonPath('data.0.ticket', 'TK-12')
            ->assertJsonPath('data.0.tss', '120')
            ->assertJsonPath('data.0.cid', '258490')
            ->assertJsonPath('data.0.descripcion', 'LINK DOWN CID258490')
            ->assertJsonPath('data.0.nombre_apertura', $opener->name)
            ->assertJsonPath('data.0.nombre_cierre', 'Judith')
            ->assertJsonPath('data.0.is_closed', true);

        $seguimiento = (string) $response->json('data.0.seguimiento');
        $this->assertStringContainsString('Sin respuesta del local', $seguimiento);
        $this->assertStringContainsString('Se restableció el enlace', $seguimiento);
        $this->assertStringContainsString("\n", $seguimiento);
    }

    public function test_report_filters_by_status(): void
    {
        $opener = $this->actingAsUser(null, UserRole::Admin);
        $school = School::query()->create([
            'codigo_local' => '364591',
            'local_educativo' => 'COLEGIO OPEN',
            'current_sequence' => 121,
            'active' => true,
        ]);

        TrackingRecord::query()->create([
            'incident_number' => 20,
            'school_id' => $school->id,
            'tss_snapshot' => '121',
            'description' => 'OPEN',
            'status' => TrackingStatus::Open,
            'opened_at' => now(),
            'opened_by_user_id' => $opener->id,
            'lock_version' => 1,
        ]);
        TrackingRecord::query()->create([
            'incident_number' => 21,
            'school_id' => $school->id,
            'tss_snapshot' => '121',
            'description' => 'CLOSED',
            'status' => TrackingStatus::Closed,
            'opened_at' => now()->subDay(),
            'opened_by_user_id' => $opener->id,
            'closed_at' => now(),
            'closed_by_user_id' => $opener->id,
            'lock_version' => 1,
        ]);

        $this->getJson('/api/tracking/report?status=OPEN')
            ->assertOk()
            ->assertJsonPath('meta.total', 1)
            ->assertJsonPath('data.0.n_incidente', 20);
    }

    public function test_report_xlsx_downloads_workbook_with_excel_headers(): void
    {
        $opener = $this->actingAsUser(null, UserRole::NocOperator);
        $school = School::query()->create([
            'codigo_local' => '364592',
            'local_educativo' => 'COLEGIO XLSX',
            'current_sequence' => 122,
            'active' => true,
        ]);

        TrackingRecord::query()->create([
            'incident_number' => 33,
            'school_id' => $school->id,
            'ticket' => 'TK-33',
            'tss_snapshot' => '122',
            'cid_snapshot' => '258499',
            'description' => 'LINK DOWN CID258499',
            'status' => TrackingStatus::Closed,
            'opened_at' => now()->subDay(),
            'opened_at_precision' => DatePrecision::DateTime,
            'opened_by_user_id' => $opener->id,
            'closed_at' => now(),
            'closed_at_precision' => DatePrecision::DateTime,
            'closed_by_user_id' => $opener->id,
            'lock_version' => 1,
        ]);

        $response = $this->get('/api/tracking/report.xlsx');

        $response->assertOk();
        $this->assertStringContainsString(
            'spreadsheetml.sheet',
            (string) $response->headers->get('content-type')
        );
        $this->assertStringContainsString(
            'tracking_general_',
            (string) $response->headers->get('content-disposition')
        );

        $tmp = tempnam(sys_get_temp_dir(), 'trk_xlsx_');
        $this->assertNotFalse($tmp);
        file_put_contents($tmp, $response->streamedContent());

        $book = \PhpOffice\PhpSpreadsheet\IOFactory::load($tmp);
        @unlink($tmp);
        $sheet = $book->getActiveSheet();

        $this->assertSame('N° INCIDENTE', $sheet->getCell('A1')->getValue());
        $this->assertSame('TICKET', $sheet->getCell('B1')->getValue());
        $this->assertSame('TSS', $sheet->getCell('C1')->getValue());
        $this->assertSame('CID', $sheet->getCell('D1')->getValue());
        $this->assertSame('DESCRIPCION', $sheet->getCell('E1')->getValue());
        $this->assertSame('APERTURA', $sheet->getCell('F1')->getValue());
        $this->assertSame('NOMBRE', $sheet->getCell('G1')->getValue());
        $this->assertSame('SEGUIMIENTO', $sheet->getCell('H1')->getValue());
        $this->assertSame('CIERRE', $sheet->getCell('I1')->getValue());
        $this->assertSame('NOMBRE', $sheet->getCell('J1')->getValue());

        $this->assertSame(33, (int) $sheet->getCell('A2')->getValue());
        $this->assertSame('TK-33', (string) $sheet->getCell('B2')->getValue());
        $this->assertSame('258499', (string) $sheet->getCell('D2')->getValue());
        $this->assertSame('LINK DOWN CID258499', (string) $sheet->getCell('E2')->getValue());
    }
}
