<?php

return [
    'spreadsheet_id' => env('TICKETERA_SPREADSHEET_ID', '1baUVCcLpyhlZq3Zfo9YT2v-FiYv1uXI_GV0e-M5e24E'),
    'sheet' => env('TICKETERA_SHEET', 'TICKETERA'),
    'names_sheet' => env('TICKETERA_NAMES_SHEET', 'IMPLEMENTACION'),
    'timezone' => 'America/Lima',
    'cache_seconds' => (int) env('TICKETERA_CACHE_SECONDS', 20),
    // Opcional en Windows si PHP no trae el almacén de certificados.
    'ca_bundle' => env('TICKETERA_CA_BUNDLE', ''),
];
