<?php

namespace Tests\Feature\Tracking;

use App\Enums\CidStatus;
use App\Enums\TrackingStatus;
use App\Enums\UserRole;
use App\Models\NetworkAssignment;
use App\Models\School;
use App\Models\TrackingRecord;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class TrackingDateFiltersTest extends TestCase
{
    use RefreshDatabase;

    private int $n = 0;

    private function seedOpenedAt(string $limaDateTime, ?string $closedLima = null): TrackingRecord
    {
        $this->n++;
        $school = School::query()->create([
            'codigo_local' => (string) (370000 + $this->n),
            'local_educativo' => "COLEGIO FECHA {$this->n}",
            'current_sequence' => 100 + $this->n,
            'active' => true,
        ]);
        $assignment = NetworkAssignment::query()->create([
            'school_id' => $school->id,
            'cid' => (string) (259000 + $this->n),
            'cid_status' => CidStatus::Valid,
            'monitoring_eligible' => true,
            'is_active' => true,
        ]);
        $user = User::factory()->create(['role' => UserRole::NocOperator]);

        $opened = Carbon::parse($limaDateTime, 'America/Lima')->utc();
        $attrs = [
            'incident_number' => 5000 + $this->n,
            'school_id' => $school->id,
            'network_assignment_id' => $assignment->id,
            'tss_snapshot' => (string) (100 + $this->n),
            'cid_snapshot' => (string) (259000 + $this->n),
            'description' => "D{$this->n}",
            'status' => $closedLima ? TrackingStatus::Closed : TrackingStatus::InProgress,
            'opened_at' => $opened,
            'opened_by_user_id' => $user->id,
            'lock_version' => 1,
        ];
        if ($closedLima) {
            $attrs['closed_at'] = Carbon::parse($closedLima, 'America/Lima')->utc();
            $attrs['closed_by_user_id'] = $user->id;
        }

        return TrackingRecord::query()->create($attrs);
    }

    protected function setUp(): void
    {
        parent::setUp();
        $this->actingAsUser(null, UserRole::NocOperator);
    }

    public function test_opened_from_alone_includes_from_day_onward(): void
    {
        $this->seedOpenedAt('2026-09-19 12:00:00');
        $d20 = $this->seedOpenedAt('2026-09-20 08:00:00');
        $d21 = $this->seedOpenedAt('2026-09-21 23:30:00');

        $ids = collect($this->getJson('/api/tracking?opened_from=2026-09-20')->assertOk()->json('data'))
            ->pluck('id')
            ->all();

        $this->assertContains($d20->id, $ids);
        $this->assertContains($d21->id, $ids);
        $this->assertCount(2, $ids);
    }

    public function test_opened_to_alone_includes_up_to_end_of_day(): void
    {
        $d19 = $this->seedOpenedAt('2026-09-19 01:00:00');
        $d20 = $this->seedOpenedAt('2026-09-20 23:59:00');
        $this->seedOpenedAt('2026-09-21 00:15:00');

        $ids = collect($this->getJson('/api/tracking?opened_to=2026-09-20')->assertOk()->json('data'))
            ->pluck('id')
            ->all();

        $this->assertContains($d19->id, $ids);
        $this->assertContains($d20->id, $ids);
        $this->assertCount(2, $ids);
    }

    public function test_opened_range_is_inclusive(): void
    {
        $this->seedOpenedAt('2026-09-19 12:00:00');
        $d20 = $this->seedOpenedAt('2026-09-20 12:00:00');
        $d21 = $this->seedOpenedAt('2026-09-21 12:00:00');
        $this->seedOpenedAt('2026-09-22 12:00:00');

        $ids = collect(
            $this->getJson('/api/tracking?opened_from=2026-09-20&opened_to=2026-09-21')
                ->assertOk()
                ->json('data')
        )->pluck('id')->all();

        $this->assertEqualsCanonicalizing([$d20->id, $d21->id], $ids);
    }

    public function test_closed_from_and_to_work_independently(): void
    {
        $c19 = $this->seedOpenedAt('2026-09-18 10:00:00', '2026-09-19 15:00:00');
        $c20 = $this->seedOpenedAt('2026-09-18 10:00:00', '2026-09-20 15:00:00');
        $c21 = $this->seedOpenedAt('2026-09-18 10:00:00', '2026-09-21 15:00:00');

        $fromIds = collect($this->getJson('/api/tracking?closed_from=2026-09-20')->assertOk()->json('data'))
            ->pluck('id')->all();
        $this->assertEqualsCanonicalizing([$c20->id, $c21->id], $fromIds);

        $toIds = collect($this->getJson('/api/tracking?closed_to=2026-09-20')->assertOk()->json('data'))
            ->pluck('id')->all();
        $this->assertEqualsCanonicalizing([$c19->id, $c20->id], $toIds);
    }

    public function test_lima_midnight_belongs_to_calendar_day(): void
    {
        // 00:15 America/Lima del 23 → debe entrar en opened_from=2026-09-23
        $row = $this->seedOpenedAt('2026-09-23 00:15:00');
        $this->seedOpenedAt('2026-09-22 23:45:00');

        $ids = collect($this->getJson('/api/tracking?opened_from=2026-09-23&opened_to=2026-09-23')
            ->assertOk()
            ->json('data'))->pluck('id')->all();

        $this->assertSame([$row->id], $ids);
    }

    public function test_invalid_range_returns_friendly_validation_message(): void
    {
        $this->getJson('/api/tracking?opened_from=2026-09-22&opened_to=2026-09-20')
            ->assertStatus(422)
            ->assertJsonValidationErrors(['opened_to']);

        $message = (string) $this->getJson('/api/tracking?opened_from=2026-09-22&opened_to=2026-09-20')
            ->json('errors.opened_to.0');
        $this->assertStringContainsString('fecha inicial no puede ser posterior', mb_strtolower($message));
    }
}
