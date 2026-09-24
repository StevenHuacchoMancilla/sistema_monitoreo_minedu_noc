<?php

namespace App\Domain\Users\Services;

use App\Enums\AuditModule;
use App\Enums\AuditSource;
use App\Enums\UserRole;
use App\Models\User;
use App\Services\AuditLogger;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class UserAdminService
{
    public function __construct(private readonly AuditLogger $audit) {}

    /**
     * @param  array<string, mixed>  $filters
     * @return LengthAwarePaginator<int, User>
     */
    public function list(array $filters): LengthAwarePaginator
    {
        $perPage = (int) ($filters['per_page'] ?? 25);
        if ($perPage < 10) {
            $perPage = 10;
        }
        if ($perPage > 100) {
            $perPage = 100;
        }

        $q = User::query()->orderBy('name');

        $search = trim((string) ($filters['q'] ?? $filters['search'] ?? ''));
        if ($search !== '') {
            $like = '%'.mb_strtolower($search).'%';
            $q->where(function ($inner) use ($like) {
                $inner->whereRaw('lower(name) like ?', [$like])
                    ->orWhereRaw('lower(email) like ?', [$like]);
            });
        }

        $role = strtoupper(trim((string) ($filters['role'] ?? '')));
        if ($role !== '' && in_array($role, UserRole::values(), true)) {
            $q->where('role', $role);
        }

        $active = $filters['active'] ?? null;
        if ($active !== null && $active !== '' && $active !== 'all') {
            $isActive = in_array((string) $active, ['1', 'true', 'yes'], true);
            $q->where('active', $isActive);
        }

        return $q->paginate($perPage);
    }

    /**
     * @param  array{name: string, email: string, password: string, role: string, active?: bool}  $data
     */
    public function create(array $data, int $actorId): User
    {
        $role = UserRole::from(strtoupper((string) $data['role']));

        $user = User::query()->create([
            'name' => trim((string) $data['name']),
            'email' => mb_strtolower(trim((string) $data['email'])),
            'password' => $data['password'],
            'role' => $role,
            'active' => array_key_exists('active', $data) ? (bool) $data['active'] : true,
        ]);

        $this->audit->record(
            $user,
            'CREATE_USER',
            null,
            $this->auditSnapshot($user),
            AuditModule::Users,
            AuditSource::Api,
            $actorId
        );

        return $user;
    }

    /**
     * @param  array{name?: string, email?: string, role?: string}  $data
     */
    public function update(User $user, array $data, int $actorId): User
    {
        $before = $this->auditSnapshot($user);

        if (isset($data['name'])) {
            $user->name = trim((string) $data['name']);
        }
        if (isset($data['email'])) {
            $user->email = mb_strtolower(trim((string) $data['email']));
        }
        if (isset($data['role'])) {
            $newRole = UserRole::from(strtoupper((string) $data['role']));
            $this->assertCanChangeRole($user, $newRole, $actorId);
            $user->role = $newRole;
        }

        $user->save();

        $this->audit->record(
            $user,
            'UPDATE_USER',
            $before,
            $this->auditSnapshot($user),
            AuditModule::Users,
            AuditSource::Api,
            $actorId
        );

        return $user->fresh() ?? $user;
    }

    public function deactivate(User $user, int $actorId): User
    {
        if ($user->id === $actorId) {
            throw ValidationException::withMessages([
                'user' => ['No puedes desactivar tu propia cuenta.'],
            ]);
        }

        if (! $user->active) {
            return $user;
        }

        $this->assertNotLastActiveAdmin($user);

        return DB::transaction(function () use ($user, $actorId) {
            $before = $this->auditSnapshot($user);
            $user->active = false;
            $user->save();

            $this->audit->record(
                $user,
                'DEACTIVATE_USER',
                $before,
                $this->auditSnapshot($user),
                AuditModule::Users,
                AuditSource::Api,
                $actorId
            );

            return $user->fresh() ?? $user;
        });
    }

    public function reactivate(User $user, int $actorId): User
    {
        if ($user->active) {
            return $user;
        }

        $before = $this->auditSnapshot($user);
        $user->active = true;
        $user->save();

        $this->audit->record(
            $user,
            'REACTIVATE_USER',
            $before,
            $this->auditSnapshot($user),
            AuditModule::Users,
            AuditSource::Api,
            $actorId
        );

        return $user->fresh() ?? $user;
    }

    /**
     * @param  array{password: string}  $data
     */
    public function resetPassword(User $user, array $data, int $actorId): User
    {
        $before = ['id' => $user->id, 'email' => $user->email];

        $user->password = $data['password'];
        $user->setRememberToken(null);
        $user->save();

        $this->audit->record(
            $user,
            'RESET_USER_PASSWORD',
            $before,
            ['id' => $user->id, 'email' => $user->email, 'password_reset' => true],
            AuditModule::Users,
            AuditSource::Api,
            $actorId
        );

        return $user->fresh() ?? $user;
    }

    /**
     * @return array<string, mixed>
     */
    public function toApiArray(User $user): array
    {
        $role = $user->role instanceof UserRole
            ? $user->role
            : UserRole::tryFrom((string) $user->role);

        return [
            'id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'role' => $role?->value,
            'role_label' => $role?->label(),
            'active' => (bool) $user->active,
            'last_login_at' => $user->last_login_at?->toIso8601String(),
            'can_write' => $role?->canWrite() ?? false,
            'is_admin' => $role?->isAdmin() ?? false,
            'permissions' => $role?->permissions() ?? [],
            'created_at' => $user->created_at?->toIso8601String(),
            'updated_at' => $user->updated_at?->toIso8601String(),
        ];
    }

    private function assertCanChangeRole(User $user, UserRole $newRole, int $actorId): void
    {
        $current = $user->role instanceof UserRole
            ? $user->role
            : UserRole::tryFrom((string) $user->role);

        if ($current === $newRole) {
            return;
        }

        if ($current === UserRole::Admin && $newRole !== UserRole::Admin) {
            $this->assertNotLastActiveAdmin($user);
        }

        if ($user->id === $actorId && $newRole !== UserRole::Admin) {
            throw ValidationException::withMessages([
                'role' => ['No puedes quitarte el rol de administrador a ti mismo.'],
            ]);
        }
    }

    private function assertNotLastActiveAdmin(User $user): void
    {
        $isAdmin = $user->role instanceof UserRole
            ? $user->role->isAdmin()
            : ((string) $user->role === UserRole::Admin->value);

        if (! $isAdmin || ! $user->active) {
            return;
        }

        $otherAdmins = User::query()
            ->where('role', UserRole::Admin->value)
            ->where('active', true)
            ->where('id', '!=', $user->id)
            ->count();

        if ($otherAdmins === 0) {
            throw ValidationException::withMessages([
                'user' => ['Debe quedar al menos un administrador activo.'],
            ]);
        }
    }

    /**
     * @return array<string, mixed>
     */
    private function auditSnapshot(User $user): array
    {
        $role = $user->role instanceof UserRole
            ? $user->role->value
            : (string) $user->role;

        return [
            'id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'role' => $role,
            'active' => (bool) $user->active,
        ];
    }
}
