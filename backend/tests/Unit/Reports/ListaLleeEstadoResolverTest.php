<?php

namespace Tests\Unit\Reports;

use App\Domain\Reports\Support\ListaLleeEstadoResolver;
use App\Enums\ListaLleeEstado;
use App\Enums\MineduReason;
use App\Enums\MonitoringStatus;
use App\Models\Incident;
use App\Models\PrtgSensor;
use Tests\TestCase;

class ListaLleeEstadoResolverTest extends TestCase
{
    public function test_le05_maps_to_energia(): void
    {
        $incident = new Incident([
            'root_cause_code' => 'LE05',
            'current_status' => MonitoringStatus::Caido->value,
            'minedu_reason' => MineduReason::CaidaEnlace->value,
        ]);

        $this->assertSame(ListaLleeEstado::Energia, ListaLleeEstadoResolver::resolve($incident));
    }

    public function test_requerimiento_minedu_wins(): void
    {
        $incident = new Incident([
            'root_cause_code' => 'LE05',
            'current_status' => MonitoringStatus::Caido->value,
            'minedu_reason' => MineduReason::Requerimiento->value,
        ]);

        $this->assertSame(ListaLleeEstado::Requerimiento, ListaLleeEstadoResolver::resolve($incident));
    }

    public function test_le07_maps_to_equipos_apagados(): void
    {
        $incident = new Incident([
            'root_cause_code' => 'LE07',
            'current_status' => MonitoringStatus::Caido->value,
        ]);

        $this->assertSame(ListaLleeEstado::EquiposApagados, ListaLleeEstadoResolver::resolve($incident));
    }

    public function test_prtg_mark_from_sensor(): void
    {
        $incident = new Incident(['current_status' => MonitoringStatus::Operativo->value]);
        $incident->setRelation('sensor', new PrtgSensor([
            'normalized_status' => MonitoringStatus::Operativo,
        ]));

        $this->assertSame('✔', ListaLleeEstadoResolver::prtgMark($incident));
    }

    public function test_without_root_cause_is_descartes_en_curso(): void
    {
        $incident = new Incident([
            'current_status' => MonitoringStatus::Caido->value,
            'management_classification' => 'NEW_OUTAGE',
        ]);

        $this->assertSame(ListaLleeEstado::DescartesEnCurso, ListaLleeEstadoResolver::resolve($incident));
    }

    public function test_technical_code_is_averias(): void
    {
        $incident = new Incident([
            'root_cause_code' => 'MN05',
            'current_status' => MonitoringStatus::Caido->value,
        ]);

        $this->assertSame(ListaLleeEstado::Averias, ListaLleeEstadoResolver::resolve($incident));
    }
}
