<?php

namespace Tests\Feature\Tracking;

use App\Enums\CidStatus;
use App\Enums\DatePrecision;
use App\Enums\TrackingStatus;
use App\Enums\UserRole;
use App\Models\NetworkAssignment;
use App\Models\School;
use App\Models\TrackingRecord;
use App\Models\TrackingUpdate;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class TrackingListApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->actingAsUser();
    }

    public function test_lists_trackings_with_kpis_and_pagination(): void
    {
        $opener = User::factory()->create(['name' => 'Elias', 'role' => UserRole::NocOperator]);
        $school = School::query()->create([
            'codigo_local' => '364552',
            'local_educativo' => 'COLEGIO LISTA',
            'current_sequence' => 77,
            'active' => true,
        ]);
        $assignment = NetworkAssignment::query()->create([
            'school_id' => $school->id,
            'cid' => '258440',
            'cid_status' => CidStatus::Valid,
            'is_active' => true,
            'monitoring_eligible' => true,
            'prtg_province' => 'MAYNAS',
            'prtg_district' => 'IQUITOS',
        ]);

        $open = TrackingRecord::query()->create([
            'incident_number' => 101,
            'school_id' => $school->id,
            'network_assignment_id' => $assignment->id,
            'ticket' => 'INC77_258440',
            'tss_snapshot' => '77',
            'cid_snapshot' => '258440',
            'description' => 'LINK DOWN CID258440',
            'status' => TrackingStatus::Open,
            'opened_at' => now()->subDay(),
            'opened_at_precision' => DatePrecision::Date,
            'opened_by_user_id' => $opener->id,
            'lock_version' => 1,
        ]);
        TrackingUpdate::query()->create([
            'tracking_record_id' => $open->id,
            'event_type' => 'COMMENT',
            'body' => 'Primer seguimiento de prueba',
            'created_by_user_id' => $opener->id,
        ]);

        TrackingRecord::query()->create([
            'incident_number' => 102,
            'school_id' => $school->id,
            'network_assignment_id' => $assignment->id,
            'tss_snapshot' => '77',
            'cid_snapshot' => '258440',
            'description' => 'LINK DOWN cerrado',
            'status' => TrackingStatus::Closed,
            'opened_at' => now()->subDays(2),
            'opened_by_legacy_name' => 'Alvaro',
            'closed_at' => now(),
            'closed_by_legacy_name' => 'Judith',
            'lock_version' => 1,
        ]);

        $response = $this->getJson('/api/tracking?per_page=25');
        $response->assertOk()
            ->assertJsonPath('meta.total', 2)
            ->assertJsonPath('kpis.abiertos', 1)
            ->assertJsonPath('kpis.total_periodo', 2);

        $this->assertSame('Primer seguimiento de prueba', $response->json('data.0.last_update_preview'));

        $filtered = $this->getJson('/api/tracking?status=OPEN&q=258440&provincia=MAYNAS');
        $filtered->assertOk()->assertJsonPath('meta.total', 1);

        $byOpener = $this->getJson('/api/tracking?opened_by='.$opener->id);
        $byOpener->assertOk()->assertJsonPath('meta.total', 1);

        $summary = $this->getJson('/api/tracking/summary');
        $summary->assertOk()->assertJsonPath('data.abiertos', 1);
    }

    public function test_tracking_list_requires_auth(): void
    {
        auth()->logout();
        $this->app['auth']->forgetGuards();

        $this->getJson('/api/tracking')->assertUnauthorized();
    }
}
