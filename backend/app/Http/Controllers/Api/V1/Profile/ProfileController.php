<?php

namespace App\Http\Controllers\Api\V1\Profile;

use App\Enums\AuditModule;
use App\Enums\AuditSource;
use App\Enums\UserRole;
use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\AuditLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rules\Password;
use Illuminate\Validation\ValidationException;

class ProfileController extends Controller
{
    public function __construct(private readonly AuditLogger $audit) {}

    public function show(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        return response()->json([
            'data' => $this->payload($user),
        ]);
    }

    public function update(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        $data = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'email' => ['required', 'email', 'max:190', 'unique:users,email,'.$user->id],
        ]);

        // Whitelist estricta: ignorar role/active/permissions si llegan en el body.
        $before = [
            'name' => $user->name,
            'email' => $user->email,
        ];

        $user->forceFill([
            'name' => $data['name'],
            'email' => $data['email'],
        ])->save();

        $this->audit->record(
            entity: $user,
            action: 'PROFILE_UPDATED',
            before: $before,
            after: [
                'name' => $user->name,
                'email' => $user->email,
            ],
            module: AuditModule::Auth,
            source: AuditSource::Api,
            userId: $user->id,
        );

        return response()->json([
            'data' => $this->payload($user->fresh()),
            'message' => 'Perfil actualizado.',
        ]);
    }

    public function updatePassword(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        $data = $request->validate([
            'current_password' => ['required', 'string'],
            'password' => ['required', 'confirmed', Password::defaults()],
        ]);

        if (! Hash::check($data['current_password'], (string) $user->password)) {
            throw ValidationException::withMessages([
                'current_password' => ['La contraseña actual no es correcta.'],
            ]);
        }

        $user->forceFill([
            'password' => $data['password'],
        ])->save();

        $this->audit->record(
            entity: $user,
            action: 'PASSWORD_CHANGED',
            before: null,
            after: ['changed' => true],
            module: AuditModule::Auth,
            source: AuditSource::Api,
            userId: $user->id,
        );

        return response()->json([
            'message' => 'Contraseña actualizada.',
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function payload(User $user): array
    {
        $role = $user->role instanceof UserRole
            ? $user->role
            : UserRole::from((string) $user->role);

        return [
            'id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'role' => $role->value,
            'role_label' => $role->label(),
            'active' => (bool) $user->active,
            'last_login_at' => $user->last_login_at?->toIso8601String(),
        ];
    }
}
