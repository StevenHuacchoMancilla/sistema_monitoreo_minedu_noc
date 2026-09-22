<?php

return [

    'base_url' => env('PRTG_BASE_URL'),
    'api_token' => env('PRTG_API_TOKEN'),
    'allowed_probe' => env('PRTG_ALLOWED_PROBE', 'Sonda local'),
    'allowed_root_group' => env('PRTG_ALLOWED_ROOT_GROUP', 'Operadores Global Fiber página inicial'),
    'device_cid_regex' => env('PRTG_DEVICE_CID_REGEX', '^CID(\\d+)'),
    'sync_enabled' => (bool) env('PRTG_SYNC_ENABLED', false),
    'sync_interval_seconds' => (int) env('PRTG_SYNC_INTERVAL_SECONDS', 30),
    'table_count' => (int) env('PRTG_TABLE_COUNT', 10000),

];
