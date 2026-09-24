<?php

namespace Tests\Feature\Tracking;

use App\Domain\Tracking\Services\TrackingImportService;
use App\Enums\CidStatus;
use App\Enums\TrackingStatus;
use App\Enums\UserRole;
use App\Models\NetworkAssignment;
use App\Models\School;
use App\Models\SyncIssue;
use App\Models\TrackingRecord;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;
use Tests\TestCase;

class TrackingImportServiceTest extends TestCase
{
    use RefreshDatabase;

    public function test_imports_closed_and_open_rows_with_legacy_actors(): void
    {
        User::factory()->create(['name' => 'Judith', 'role' => UserRole::NocOperator]);

        $school = School::query()->create([
            'codigo_local' => '364552',
            'local_educativo' => 'COLEGIO A',
            'current_sequence' => 77,
            'active' => true,
        ]);
        NetworkAssignment::query()->create([
            'school_id' => $school->id,
            'cid' => '258440',
            'cid_status' => CidStatus::Valid,
            'monitoring_eligible' => true,
            'is_active' => true,
        ]);

        $school2 = School::query()->create([
            'codigo_local' => '364553',
            'local_educativo' => 'COLEGIO B',
            'current_sequence' => 39,
            'active' => true,
        ]);
        NetworkAssignment::query()->create([
            'school_id' => $school2->id,
            'cid' => '258402',
            'cid_status' => CidStatus::Valid,
            'monitoring_eligible' => true,
            'is_active' => true,
        ]);

        $path = storage_path('app/testing-tracking-import.xlsx');
        @mkdir(dirname($path), 0777, true);

        $book = new Spreadsheet;
        $sheet = $book->getActiveSheet();
        foreach (['N° INCIDENTE', 'TICKET', 'TSS', 'CID', 'DESCRIPCION', 'APERTURA', 'NOMBRE', 'SEGUIMIENTO', 'CIERRE', 'NOMBRE'] as $i => $h) {
            $sheet->setCellValue([$i + 1, 1], $h);
        }

        $sheet->setCellValue([1, 2], 1);
        $sheet->setCellValue([2, 2], null);
        $sheet->setCellValue([3, 2], 77);
        $sheet->setCellValue([4, 2], '258440');
        $sheet->setCellValue([5, 2], 'LINK DOWN CID258440');
        $sheet->setCellValue([6, 2], '05/09');
        $sheet->setCellValue([7, 2], 'Alvaro');
        $sheet->setCellValue([8, 2], "12/09 Se realizan descartes\n21/09 Se levanto el servicio.");
        $sheet->setCellValue([9, 2], '21/09');
        $sheet->setCellValue([10, 2], 'Judith');

        $sheet->setCellValue([1, 3], 2);
        $sheet->setCellValue([2, 3], 'INC39_258402');
        $sheet->setCellValue([3, 3], 39);
        $sheet->setCellValue([4, 3], '258402');
        $sheet->setCellValue([5, 3], 'LINK DOWN CID258402');
        $sheet->setCellValue([6, 3], '11/09');
        $sheet->setCellValue([7, 3], 'Elias');
        $sheet->setCellValue([8, 3], '21/09 Se realizaron descartes');
        $sheet->setCellValue([9, 3], null);
        $sheet->setCellValue([10, 3], null);

        (new Xlsx($book))->save($path);

        $summary = app(TrackingImportService::class)->import($path, 2026);

        $this->assertSame(2, $summary['created_count']);
        $this->assertSame(2, TrackingRecord::query()->count());

        $closed = TrackingRecord::query()->where('incident_number', 1)->first();
        $this->assertNotNull($closed);
        $this->assertSame(TrackingStatus::Closed, $closed->status);
        $this->assertNotEmpty($closed->public_id);
        $this->assertNotEmpty($closed->case_code);
        $this->assertStringContainsString('_C', (string) $closed->report_ticket);
        $this->assertSame('Alvaro', $closed->opened_by_legacy_name);
        $this->assertNotNull($closed->closed_by_user_id);
        $this->assertSame('2026-09-05', $closed->opened_at?->toDateString());
        $this->assertSame(2, $closed->updates()->count());

        $open = TrackingRecord::query()->where('incident_number', 2)->first();
        $this->assertNotNull($open);
        $this->assertSame(TrackingStatus::InProgress, $open->status);
        $this->assertMatchesRegularExpression('/^INC39_258402_A\d{14}_COPEN_/', (string) $open->report_ticket);
        $this->assertSame('Elias', $open->opened_by_legacy_name);
        $this->assertNull($open->closed_at);

        @unlink($path);
    }

    public function test_mismatch_cid_tss_is_not_imported(): void
    {
        $schoolA = School::query()->create([
            'codigo_local' => 'A1',
            'local_educativo' => 'A',
            'current_sequence' => 10,
            'active' => true,
        ]);
        NetworkAssignment::query()->create([
            'school_id' => $schoolA->id,
            'cid' => '111',
            'cid_status' => CidStatus::Valid,
            'is_active' => true,
            'monitoring_eligible' => true,
        ]);
        School::query()->create([
            'codigo_local' => 'B1',
            'local_educativo' => 'B',
            'current_sequence' => 20,
            'active' => true,
        ]);

        $path = storage_path('app/testing-tracking-mismatch.xlsx');
        $book = new Spreadsheet;
        $sheet = $book->getActiveSheet();
        foreach (['N° INCIDENTE', 'TICKET', 'TSS', 'CID', 'DESCRIPCION', 'APERTURA', 'NOMBRE', 'SEGUIMIENTO', 'CIERRE', 'NOMBRE'] as $i => $h) {
            $sheet->setCellValue([$i + 1, 1], $h);
        }
        $sheet->fromArray([1, null, 20, '111', 'LINK DOWN', '15/09', 'Luis', 'ok', null, null], null, 'A2');
        (new Xlsx($book))->save($path);

        $summary = app(TrackingImportService::class)->import($path, 2026);

        $this->assertSame(0, TrackingRecord::query()->count());
        $this->assertSame(1, $summary['mismatch_count']);
        $this->assertTrue(SyncIssue::query()->where('code', 'TRACKING_SCHOOL_MISMATCH')->exists());

        @unlink($path);
    }
}
