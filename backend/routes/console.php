<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

if (config('prtg.sync_enabled')) {
    Schedule::command('prtg:sync')
        ->everyMinute()
        ->withoutOverlapping(2);
}

if (config('cloudnet.sync_enabled')) {
    $cloudMinutes = max(1, (int) config('cloudnet.sync_interval_minutes', 5));
    Schedule::command('cloudnet:sync')
        ->cron("*/{$cloudMinutes} * * * *")
        ->withoutOverlapping(10);
}
