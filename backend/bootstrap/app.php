<?php

use App\Http\Middleware\EnsureUserHasPermission;
use App\Http\Middleware\EnsureUserHasRole;
use App\Http\Middleware\EnsureUserIsActive;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        // Render / reverse proxies: HTTPS y scheme correctos detrás del load balancer.
        $middleware->trustProxies(at: '*');

        $middleware->statefulApi();

        // SPA: no hay route('login') en Laravel. Sin esto, un 401 de API revienta con
        // "Route [login] not defined" (500) y el front interpreta fallo grave / te saca.
        $middleware->redirectGuestsTo(function (Request $request) {
            if ($request->is('api/*') || $request->expectsJson()) {
                return null;
            }

            return '/login';
        });

        $middleware->alias([
            'active' => EnsureUserIsActive::class,
            'role' => EnsureUserHasRole::class,
            'permission' => EnsureUserHasPermission::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*') || $request->expectsJson(),
        );
    })->create();
