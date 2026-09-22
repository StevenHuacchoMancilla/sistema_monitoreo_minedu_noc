<?php

namespace Tests\Feature\Audit;

use App\Enums\AuditModule;
use App\Enums\UserRole;
use App\Models\AuditLog;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class AuditLogModuleTest extends TestCase
{
    use RefreshDatabase;

    public function test_login_writes_auth_audit_with_user_and_module(): void
    {
        User::factory()->create([
            'email' => 'admin@noc.test',
            'password' => Hash::make('Secret123!'),
            'role' => UserRole::Admin,
            'active' => true,
            'name' => 'Admin Test',
        ]);

        $this->asSpa()->postJson('/api/login', [
            'email' => 'admin@noc.test',
            'password' => 'Secret123!',
        ])->assertOk();

        $log = AuditLog::query()->where('action', 'LOGIN')->latest('id')->first();
        $this->assertNotNull($log);
        $this->assertSame(AuditModule::Auth->value, $log->module);
        $this->assertSame('API', $log->source);
        $this->assertNotNull($log->user_id);
        $this->assertSame(User::class, $log->entity_type);
    }

    public function test_school_update_audits_authenticated_user_and_module(): void
    {
        $actor = $this->actingAsUser(role: UserRole::NocOperator);

        $create = $this->postJson('/api/schools', [
            'codigo_local' => '364552',
            'local_educativo' => 'COLEGIO AUDIT',
            'provincia' => 'MAYNAS',
            'distrito' => 'IQUITOS',
        ])->assertCreated();

        $schoolId = $create->json('school.id');

        $this->putJson("/api/schools/{$schoolId}", [
            'local_educativo' => 'COLEGIO AUDIT EDITADO',
            'codigo_local' => '364552',
        ])->assertOk();

        $log = AuditLog::query()->where('action', 'SCHOOL_UPDATED')->latest('id')->first();
        $this->assertNotNull($log);
        $this->assertSame(AuditModule::Schools->value, $log->module);
        $this->assertSame($actor->id, $log->user_id);
        $this->assertSame('API', $log->source);
    }

    public function test_viewer_forbidden_write_does_not_create_school_audit(): void
    {
        $before = AuditLog::query()->count();
        $this->actingAsUser(role: UserRole::Viewer);

        $this->postJson('/api/schools', [
            'codigo_local' => '364999',
            'local_educativo' => 'NO DEBE',
            'provincia' => 'MAYNAS',
            'distrito' => 'IQUITOS',
        ])->assertForbidden();

        $this->assertSame($before, AuditLog::query()->count());
    }
}
