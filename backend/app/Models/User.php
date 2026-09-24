<?php

namespace App\Models;

use App\Enums\UserRole;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

#[Fillable(['name', 'email', 'password', 'role', 'active', 'last_login_at'])]
#[Hidden(['password', 'remember_token'])]
class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasApiTokens, HasFactory, Notifiable;

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'role' => UserRole::class,
            'active' => 'boolean',
            'last_login_at' => 'datetime',
        ];
    }

    public function isActive(): bool
    {
        return (bool) $this->active;
    }

    public function canWrite(): bool
    {
        return $this->role instanceof UserRole && $this->role->canWrite();
    }

    public function isAdmin(): bool
    {
        return $this->role instanceof UserRole && $this->role->isAdmin();
    }

    /**
     * @return list<string>
     */
    public function permissions(): array
    {
        return $this->role instanceof UserRole ? $this->role->permissions() : [];
    }

    public function hasPermission(string $permission): bool
    {
        return $this->role instanceof UserRole && $this->role->hasPermission($permission);
    }
}
