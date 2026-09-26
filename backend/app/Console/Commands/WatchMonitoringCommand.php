<?php

namespace App\Console\Commands;

use App\Domain\Monitoring\PRTG\Services\PrtgSyncService;
use Illuminate\Console\Command;
use Throwable;

class WatchMonitoringCommand extends Command
{
    protected $signature = 'monitoring:watch
                            {--prtg-interval=30 : Segundos entre sync PRTG}';

    protected $description = 'Sincroniza PRTG en bucle continuo (tiempo casi real)';

    public function handle(PrtgSyncService $prtg): int
    {
        $prtgInterval = max(15, (int) $this->option('prtg-interval'));
        $nextPrtg = 0;

        $this->info("Watch activo · PRTG cada {$prtgInterval}s");

        while (true) {
            $now = time();

            if ($now >= $nextPrtg && config('prtg.sync_enabled')) {
                try {
                    $summary = $prtg->sync();
                    $this->line(now()->toTimeString().' PRTG OK · procesados '.($summary['processed_count'] ?? 0));
                } catch (Throwable $e) {
                    $this->error(now()->toTimeString().' PRTG ERROR: '.$e->getMessage());
                }
                $nextPrtg = time() + $prtgInterval;
            }

            sleep(1);
        }
    }
}
