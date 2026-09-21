<?php

namespace App\Jobs;

use App\Domain\Monitoring\PRTG\Services\PrtgSyncService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

class SyncPrtgJob implements ShouldQueue
{
    use Queueable;

    public function handle(PrtgSyncService $sync): void
    {
        $sync->sync();
    }
}
