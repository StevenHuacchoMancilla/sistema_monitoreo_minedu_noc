<?php

use Illuminate\Foundation\Application;
use Illuminate\Http\Request;

define('LARAVEL_START', microtime(true));

// El server built-in de PHP es de un solo hilo. Probes tipo Chrome DevTools
// (/json/version) lo bloquean y el proxy de Vite responde API 502.
$uriPath = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
if ($uriPath === '/json/version' || str_starts_with($uriPath, '/json/')) {
    http_response_code(404);
    header('Content-Type: application/json');
    echo '{"message":"Not found"}';
    exit;
}

// Determine if the application is in maintenance mode...
if (file_exists($maintenance = __DIR__.'/../storage/framework/maintenance.php')) {
    require $maintenance;
}

// Register the Composer autoloader...
require __DIR__.'/../vendor/autoload.php';

// Bootstrap Laravel and handle the request...
/** @var Application $app */
$app = require_once __DIR__.'/../bootstrap/app.php';

$app->handleRequest(Request::capture());
