<?php

namespace Tests\Feature\Users;

use App\Enums\UserRole;
use App\Models\AuditLog;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class UserAdminApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_can_list_create_update_and_reset_password(): void
    {
        $admin = $this->actingAsUser(null, UserRole::Admin);

        $this->getJson('/api/users')
            ->assertOk()
            ->assertJsonPath('meta.total', 1);

        $created = $this->postJson('/api/users', [
            'name' => 'Elias Operador',
            'email' => 'elias@noc.test',
            'password' => 'Secret123!',
            'password_confirmation' => 'Secret123!',
            'role' => UserRole::NocOperator->value,
        ]);

        $created->assertCreated()
            ->assertJsonPath('data.email', 'elias@noc.test')
            ->assertJsonPath('data.role', UserRole::NocOperator->value)
            ->assertJsonPath('data.active', true);

        $id = (int) $created->json('data.id');

        $this->putJson("/api/users/{$id}", [
            'name' => 'Elias NOC',
            'role' => UserRole::Viewer->value,
        ])
            ->assertOk()
            ->assertJsonPath('data.name', 'Elias NOC')
            ->assertJsonPath('data.role', UserRole::Viewer->value);

        $this->postJson("/api/users/{$id}/reset-password", [
            'password' => 'NuevaClave123!',
            'password_confirmation' => 'NuevaClave123!',
        ])->assertOk();

        $user = User::query()->findOrFail($id);
        $this->assertTrue(Hash::check('NuevaClave123!', $user->password));

        $this->assertTrue(AuditLog::query()->where('action', 'CREATE_USER')->exists());
        $this->assertTrue(AuditLog::query()->where('action', 'RESET_USER_PASSWORD')->where('user_id', $admin->id)->exists());
    }

    public function test_operator_and_viewer_cannot_manage_users(): void
    {
        $this->actingAsUser(null, UserRole::NocOperator);
        $this->getJson('/api/users')->assertForbidden();

        $this->actingAsUser(null, UserRole::Viewer);
        $this->postJson('/api/users', [
            'name' => 'X',
            'email' => 'x@test.com',
            'password' => 'Secret123!',
            'password_confirmation' => 'Secret123!',
            'role' => UserRole::Viewer->value,
        ])->assertForbidden();
    }

    public function test_cannot_deactivate_self_or_last_admin(): void
    {
        $admin = $this->actingAsUser(null, UserRole::Admin);

        $this->postJson("/api/users/{$admin->id}/deactivate")
            ->assertStatus(422);

        $this->assertTrue($admin->fresh()->active);
    }

    public function test_deactivate_and_reactivate_user(): void
    {
        $this->actingAsUser(null, UserRole::Admin);
        $op = User::factory()->create([
            'role' => UserRole::NocOperator,
            'active' => true,
            'email' => 'op@noc.test',
        ]);

        $this->postJson("/api/users/{$op->id}/deactivate")
            ->assertOk()
            ->assertJsonPath('data.active', false);

        $this->postJson("/api/users/{$op->id}/reactivate")
            ->assertOk()
            ->assertJsonPath('data.active', true);
    }

    public function test_cannot_demote_last_active_admin(): void
    {
        $admin = $this->actingAsUser(null, UserRole::Admin);

        $this->putJson("/api/users/{$admin->id}", [
            'role' => UserRole::NocOperator->value,
        ])->assertStatus(422);

        $this->assertSame(UserRole::Admin, $admin->fresh()->role);
    }
}
