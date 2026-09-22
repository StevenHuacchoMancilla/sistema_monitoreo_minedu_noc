<?php

namespace App\Http\Middleware;

use App\Enums\UserRole;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureUserHasRole
{
    /**
     * @param  list<string>|string  ...$roles
     */
    public function handle(Request $request, Closure $next, string ...$roles): Response
    {
        $user = $request->user();

        if ($user === null) {
            return response()->json(['message' => 'No autenticado.'], 401);
        }

        $allowed = [];
        foreach ($roles as $role) {
            foreach (explode(',', $role) as $part) {
                $part = trim($part);
                if ($part !== '') {
                    $allowed[] = $part;
                }
            }
        }

        $current = $user->role instanceof UserRole
            ? $user->role->value
            : (string) $user->role;

        if ($allowed !== [] && ! in_array($current, $allowed, true)) {
            return response()->json([
                'message' => 'No tienes permiso para esta acción.',
            ], 403);
        }

        return $next($request);
    }
}
