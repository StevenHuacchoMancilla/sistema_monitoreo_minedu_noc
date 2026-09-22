<?php

namespace Tests\Feature\Schools;

use App\Enums\CidStatus;
use App\Models\NetworkAssignment;
use App\Models\School;
use App\Models\SchoolContact;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SchoolCrudTest extends TestCase
{
    use RefreshDatabase;

    public function test_can_create_and_update_school_with_string_phone(): void
    {
        $create = $this->postJson('/api/schools', [
            'codigo_local' => '364552',
            'local_educativo' => 'COLEGIO CRUD',
            'provincia' => 'MAYNAS',
            'distrito' => 'IQUITOS',
            'cid' => '258402',
            'tecnologia_acceso' => 'P2P',
        ]);

        $create->assertCreated();
        $schoolId = $create->json('school.id');
        $this->assertNotNull($schoolId);

        $this->putJson("/api/schools/{$schoolId}", [
            'local_educativo' => 'COLEGIO CRUD EDITADO',
            'codigo_local' => '364552',
        ])->assertOk()
            ->assertJsonPath('school.local_educativo', 'COLEGIO CRUD EDITADO');

        $contact = $this->postJson("/api/schools/{$schoolId}/contacts", [
            'position' => 1,
            'name' => 'Docente',
            'role' => 'Docente',
            'phone' => '065123456',
        ]);

        $contact->assertCreated();
        $this->assertSame('065123456', $contact->json('phone'));
        $this->assertIsString($contact->json('phone'));
    }

    public function test_historical_cid_reassignment_keeps_previous_assignment(): void
    {
        $school = School::query()->create([
            'codigo_local' => '111111',
            'local_educativo' => 'TEST REASSIGN',
            'active' => true,
        ]);

        $old = NetworkAssignment::query()->create([
            'school_id' => $school->id,
            'cid' => '100001',
            'cid_status' => CidStatus::Valid,
            'monitoring_eligible' => true,
            'is_active' => true,
            'valid_from' => now()->subDay(),
        ]);

        $response = $this->postJson("/api/schools/{$school->id}/reassign-cid", [
            'cid' => '100002',
            'tecnologia_acceso' => 'GPON',
            'prtg_device_name' => 'CID100002_TEST',
        ]);

        $response->assertCreated();
        $old->refresh();

        $this->assertFalse((bool) $old->is_active);
        $this->assertNotNull($old->valid_to);
        $this->assertDatabaseHas('network_assignments', [
            'school_id' => $school->id,
            'cid' => '100002',
            'is_active' => true,
        ]);
        $this->assertSame(2, NetworkAssignment::query()->where('school_id', $school->id)->count());
    }

    public function test_soft_deactivate_school_and_contact(): void
    {
        $school = School::query()->create([
            'codigo_local' => '222222',
            'local_educativo' => 'TEST DEACT',
            'active' => true,
        ]);

        $contact = SchoolContact::query()->create([
            'school_id' => $school->id,
            'position' => 1,
            'name' => 'A',
            'phone' => '999',
        ]);

        $this->postJson("/api/schools/{$school->id}/deactivate")->assertOk()
            ->assertJsonPath('school.active', false);

        $this->postJson("/api/schools/{$school->id}/contacts/{$contact->id}/deactivate")->assertOk();
        $this->assertSoftDeleted('school_contacts', ['id' => $contact->id]);
    }

    public function test_schools_index_returns_full_filter_catalog(): void
    {
        School::query()->create([
            'codigo_local' => '111',
            'local_educativo' => 'A',
            'provincia' => 'MAYNAS',
            'distrito' => 'IQUITOS',
            'active' => true,
        ]);
        School::query()->create([
            'codigo_local' => '222',
            'local_educativo' => 'B',
            'provincia' => 'REQUENA',
            'distrito' => 'PUINAHUA',
            'active' => true,
        ]);
        School::query()->create([
            'codigo_local' => '333',
            'local_educativo' => 'C',
            'provincia' => 'UCAYALI',
            'distrito' => 'CONTAMANA',
            'active' => true,
        ]);

        $response = $this->getJson('/api/schools?per_page=10&page=1');
        $response->assertOk();
        $this->assertLessThanOrEqual(10, count($response->json('data')));
        $this->assertContains('MAYNAS', $response->json('filters.provincias'));
        $this->assertContains('REQUENA', $response->json('filters.provincias'));
        $this->assertContains('UCAYALI', $response->json('filters.provincias'));
        $this->assertSame(3, $response->json('stats.total'));
        $this->assertCount(3, $response->json('filters.provincias'));
    }
}
