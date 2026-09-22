<?php

return [

    'base_url' => env('CLOUDNET_BASE_URL', 'https://oasiscloudapi.h3c.com'),
    'api_key' => env('CLOUDNET_API_KEY'),
    'sync_enabled' => (bool) env('CLOUDNET_SYNC_ENABLED', false),
    'sync_interval_minutes' => (int) env('CLOUDNET_SYNC_INTERVAL_MINUTES', 5),
    'inventory_sync_limit' => (int) env('CLOUDNET_INVENTORY_SYNC_LIMIT', 120),

];
