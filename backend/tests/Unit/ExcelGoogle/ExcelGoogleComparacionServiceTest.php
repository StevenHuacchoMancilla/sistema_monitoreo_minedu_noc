<?php

namespace Tests\Unit\ExcelGoogle;

use App\Domain\Dashboard\Services\DashboardService;
use App\Domain\ExcelGoogle\Services\ExcelGoogleComparacionService;
use Carbon\Carbon;
use Tests\TestCase;

class ExcelGoogleComparacionServiceTest extends TestCase
{
    public function test_cruza_caidas_con_la_fila_y_recuerda_razones_abiertas(): void
    {
        $csv = implode("\n", [
            ',,,,',
            'TICKETERA,,,,',
            'Ticket,CID,TSS,RAZÓN (MINEDU),ESTADO TICKET',
            'TGS_1,111,10,,CERRADO',
            'TGS_2,222,20,Requerimiento,ABIERTO',
            'TGS_3,333,30,Queja,CERRADO',
            'TGS_4,444,40,Caída de Enlace,ABIERTO',
            'TGS_5,222,20,Queja,ABIERTO',
            'TGS_6,222,20,,CERRADO',
            'TGS_7,666,60,Caída de Enlace,CERRADO',
            'TGS_8,666,60,,ABIERTO',
            'TGS_9,777,75,,ABIERTO',
            'TGS_10,888,80,,CERRADO',
        ]);

        $service = new ExcelGoogleComparacionService($this->createMock(DashboardService::class));
        $sheet = $service->parse($csv);
        $result = $service->analizar($sheet, 5, [
            $this->caida('111', 1),
            $this->caida('222', 2),
            $this->caida('333', 3),
            $this->caida('555', 5),
            $this->caida('666', 6),
        ]);

        $this->assertSame(3, $sheet['header_row']);
        $this->assertSame(['222', '666'], array_column($result['ya_en_excel'], 'cid'));
        $this->assertSame(8, $result['ya_en_excel'][0]['fila']);
        $this->assertSame('ABIERTO', $result['ya_en_excel'][0]['estado_ticket']);
        $this->assertSame('Queja', $result['ya_en_excel'][0]['razon_minedu']);
        $this->assertSame('TGS_5', $result['ya_en_excel'][0]['ticket']);
        $this->assertSame(11, $result['ya_en_excel'][1]['fila']);
        $this->assertSame('ABIERTO', $result['ya_en_excel'][1]['estado_ticket']);
        $this->assertNull($result['ya_en_excel'][1]['razon_minedu']);
        $this->assertSame(['444', '777'], array_column($result['abiertos_sin_caida'], 'cid'));
        $this->assertSame('Caída de Enlace', $result['abiertos_sin_caida'][0]['razon_minedu']);
        $this->assertSame('75', $result['abiertos_sin_caida'][1]['tss']);
        $this->assertSame('ABIERTO', $result['abiertos_sin_caida'][1]['estado_ticket']);
        $this->assertNull($result['abiertos_sin_caida'][1]['razon_minedu']);
        $this->assertNotContains('CERRADO', array_column($result['ya_en_excel'], 'estado_ticket'));
        $this->assertSame(['111', '333', '555'], array_column($result['faltan'], 'cid'));
        $this->assertSame("111\n333\n555", $result['texto_cid']);
        $this->assertSame("1\n3\n5", $result['texto_tss']);
        $this->assertArrayNotHasKey('razon_abierta', $result['faltan'][0]);
    }

    public function test_completa_caida_y_restablecimiento_de_los_abiertos_recuperados(): void
    {
        $service = new ExcelGoogleComparacionService($this->createMock(DashboardService::class));
        $rows = $service->aplicarFechasRecuperacion([
            ['cid' => '777', 'caido_desde' => '', 'tss' => '75'],
            ['cid' => '444', 'caido_desde' => '01/11/2026 08:00'],
        ], [
            '777' => ['caido_desde' => '18/11/2026 08:00', 'restablecido_en' => '19/11/2026 10:15'],
        ]);

        $this->assertSame('18/11/2026 08:00', $rows[0]['caido_desde']);
        $this->assertSame('19/11/2026 10:15', $rows[0]['restablecido_en']);
        $this->assertSame('01/11/2026 08:00', $rows[1]['caido_desde']);
        $this->assertSame('', $rows[1]['restablecido_en']);
    }

    public function test_si_el_prtg_dejo_la_subida_antes_de_la_caida_usa_el_ticket(): void
    {
        $service = new ExcelGoogleComparacionService($this->createMock(DashboardService::class));
        $marcas = $service->marcasRecuperacion(
            '2026-11-19 17:27:41',
            '2026-11-19 17:20:20',
            '2026-11-18 22:52:57',
            '2026-11-19 17:20:20',
        );

        $this->assertSame('18/11/2026 17:52', $marcas['caido_desde']);
        $this->assertSame('19/11/2026 12:20', $marcas['restablecido_en']);

        $prtg = $service->marcasRecuperacion(
            '2026-11-17 22:30:06',
            '2026-11-18 17:52:43',
            '2026-11-17 22:27:57',
            '2026-11-18 17:52:43',
        );

        $this->assertSame('17/11/2026 17:30', $prtg['caido_desde']);
        $this->assertSame('18/11/2026 12:52', $prtg['restablecido_en']);
    }

    public function test_el_horario_deja_fuera_caidas_anteriores(): void
    {
        $service = new ExcelGoogleComparacionService($this->createMock(DashboardService::class));
        $filtradas = $service->filtrarPorHorario([
            ['cid' => '1', 'caido_en' => '2026-11-19T14:00:00-05:00'],
            ['cid' => '2', 'caido_en' => '2026-11-18T10:00:00-05:00'],
        ], Carbon::parse('2026-11-19 00:00:00', 'America/Lima'), Carbon::parse('2026-11-19 23:59:59', 'America/Lima'));

        $this->assertSame(['1'], array_column($filtradas, 'cid'));
    }

    public function test_ignora_intermitencias(): void
    {
        $service = new ExcelGoogleComparacionService($this->createMock(DashboardService::class));

        $this->assertFalse($service->esCaidaTotal([
            'estado_prtg' => 'PARCIAL',
            'is_link_outage' => false,
        ]));
        $this->assertFalse($service->esCaidaTotal([
            'estado_prtg' => 'CAIDO',
            'is_link_outage' => true,
        ]));
        $this->assertTrue($service->esCaidaTotal([
            'estado_prtg' => 'CAIDO',
            'is_link_outage' => false,
        ]));
    }

    /**
     * @return array<string, mixed>
     */
    private function caida(string $cid, int $tss): array
    {
        return [
            'cid' => $cid,
            'tss' => $tss,
            'local_educativo' => 'LOCAL '.$tss,
            'provincia' => 'LORETO',
            'distrito' => 'NAUTA',
            'tecnologia' => 'P2P',
            'energy_type' => 'PANEL SOLAR',
            'caido_desde' => '19/11/2026 08:00',
            'incident_id' => $tss,
        ];
    }
}
