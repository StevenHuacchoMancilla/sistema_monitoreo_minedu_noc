<?php

namespace App\Console\Commands;

use App\Domain\Monitoring\PRTG\Services\PrtgSyncService;
use Illuminate\Console\Command;

class SyncPrtgCommand extends Command
{
    protected $signature = 'prtg:sync';

    protected $description = 'Sincroniza sensores PRTG (Sonda local → Operadores Global Fiber página inicial)';

    public function handle(PrtgSyncService $service): int
    {
        $this->info('Sincronizando PRTG...');
        $summary = $service->sync();
        $this->table(['Métrica', 'Valor'], collect($summary)->map(fn ($v, $k) => [$k, is_scalar($v) ? $v : json_encode($v)])->values()->all());

        return self::SUCCESS;
    }
}
