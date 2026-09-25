<?php

namespace App\Domain\Monitoring\Support;

use App\Enums\SyncRunStatus;
use App\Models\SyncRun;
use Illuminate\Contracts\Cache\Lock;
use Illuminate\Support\Facades\Cache;

/**
 * Coordina syncs concurrentes (HTTP + schedule + varias pestañas)
 * para no solapar llamadas a PRTG/Cloudnet ni marcar runs como Failed falsos.
 */
final class SyncCoordinator
{
    private const ARTIFICIAL_ERRORS = [
        'sync_interrupted',
        'sync_stale_timeout',
    ];

    public static function acquire(string $source, int $seconds = 300): ?Lock
    {
        $lock = Cache::lock(self::lockKey($source), $seconds);

        return $lock->get() ? $lock : null;
    }

    public static function lockKey(string $source): string
    {
        return 'monitoring:sync:'.strtolower($source);
    }

    /**
     * Cierra solo runs colgados (p. ej. worker muerto). No mata syncs activos.
     */
    public static function closeStaleRuns(string $source, int $staleMinutes = 10): int
    {
        return SyncRun::query()
            ->where('source', $source)
            ->whereNull('finished_at')
            ->where('started_at', '<', now()->subMinutes($staleMinutes))
            ->update([
                'status' => SyncRunStatus::Failed,
                'finished_at' => now(),
                'metadata' => ['error' => 'sync_stale_timeout'],
            ]);
    }

    /**
     * @return array{skipped: true, reason: string, status: string}
     */
    public static function skippedResponse(): array
    {
        return [
            'skipped' => true,
            'reason' => 'already_running',
            'status' => 'IN_PROGRESS',
        ];
    }

    /**
     * Último run terminado útil para el badge: ignora fallos artificiales
     * por solape (sync_interrupted / sync_stale_timeout).
     *
     * @return array<string, mixed>|null
     */
    public static function lastFinishedRun(string $source): ?array
    {
        $runs = SyncRun::query()
            ->where('source', $source)
            ->whereNotNull('finished_at')
            ->orderByDesc('id')
            ->limit(25)
            ->get();

        foreach ($runs as $run) {
            if (self::isArtificialFailure($run)) {
                continue;
            }

            return [
                'run_id' => (int) $run->id,
                'status' => $run->status?->value ?? (string) $run->status,
                'last_sync' => $run->finished_at?->toIso8601String(),
                'finished_at' => $run->finished_at?->toIso8601String(),
                'processed' => (int) $run->processed_count,
                'processed_count' => (int) $run->processed_count,
                'warnings' => (int) $run->warning_count,
                'warning_count' => (int) $run->warning_count,
                'errors' => (int) $run->error_count,
                'error_count' => (int) $run->error_count,
            ];
        }

        return null;
    }

    private static function isArtificialFailure(SyncRun $run): bool
    {
        $status = $run->status instanceof SyncRunStatus
            ? $run->status
            : SyncRunStatus::tryFrom((string) $run->status);

        if ($status !== SyncRunStatus::Failed) {
            return false;
        }

        $meta = is_array($run->metadata) ? $run->metadata : [];
        $error = (string) ($meta['error'] ?? '');

        return in_array($error, self::ARTIFICIAL_ERRORS, true);
    }
}
