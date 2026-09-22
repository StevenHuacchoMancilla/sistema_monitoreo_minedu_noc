<?php

namespace Tests\Feature;

use App\Enums\CidStatus;
use App\Enums\ContactMatchStatus;
use App\Models\NetworkAssignment;
use App\Models\School;
use App\Models\SchoolContact;
use App\Services\ExcelImportService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Support\LleeWorkbookFactory;
use Tests\TestCase;

class ExcelImportTest extends TestCase
{
    use RefreshDatabase;

    public function test_imports_resources_contacts_special_cases_and_is_idempotent(): void
    {
        [$resources, $contacts] = $this->writeWorkbooks();

        $service = app(ExcelImportService::class);
        $first = $service->import($resources, $contacts);
        $second = $service->import($resources, $contacts);

        $this->assertSame(4, $first['received_count']);
        $this->assertSame(4, School::query()->count());
        $this->assertSame(0, $second['schools_created']);
        $this->assertSame(4, School::query()->count());
        $this->assertGreaterThan(0, $first['cids_valid']);
        $this->assertSame(1, $first['cids_empty']);
        $this->assertSame(1, $first['cids_baja']);

        $ardillitas = School::query()->where('local_educativo', 'LAS ARDILLITAS')->first();
        $this->assertNotNull($ardillitas);
        $this->assertSame(501, $ardillitas->current_sequence);
        $this->assertSame('481', $ardillitas->legacy_reference);
        $this->assertSame(ContactMatchStatus::Pending, $ardillitas->contact_match_status);
        $this->assertSame(0, $ardillitas->contacts()->count());
        $this->assertSame('259013', $ardillitas->activeAssignment?->cid);
        $this->assertTrue($ardillitas->activeAssignment?->monitoring_eligible);

        $fernando = School::query()->where('local_educativo', 'FERNANDO LORES TENAZOA')->first();
        $this->assertNotNull($fernando);
        $this->assertSame(ContactMatchStatus::Matched, $fernando->contact_match_status);
        $this->assertSame('OLMEDO CUBAS ALTAMICANO', $fernando->contacts()->first()?->name);
        $this->assertSame('955076232', $fernando->contacts()->first()?->phone);
        $this->assertDoesNotMatchRegularExpression('/E/i', (string) $fernando->contacts()->first()?->phone);
        $this->assertSame(CidStatus::BajaImpe, $fernando->activeAssignment?->cid_status);
        $this->assertFalse($fernando->activeAssignment?->monitoring_eligible);
        $this->assertTrue(
            $fernando->networkAssignments()->where('cid', '258444')->where('is_active', false)->exists()
        );

        $castilla = School::query()
            ->where('local_educativo', 'INST SUP. TEC. MARISCAL RAMON CASTILLA (SEDE SANTA ROSA)')
            ->first();
        $this->assertNotNull($castilla);
        $this->assertSame(ContactMatchStatus::Matched, $castilla->contact_match_status);
        $this->assertSame('AMERICO MURRITA IZUISA', $castilla->contacts()->first()?->name);
        $this->assertSame(CidStatus::Empty, $castilla->activeAssignment?->cid_status);
        $this->assertFalse($castilla->activeAssignment?->monitoring_eligible);

        $nuevo = School::query()->where('local_educativo', '62015')->first();
        $this->assertNotNull($nuevo);
        $this->assertSame('258444', $nuevo->activeAssignment?->cid);
        // Recurso manda: el contacto se vincula por CID aunque el Excel LLEE tenga otro código/local.
        $this->assertSame(ContactMatchStatus::Matched, $nuevo->contact_match_status);
        $this->assertSame(0, $nuevo->contact_match_priority);
        $this->assertSame('OLMEDO CUBAS ALTAMICANO', $nuevo->contacts()->first()?->name);
        $this->assertSame('955076232', $nuevo->contacts()->first()?->phone);

        $this->assertSame('148.222.200.1', $ardillitas->activeAssignment?->ip_publica);
        $this->assertSame('-3748021', $ardillitas->latitud);
        $this->assertDatabaseMissing('network_assignments', ['ssid_ap' => 'secret-should-not-persist']);
        $this->assertFalse(
            str_contains(json_encode(SchoolContact::query()->pluck('phone')) ?: '', 'E')
        );
    }

