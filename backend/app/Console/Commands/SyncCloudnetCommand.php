<?php

namespace App\Console\Commands;

use App\Domain\Monitoring\Cloudnet\Services\CloudnetSyncService;
use Illuminate\Console\Command;

class SyncCloudnetCommand extends Command
{
    protected $signature = 'cloudnet:sync';

    protected $description = 'Sincroniza sites Cloudnet/Oasis y los relaciona con asignaciones activas';

    public function handle(CloudnetSyncService $service): int
    {
        $this->info('Sincronizando Cloudnet...');
        $summary = $service->sync();
        $this->table(['Métrica', 'Valor'], collect($summary)->map(fn ($v, $k) => [$k, is_scalar($v) ? $v : json_encode($v)])->values()->all());

        return self::SUCCESS;
    }
}
