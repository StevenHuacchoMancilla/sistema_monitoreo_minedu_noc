<?php

namespace Tests\Unit\Reports;

use App\Domain\Reports\Support\ListaLleeEstadoResolver;
use App\Enums\ListaLleeEstado;
use App\Enums\MonitoringStatus;
use App\Models\Incident;
use App\Models\PrtgSensor;
use Tests\TestCase;

class ListaLleeEstadoResolverTest extends TestCase
{
    public function test_without_manual_estado_returns_null(): void
    {
        $incident = new Incident([
            'root_cause_code' => 'LE05',
            'current_status' => MonitoringStatus::Caido->value,
        ]);

        $this->assertNull(ListaLleeEstadoResolver::resolve($incident));
    }

    public function test_manual_estado_is_used(): void
    {
        $incident = new Incident([
            'lista_llee_estado' => ListaLleeEstado::Energia->value,
            'root_cause_code' => 'LE05',
            'current_status' => MonitoringStatus::Caido->value,
        ]);

        $this->assertSame(ListaLleeEstado::Energia, ListaLleeEstadoResolver::resolve($incident));
    }

    public function test_prtg_mark_from_sensor(): void
    {
        $incident = new Incident(['current_status' => MonitoringStatus::Operativo->value]);
        $incident->setRelation('sensor', new PrtgSensor([
            'normalized_status' => MonitoringStatus::Operativo,
        ]));

        $this->assertSame('✔', ListaLleeEstadoResolver::prtgMark($incident));
    }

    public function test_zona_iquitos_default(): void
    {
        $this->assertSame('IQUITOS', ListaLleeEstadoResolver::zona('MAYNAS', 'IQUITOS'));
        $this->assertSame('YURIMAGUAS', ListaLleeEstadoResolver::zona('ALTO AMAZONAS', 'YURIMAGUAS'));
        $this->assertSame('PUCALLPA', ListaLleeEstadoResolver::zona('REQUENA', null));
    }
}
