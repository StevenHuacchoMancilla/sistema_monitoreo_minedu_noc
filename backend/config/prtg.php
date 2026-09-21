<?php

return [

    'base_url' => env('PRTG_BASE_URL'),
    'api_token' => env('PRTG_API_TOKEN'),
    'allowed_probe' => env('PRTG_ALLOWED_PROBE', 'Sonda de clúster'),
    'allowed_root_group' => env('PRTG_ALLOWED_ROOT_GROUP', 'REGION LORETO'),
    'sync_enabled' => (bool) env('PRTG_SYNC_ENABLED', false),
    'sync_interval_seconds' => (int) env('PRTG_SYNC_INTERVAL_SECONDS', 30),

];
