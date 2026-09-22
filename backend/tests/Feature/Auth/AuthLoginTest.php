<?php

namespace Tests\Feature\Auth;

use App\Enums\UserRole;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class AuthLoginTest extends TestCase
{
    use RefreshDatabase;

    public function test_login_success_returns_user_payload(): void
    {
        User::factory()->create([
            'email' => 'admin@noc.test',
            'password' => Hash::make('Secret123!'),
            'role' => UserRole::Admin,
            'active' => true,
            'name' => 'Admin Test',
        ]);

        $response = $this->asSpa()->postJson('/api/login', [
            'email' => 'admin@noc.test',
            'password' => 'Secret123!',
        ]);

        $response->assertOk()
            ->assertJsonPath('data.email', 'admin@noc.test')
            ->assertJsonPath('data.role', 'ADMIN')
            ->assertJsonPath('data.is_admin', true);

        $this->assertAuthenticated();
        $this->assertNotNull(User::query()->where('email', 'admin@noc.test')->value('last_login_at'));
    }

    public function test_login_invalid_credentials(): void
    {
        User::factory()->create([
            'email' => 'admin@noc.test',
            'password' => Hash::make('Secret123!'),
        ]);

        $this->asSpa()->postJson('/api/login', [
            'email' => 'admin@noc.test',
            'password' => 'wrong',
        ])->assertStatus(422)
            ->assertJsonValidationErrors(['email']);

        $this->assertGuest();
    }

    public function test_inactive_user_cannot_login(): void
    {
        User::factory()->inactive()->create([
            'email' => 'off@noc.test',
            'password' => Hash::make('Secret123!'),
            'role' => UserRole::NocOperator,
        ]);

        $this->asSpa()->postJson('/api/login', [
            'email' => 'off@noc.test',
            'password' => 'Secret123!',
        ])->assertStatus(422)
            ->assertJsonValidationErrors(['email']);

        $this->assertGuest();
    }

    public function test_me_requires_authentication(): void
    {
        $this->getJson('/api/me')->assertUnauthorized();
    }

    public function test_viewer_cannot_mutate_schools(): void
    {
        $this->actingAsUser(role: UserRole::Viewer);

        $this->postJson('/api/schools', [
            'codigo_local' => '364552',
            'local_educativo' => 'COLEGIO VIEWER',
            'provincia' => 'MAYNAS',
            'distrito' => 'IQUITOS',
        ])->assertForbidden();
    }

    public function test_logout_requires_auth_and_succeeds(): void
    {
        $this->asSpa()->postJson('/api/logout')->assertUnauthorized();

        $this->actingAsUser();
        $this->asSpa()->postJson('/api/logout')->assertOk()
            ->assertJsonPath('message', 'Sesión cerrada.');
    }
}
