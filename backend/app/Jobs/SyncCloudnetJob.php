<?php

namespace App\Jobs;

use App\Domain\Monitoring\Cloudnet\Services\CloudnetSyncService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

class SyncCloudnetJob implements ShouldQueue
{
    use Queueable;

    public function handle(CloudnetSyncService $sync): void
    {
        $sync->sync();
    }
}
