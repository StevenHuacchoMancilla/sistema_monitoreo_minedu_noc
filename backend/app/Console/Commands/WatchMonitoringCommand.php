<?php

namespace App\Console\Commands;

use App\Domain\Monitoring\PRTG\Services\PrtgSyncService;
use App\Domain\Monitoring\Support\SyncCoordinator;
use Illuminate\Console\Command;
use Throwable;

class WatchMonitoringCommand extends Command
{
    protected $signature = 'monitoring:watch
                            {--prtg-interval= : Segundos entre sync PRTG (mínimo 30; default config)}';

    protected $description = 'Sincroniza PRTG en bucle continuo (intervalo ≥ 30s)';

    public function handle(PrtgSyncService $prtg): int
    {
        if (function_exists('set_time_limit')) {
            set_time_limit(0);
        }

        $configured = (int) config('prtg.sync_interval_seconds', 30);
        $option = $this->option('prtg-interval');
        $prtgInterval = max(30, $option !== null && $option !== '' ? (int) $option : $configured);
        $nextPrtg = 0;

        $this->info("Watch activo · PRTG cada {$prtgInterval}s · scope ".config('prtg.allowed_probe').' > '.config('prtg.allowed_root_group'));
        SyncCoordinator::touchWatchHeartbeat('PRTG');

        while (true) {
            $now = time();

            if ($now >= $nextPrtg && config('prtg.sync_enabled')) {
                SyncCoordinator::touchWatchHeartbeat('PRTG');
                try {
                    $summary = $prtg->sync();
                    if (! empty($summary['skipped'])) {
                        $this->line(now()->toTimeString().' PRTG SKIP · already_running');
                    } else {
                        $this->line(now()->toTimeString().' PRTG OK · procesados '.($summary['processed_count'] ?? 0));
                    }
                } catch (Throwable $e) {
                    $this->error(now()->toTimeString().' PRTG ERROR: '.$e->getMessage());
                }
                SyncCoordinator::touchWatchHeartbeat('PRTG');
                $nextPrtg = time() + $prtgInterval;
            }

            sleep(1);
        }
    }
}
