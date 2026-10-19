<?php

return [

    'base_url' => env('PRTG_BASE_URL'),
    'api_token' => env('PRTG_API_TOKEN'),
    'allowed_probe' => env('PRTG_ALLOWED_PROBE', 'Sonda de clúster'),
    'allowed_root_group' => env('PRTG_ALLOWED_ROOT_GROUP', 'REGION LORETO'),
    // Acepta CID al inicio (CID258…) o embebido (367145_CID258…).
    'device_cid_regex' => env('PRTG_DEVICE_CID_REGEX', '(?:^|_)CID(\\d+)'),
    'sync_enabled' => (bool) env('PRTG_SYNC_ENABLED', false),
    // Piso 30s (producto). Si el sync tarda más, SyncCoordinator evita solapes.
    'sync_interval_seconds' => max(30, (int) env('PRTG_SYNC_INTERVAL_SECONDS', 30)),
    'table_count' => (int) env('PRTG_TABLE_COUNT', 10000),
    // Heartbeat de `monitoring:watch` (segundos). Si es más viejo, el API puede spawn sync.
    'watch_heartbeat_ttl_seconds' => (int) env('PRTG_WATCH_HEARTBEAT_TTL', 90),

];
