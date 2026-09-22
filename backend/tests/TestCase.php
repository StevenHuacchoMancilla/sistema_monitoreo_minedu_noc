<?php

namespace Tests;

use App\Enums\UserRole;
use App\Models\User;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;

abstract class TestCase extends BaseTestCase
{
    protected function actingAsUser(?User $user = null, UserRole $role = UserRole::Admin): User
    {
        $user ??= User::factory()->create([
            'role' => $role,
            'active' => true,
        ]);

        $this->actingAs($user);

        return $user;
    }

    /**
     * Simula origen SPA para que Sanctum active cookies/sesión.
     */
    protected function asSpa(): static
    {
        return $this->withHeaders([
            'Origin' => 'http://localhost:5173',
            'Referer' => 'http://localhost:5173/',
        ]);
    }
}
