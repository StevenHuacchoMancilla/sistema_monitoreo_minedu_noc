<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

if (config('prtg.sync_enabled')) {
    // Default 120s: evita solapes con syncs que tardan ~30–90s.
    $seconds = max(60, (int) config('prtg.sync_interval_seconds', 120));
    $minutes = max(1, (int) ceil($seconds / 60));

    Schedule::command('prtg:sync')
        ->cron("*/{$minutes} * * * *")
        ->withoutOverlapping(5);
}

if (config('cloudnet.sync_enabled')) {
    $cloudMinutes = max(1, (int) config('cloudnet.sync_interval_minutes', 5));
    Schedule::command('cloudnet:sync')
        ->cron("*/{$cloudMinutes} * * * *")
        ->withoutOverlapping(10);
}
