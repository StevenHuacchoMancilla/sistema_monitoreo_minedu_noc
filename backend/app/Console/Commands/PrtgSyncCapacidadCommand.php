<?php

namespace App\Console\Commands;

use App\Domain\Monitoring\PRTG\Services\PrtgCapacitySyncService;
use Illuminate\Console\Command;

class PrtgSyncCapacidadCommand extends Command
{
    protected $signature = 'prtg:sync-capacidad';

    protected $description = 'Actualiza capacidad_mbps de cada colegio desde sensores PRTG TRANSMISION/RECEPCION';

    public function handle(PrtgCapacitySyncService $sync): int
    {
        $this->info('Sincronizando capacidad desde sensores TX/RX…');
        $stats = $sync->syncAll();
        $this->table(
            ['Escaneados', 'Actualizados', 'Sin cambio', 'Sin plan en nombre'],
            [[$stats['scanned'], $stats['updated'], $stats['unchanged'], $stats['without_plan']]]
        );

        return self::SUCCESS;
    }
}
