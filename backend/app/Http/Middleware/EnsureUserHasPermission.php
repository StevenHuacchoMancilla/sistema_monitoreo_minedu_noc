<?php

namespace App\Http\Middleware;

use App\Domain\Auth\PermissionCatalog;
use App\Enums\UserRole;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureUserHasPermission
{
    /**
     * @param  list<string>|string  ...$permissions
     */
    public function handle(Request $request, Closure $next, string ...$permissions): Response
    {
        $user = $request->user();

        if ($user === null) {
            return response()->json(['message' => 'No autenticado.'], 401);
        }

        $role = $user->role instanceof UserRole
            ? $user->role
            : UserRole::tryFrom((string) $user->role);

        if ($role === null) {
            return response()->json([
                'message' => 'No tienes permisos para realizar esta acción.',
            ], 403);
        }

        $required = [];
        foreach ($permissions as $permission) {
            foreach (explode(',', $permission) as $part) {
                $part = trim($part);
                if ($part !== '') {
                    $required[] = $part;
                }
            }
        }

        foreach ($required as $permission) {
            if (! PermissionCatalog::roleHas($role, $permission)) {
                return response()->json([
                    'message' => 'No tienes permisos para realizar esta acción.',
                ], 403);
            }
        }

        return $next($request);
    }
}
