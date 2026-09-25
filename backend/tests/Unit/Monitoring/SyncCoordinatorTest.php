<?php

namespace Tests\Unit\Monitoring;

use App\Domain\Monitoring\Support\SyncCoordinator;
use App\Enums\SyncRunStatus;
use App\Models\SyncRun;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SyncCoordinatorTest extends TestCase
{
    use RefreshDatabase;

    public function test_last_finished_run_skips_artificial_failures(): void
    {
        SyncRun::query()->create([
            'source' => 'PRTG',
            'started_at' => now()->subMinutes(5),
            'finished_at' => now()->subMinutes(4),
            'status' => SyncRunStatus::Success,
            'processed_count' => 10,
        ]);

        SyncRun::query()->create([
            'source' => 'PRTG',
            'started_at' => now()->subMinutes(2),
            'finished_at' => now()->subMinute(),
            'status' => SyncRunStatus::Failed,
            'metadata' => ['error' => 'sync_interrupted'],
            'error_count' => 1,
        ]);

        $last = SyncCoordinator::lastFinishedRun('PRTG');

        $this->assertNotNull($last);
        $this->assertSame('SUCCESS', $last['status']);
        $this->assertSame(10, $last['processed_count']);
    }

    public function test_acquire_prevents_second_lock(): void
    {
        $first = SyncCoordinator::acquire('PRTG', 30);
        $this->assertNotNull($first);

        $second = SyncCoordinator::acquire('PRTG', 30);
        $this->assertNull($second);

        $first->release();

        $third = SyncCoordinator::acquire('PRTG', 30);
        $this->assertNotNull($third);
        $third->release();
    }
}