    public function test_cid_reassignment_preserves_history(): void
    {
        $dir = sys_get_temp_dir().'/llee-history-'.uniqid();
        mkdir($dir);

        LleeWorkbookFactory::resources($dir.'/r1.xlsx', [
            [
                'nro' => '81',
                'cid' => '258444',
                'codigo_local' => '367013',
                'codigo_modular' => '1228543',
                'local_educativo' => 'FERNANDO LORES TENAZOA',
                'distrito' => 'BELEN',
                'ip_publica' => '10.1.1.1',
            ],
        ]);
        LleeWorkbookFactory::contacts($dir.'/c1.xlsx', [
            [
                'nro' => '81',
                'cid' => '258444',
                'codigo_local' => '367013',
                'codigo_modular' => '1228543',
                'local_educativo' => 'FERNANDO LORES TENAZOA',
                'distrito' => 'BELEN',
                'contacto_1' => 'OLMEDO CUBAS ALTAMICANO',
                'cargo_1' => 'DIRECTOR',
                'telefono_1' => '955076232',
            ],
        ]);

        app(ExcelImportService::class)->import($dir.'/r1.xlsx', $dir.'/c1.xlsx');

        LleeWorkbookFactory::resources($dir.'/r2.xlsx', [
            [
                'nro' => '81',
                'cid' => '258444',
                'codigo_local' => '378728',
                'codigo_modular' => '202721',
                'local_educativo' => '62015',
                'distrito' => 'LAGUNAS',
                'ip_publica' => '10.2.2.2',
            ],
            [
                'nro' => '502/81',
                'cid' => 'baja - impe',
                'codigo_local' => '367013',
                'codigo_modular' => '1228543',
                'local_educativo' => 'FERNANDO LORES TENAZOA',
                'distrito' => 'BELEN',
                'ip_publica' => '10.1.1.1',
            ],
        ]);

        app(ExcelImportService::class)->import($dir.'/r2.xlsx', $dir.'/c1.xlsx');

        $fernando = School::query()->where('local_educativo', 'FERNANDO LORES TENAZOA')->first();
        $nuevo = School::query()->where('local_educativo', '62015')->first();

        $this->assertSame(2, $fernando?->networkAssignments()->count());
        $this->assertSame(CidStatus::BajaImpe, $fernando?->activeAssignment?->cid_status);
        $this->assertTrue(
            $fernando?->networkAssignments()->where('cid', '258444')->where('is_active', false)->exists()
        );
        $this->assertSame('258444', $nuevo?->activeAssignment?->cid);
        $this->assertSame(1, NetworkAssignment::query()->where('cid', '258444')->where('is_active', true)->count());
    }

    /**
     * @return array{0: string, 1: string}
     */
    private function writeWorkbooks(): array
    {
        $dir = sys_get_temp_dir().'/llee-import-'.uniqid();
        mkdir($dir);
        $resources = $dir.'/recursos.xlsx';
        $contacts = $dir.'/contactos.xlsx';

        LleeWorkbookFactory::resources($resources, [
            [
                'nro' => '81',
                'cid' => '258444',
                'codigo_local' => '378728',
                'codigo_modular' => '202721',
                'local_educativo' => '62015',
                'distrito' => 'LAGUNAS',
                'ip_publica' => '10.9.9.9',
            ],
            [
                'nro' => '501/481',
                'cid' => '259013',
                'codigo_local' => '114917',
                'codigo_modular' => '3972567',
                'local_educativo' => 'LAS ARDILLITAS',
                'distrito' => 'RAMON CASTILLA',
                'ip_publica' => '148.222.200.1',
                'ip_loopback' => '10.139.50.200/32',
                'latitud' => '-3748021',
                'longitud' => '-73.253336',
            ],
            [
                'nro' => '502/81',
                'cid' => 'baja - impe',
                'codigo_local' => '367013',
                'codigo_modular' => '1228543',
                'local_educativo' => 'FERNANDO LORES TENAZOA',
                'distrito' => 'BELEN',
            ],
            [
                'nro' => '503/488',
                'cid' => '',
                'codigo_local' => '386035',
                'codigo_modular' => '721696',
                'local_educativo' => 'INST SUP. TEC. MARISCAL RAMON CASTILLA (SEDE SANTA ROSA)',
                'distrito' => 'YAVARI',
            ],
        ]);

        LleeWorkbookFactory::contacts($contacts, [
            [
                'nro' => '81',
                'cid' => '258444',
                'codigo_local' => '367013',
                'codigo_modular' => '1228543',
                'local_educativo' => 'FERNANDO LORES TENAZOA',
                'distrito' => 'BELEN',
                'contacto_1' => 'OLMEDO CUBAS ALTAMICANO',
                'cargo_1' => 'DIRECTOR',
                'telefono_1_numeric' => 9.55076232E8,
            ],
            [
                'nro' => '488',
                'cid' => '258854',
                'codigo_local' => '386035',
                'codigo_modular' => '721696',
                'local_educativo' => 'INST SUP. TEC. MARISCAL RAMON CASTILLA (SEDE SANTA ROSA)',
                'distrito' => 'YAVARI',
                'contacto_1' => 'AMERICO MURRITA IZUISA',
                'cargo_1' => 'DIRECTOR',
                'telefono_1' => '965111222',
            ],
            [
                'nro' => '481',
                'cid' => '258844',
                'codigo_local' => '852052',
                'codigo_modular' => '721118',
                'local_educativo' => '430',
                'distrito' => 'RAMON CASTILLA',
                'contacto_1' => 'CONTACTO AJENO',
                'cargo_1' => 'DIRECTOR',
                'telefono_1' => '999999999',
            ],
        ]);

        return [$resources, $contacts];
    }
}
