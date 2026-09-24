<?php

namespace Tests\Feature\Auth;

use App\Domain\Auth\PermissionCatalog;
use App\Enums\UserRole;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class RbacMatrixTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_can_access_users_and_profile_and_has_dashboard_permissions(): void
    {
        $this->actingAsUser(null, UserRole::Admin);

        $this->assertTrue(PermissionCatalog::roleHas(UserRole::Admin, PermissionCatalog::DASHBOARD_PRTG_VIEW));
        $this->assertTrue(PermissionCatalog::roleHas(UserRole::Admin, PermissionCatalog::DASHBOARD_CLOUDNET_VIEW));
        $this->getJson('/api/users')->assertOk();
        $this->getJson('/api/me')
            ->assertOk()
            ->assertJsonPath('data.role', 'ADMIN')
            ->assertJsonFragment(['permissions' => PermissionCatalog::forRole(UserRole::Admin)]);
        $this->getJson('/api/profile')->assertOk();
    }

    public function test_noc_operator_denied_dashboards_and_users_but_can_profile_and_actors(): void
    {
        $this->actingAsUser(null, UserRole::NocOperator);

        $this->getJson('/api/dashboard/prtg')->assertForbidden();
        $this->getJson('/api/dashboard/cloudnet')->assertForbidden();
        $this->getJson('/api/users')->assertForbidden();
        $this->getJson('/api/tracking/actors')->assertOk();
        $this->patchJson('/api/profile', [
            'name' => 'Peter Operador',
            'email' => 'peter.op@example.test',
        ])->assertOk()->assertJsonPath('data.name', 'Peter Operador');

        $me = $this->getJson('/api/me')->assertOk();
        $this->assertNotContains(PermissionCatalog::DASHBOARD_PRTG_VIEW, $me->json('data.permissions'));
        $this->assertNotContains(PermissionCatalog::USERS_MANAGE, $me->json('data.permissions'));
        $this->assertContains(PermissionCatalog::INCIDENTS_MANAGE, $me->json('data.permissions'));
    }

    public function test_viewer_read_only_mutations_forbidden_exports_allowed(): void
    {
        $this->actingAsUser(null, UserRole::Viewer);

        $this->assertTrue(PermissionCatalog::roleHas(UserRole::Viewer, PermissionCatalog::DASHBOARD_PRTG_VIEW));
        $this->assertTrue(PermissionCatalog::roleHas(UserRole::Viewer, PermissionCatalog::DASHBOARD_CLOUDNET_VIEW));
        // Middleware: VIEWER no es bloqueado (≠403). El body del dashboard puede fallar en sqlite.
        $this->assertNotSame(403, $this->getJson('/api/dashboard/prtg')->status());
        $this->assertNotSame(403, $this->getJson('/api/dashboard/cloudnet')->status());

        $this->getJson('/api/incidents')->assertOk();
        $this->getJson('/api/tracking')->assertOk();
        $this->getJson('/api/tracking/report')->assertOk();
        $this->getJson('/api/reports/operational')->assertOk();
        $this->getJson('/api/users')->assertForbidden();

        $this->postJson('/api/tracking', [])->assertForbidden();
        $this->postJson('/api/schools', [
            'local_educativo' => 'X',
            'codigo_local' => 'X1',
        ])->assertForbidden();

        $this->patchJson('/api/profile', [
            'name' => 'Viewer Solo',
            'email' => 'viewer@example.test',
        ])->assertOk();
    }

    public function test_profile_ignores_role_escalation(): void
    {
        $user = $this->actingAsUser(null, UserRole::NocOperator);

        $this->patchJson('/api/profile', [
            'name' => $user->name,
            'email' => $user->email,
            'role' => 'ADMIN',
            'active' => false,
        ])->assertOk();

        $user->refresh();
        $this->assertSame(UserRole::NocOperator, $user->role);
        $this->assertTrue($user->active);
    }

    public function test_viewer_cannot_escalate_via_profile(): void
    {
        $user = $this->actingAsUser(null, UserRole::Viewer);

        $this->patchJson('/api/profile', [
            'name' => $user->name,
            'email' => $user->email,
            'role' => 'ADMIN',
        ])->assertOk();

        $this->assertSame(UserRole::Viewer, $user->fresh()->role);
    }

    public function test_password_change_requires_current_password(): void
    {
        $user = User::factory()->create([
            'role' => UserRole::NocOperator,
            'active' => true,
            'password' => Hash::make('OldPass123!'),
        ]);
        $this->actingAs($user);

        $this->putJson('/api/profile/password', [
            'current_password' => 'wrong',
            'password' => 'NewPass123!',
            'password_confirmation' => 'NewPass123!',
        ])->assertStatus(422);

        $this->putJson('/api/profile/password', [
            'current_password' => 'OldPass123!',
            'password' => 'NewPass123!',
            'password_confirmation' => 'NewPass123!',
        ])->assertOk();

        $this->assertTrue(Hash::check('NewPass123!', $user->fresh()->password));
    }

    public function test_operator_cannot_patch_other_user_via_users_api(): void
    {
        $this->actingAsUser(null, UserRole::NocOperator);
        $other = User::factory()->create(['role' => UserRole::Viewer, 'active' => true]);

        $this->putJson('/api/users/'.$other->id, [
            'name' => 'Hacked',
            'email' => $other->email,
            'role' => 'ADMIN',
            'active' => true,
        ])->assertForbidden();
    }
}
