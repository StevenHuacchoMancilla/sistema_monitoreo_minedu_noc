<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

if (config('prtg.sync_enabled')) {
    // Cada minuto: withoutOverlapping + SyncCoordinator evitan solapes.
    Schedule::command('prtg:sync')
        ->everyMinute()
        ->withoutOverlapping(5);
}
