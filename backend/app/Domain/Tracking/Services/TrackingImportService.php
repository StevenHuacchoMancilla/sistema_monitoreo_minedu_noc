<?php

namespace App\Domain\Tracking\Services;

use App\Domain\Tracking\Support\TrackingDateParser;
use App\Domain\Tracking\Support\TrackingExcelReader;
use App\Domain\Tracking\Support\TrackingFollowupParser;
use App\Enums\AuditModule;
use App\Enums\AuditSource;
use App\Enums\SyncIssueSeverity;
use App\Enums\SyncRunStatus;
use App\Enums\TrackingEventType;
use App\Enums\TrackingStatus;
use App\Enums\TrackingTechnicalStatus;
use App\Models\School;
use App\Models\SyncIssue;
use App\Models\SyncRun;
use App\Models\TrackingRecord;
use App\Models\TrackingUpdate;
use App\Models\User;
use App\Services\AuditLogger;
use App\Support\Normalization\IdentifierNormalizer;
use Illuminate\Support\Facades\DB;
use Throwable;

class TrackingImportService
{
    public function __construct(
        private readonly TrackingExcelReader $reader,
        private readonly TrackingDateParser $dates,
        private readonly TrackingFollowupParser $followups,
        private readonly TrackingSchoolResolver $schools,
        private readonly AuditLogger $audit,
    ) {}

    /**
     * @return array<string, mixed>
     */
    public function import(string $path, int $year, bool $dryRun = false, bool $force = false): array
    {
        $run = SyncRun::query()->create([
            'source' => 'TRACKING_GENERAL_IMPORT',
            'started_at' => now(),
            'status' => SyncRunStatus::Success->value,
            'metadata' => [
                'file' => basename($path),
                'year' => $year,
                'dry_run' => $dryRun,
                'force' => $force,
            ],
        ]);

        $summary = [
            'sync_run_id' => $run->id,
            'status' => SyncRunStatus::Success->value,
            'received_count' => 0,
            'processed_count' => 0,
            'created_count' => 0,
            'updated_count' => 0,
            'skipped_count' => 0,
            'mismatch_count' => 0,
            'not_found_count' => 0,
            'warning_count' => 0,
            'error_count' => 0,
            'updates_created' => 0,
            'dry_run' => $dryRun,
        ];

        try {
            $rows = $this->reader->read($path);
            $summary['received_count'] = count($rows);
            $run->update(['received_count' => count($rows)]);

            $userMap = $this->buildUserNameMap();

            foreach ($rows as $row) {
                $this->importRow($row, $year, $dryRun, $force, $userMap, $run, $summary);
            }

            $status = SyncRunStatus::Success;
            if ($summary['processed_count'] === 0 && ($summary['error_count'] > 0 || $summary['mismatch_count'] > 0)) {
                $status = SyncRunStatus::Failed;
            } elseif (
                $summary['error_count'] > 0
                || $summary['warning_count'] > 0
                || $summary['mismatch_count'] > 0
                || $summary['not_found_count'] > 0
            ) {
                $status = SyncRunStatus::SuccessWithWarnings;
            }

            $summary['status'] = $status->value;
            $run->update([
                'finished_at' => now(),
                'status' => $status->value,
                'processed_count' => $summary['processed_count'],
                'created_count' => $summary['created_count'],
                'updated_count' => $summary['updated_count'],
                'ignored_count' => $summary['skipped_count'],
                'warning_count' => $summary['warning_count'] + $summary['mismatch_count'] + $summary['not_found_count'],
                'error_count' => $summary['error_count'],
                'metadata' => array_merge($run->metadata ?? [], [
                    'updates_created' => $summary['updates_created'],
                    'mismatch_count' => $summary['mismatch_count'],
                    'not_found_count' => $summary['not_found_count'],
                ]),
            ]);
        } catch (Throwable $e) {
            $summary['status'] = SyncRunStatus::Failed->value;
            $summary['error_count']++;
            $this->issue($run, SyncIssueSeverity::Error, 'TRACKING_IMPORT_FAILED', null, null, null, $e->getMessage(), []);
            $run->update([
                'finished_at' => now(),
                'status' => SyncRunStatus::Failed->value,
                'error_count' => $summary['error_count'],
            ]);
        }

        return $summary;
    }

    /**
     * @param  array<string, mixed>  $row
     * @param  array<string, int>  $userMap
     * @param  array<string, mixed>  $summary
     */
    private function importRow(
        array $row,
        int $year,
        bool $dryRun,
        bool $force,
        array $userMap,
        SyncRun $run,
        array &$summary,
    ): void {
        $incidentNumber = (int) preg_replace('/\D+/', '', (string) $row['incident_number']);
        if ($incidentNumber <= 0) {
            $this->issue(
                $run,
                SyncIssueSeverity::Warning,
                'TRACKING_INVALID_NUMBER',
                $row['__row'],
                $row['cid'] ?? null,
                $row['tss'] ?? null,
                'N° incidente inválido.',
                ['raw' => $row['incident_number']]
            );
            $summary['warning_count']++;
            $summary['skipped_count']++;

            return;
        }

        $existing = TrackingRecord::query()->where('incident_number', $incidentNumber)->first();
        if ($existing && ! $force) {
            $this->issue(
                $run,
                SyncIssueSeverity::Warning,
                'TRACKING_ALREADY_IMPORTED',
                $row['__row'],
                $row['cid'] ?? null,
                $row['tss'] ?? null,
                "Tracking N° {$incidentNumber} ya existe; se omite (usa --force para reemplazar).",
                ['tracking_record_id' => $existing->id]
            );
            $summary['warning_count']++;
            $summary['skipped_count']++;

            return;
        }

        $resolved = $this->schools->resolve($row['cid'] ?? null, $row['tss'] ?? null);
        if (! $resolved['ok']) {
            $code = $resolved['code'] ?? 'TRACKING_SCHOOL_NOT_FOUND';
            $severity = $code === 'TRACKING_SCHOOL_MISMATCH'
                ? SyncIssueSeverity::Error
                : SyncIssueSeverity::Warning;

            $this->issue(
                $run,
                $severity,
                $code,
                $row['__row'],
                $row['cid'] ?? null,
                $row['tss'] ?? null,
                $resolved['message'] ?? 'Sin colegio',
                $resolved['payload']
            );

            if ($code === 'TRACKING_SCHOOL_MISMATCH') {
                $summary['mismatch_count']++;
                $summary['error_count']++;
            } else {
                $summary['not_found_count']++;
                $summary['warning_count']++;
            }
            $summary['skipped_count']++;

            return;
        }

        if ($resolved['code'] === 'TRACKING_CID_NOT_FOUND') {
            $this->issue(
                $run,
                SyncIssueSeverity::Warning,
                'TRACKING_CID_NOT_FOUND',
                $row['__row'],
                $row['cid'] ?? null,
                $row['tss'] ?? null,
                $resolved['message'] ?? 'CID no encontrado',
                $resolved['payload']
            );
            $summary['warning_count']++;
        }

        $opened = $this->dates->parse($row['opened_raw'], $row['opened_fmt'], $year);
        if ($opened === null) {
            $this->issue(
                $run,
                SyncIssueSeverity::Error,
                'TRACKING_OPENED_AT_INVALID',
                $row['__row'],
                $row['cid'] ?? null,
                $row['tss'] ?? null,
                'Fecha de apertura inválida.',
                ['raw' => $row['opened_raw'], 'fmt' => $row['opened_fmt']]
            );
            $summary['error_count']++;
            $summary['skipped_count']++;

            return;
        }

        $closedParsed = $this->dates->parse($row['closed_raw'], $row['closed_fmt'], $year);
        $closedByName = IdentifierNormalizer::text($row['closed_by'] ?? null);
        $isClosed = $closedParsed !== null || $closedByName !== null;

        if ($isClosed && $closedParsed === null) {
            $this->issue(
                $run,
                SyncIssueSeverity::Warning,
                'TRACKING_CLOSE_DATE_MISSING',
                $row['__row'],
                $row['cid'] ?? null,
                $row['tss'] ?? null,
                'Hay nombre de cierre pero sin fecha de cierre válida.',
                ['closed_by' => $closedByName, 'closed_fmt' => $row['closed_fmt']]
            );
            $summary['warning_count']++;
        }

        if ($isClosed && $closedByName === null) {
            $this->issue(
                $run,
                SyncIssueSeverity::Warning,
                'TRACKING_CLOSE_NAME_MISSING',
                $row['__row'],
                $row['cid'] ?? null,
                $row['tss'] ?? null,
                'Hay fecha de cierre pero sin nombre de cierre.',
                ['closed_fmt' => $row['closed_fmt']]
            );
            $summary['warning_count']++;
        }

        $followupItems = $this->followups->parse((string) ($row['seguimiento'] ?? ''), $year);
        $status = $isClosed
            ? TrackingStatus::Closed
            : ($followupItems !== [] ? TrackingStatus::InProgress : TrackingStatus::Open);

        $openedByName = IdentifierNormalizer::text($row['opened_by'] ?? null);
        $openedByUserId = $openedByName !== null ? ($userMap[IdentifierNormalizer::normalizeName($openedByName)] ?? null) : null;
        $closedByUserId = $closedByName !== null ? ($userMap[IdentifierNormalizer::normalizeName($closedByName)] ?? null) : null;

        /** @var School $school */
        $school = $resolved['school'];
        $assignment = $resolved['assignment'];

        if ($dryRun) {
            $summary['processed_count']++;
            if ($existing) {
                $summary['updated_count']++;
            } else {
                $summary['created_count']++;
            }
            $summary['updates_created'] += count($followupItems);

            return;
        }

        DB::transaction(function () use (
            $existing,
            $force,
            $incidentNumber,
            $row,
            $school,
            $assignment,
            $opened,
            $closedParsed,
            $isClosed,
            $status,
            $openedByName,
            $openedByUserId,
            $closedByName,
            $closedByUserId,
            $followupItems,
            &$summary,
        ) {
            if ($existing && $force) {
                $existing->updates()->delete();
                $existing->delete();
                $summary['updated_count']++;
            } else {
                $summary['created_count']++;
            }

            $tracking = TrackingRecord::query()->create([
                'incident_number' => $incidentNumber,
                'incident_id' => null,
                'school_id' => $school->id,
                'network_assignment_id' => $assignment?->id,
                'ticket' => IdentifierNormalizer::text($row['ticket'] ?? null),
                'tss_snapshot' => IdentifierNormalizer::identifier($row['tss'] ?? null),
                'cid_snapshot' => IdentifierNormalizer::identifier($row['cid'] ?? null),
                'description' => IdentifierNormalizer::text($row['description'] ?? null),
                'status' => $status,
                'technical_status' => $isClosed
                    ? TrackingTechnicalStatus::Recovered
                    : TrackingTechnicalStatus::Down,
                'opened_at' => $opened['at'],
                'opened_at_precision' => $opened['precision'],
                'opened_by_user_id' => $openedByUserId,
                'opened_by_legacy_name' => $openedByUserId ? null : $openedByName,
                'closed_at' => $isClosed ? ($closedParsed['at'] ?? $opened['at']) : null,
                'closed_at_precision' => $isClosed
                    ? ($closedParsed['precision'] ?? $opened['precision'])
                    : null,
                'closed_by_user_id' => $isClosed ? $closedByUserId : null,
                'closed_by_legacy_name' => $isClosed && ! $closedByUserId ? $closedByName : null,
                'closing_note' => null,
                'technical_recovered_at' => $isClosed ? ($closedParsed['at'] ?? null) : null,
                'lock_version' => 1,
            ]);

            foreach ($followupItems as $item) {
                TrackingUpdate::query()->create([
                    'tracking_record_id' => $tracking->id,
                    'event_type' => TrackingEventType::Comment,
                    'body' => $item['body'],
                    'created_by_user_id' => null,
                    'legacy_actor_name' => 'Histórico',
                    'occurred_on' => $item['occurred_on'],
                    'occurred_at' => null,
                ]);
                $summary['updates_created']++;
            }

            $this->audit->record(
                $tracking,
                'TRACKING_IMPORTED',
                null,
                $tracking->toSummaryArray(),
                AuditModule::TrackingGeneral,
                AuditSource::Import
            );

            $summary['processed_count']++;
        });
    }

    /**
     * @return array<string, int>
     */
    private function buildUserNameMap(): array
    {
        $map = [];
        foreach (User::query()->get(['id', 'name']) as $user) {
            $key = IdentifierNormalizer::normalizeName((string) $user->name);
            if ($key !== '') {
                $map[$key] = (int) $user->id;
            }
        }

        return $map;
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    private function issue(
        SyncRun $run,
        SyncIssueSeverity $severity,
        string $code,
        ?int $sourceRow,
        ?string $cid,
        mixed $tss,
        string $message,
        array $payload
    ): void {
        SyncIssue::query()->create([
            'sync_run_id' => $run->id,
            'severity' => $severity,
            'code' => $code,
            'source_row' => $sourceRow,
            'cid' => $cid,
            'codigo_local' => $tss !== null ? (string) $tss : null,
            'message' => $message,
            'payload' => $payload,
            'created_at' => now(),
        ]);
    }
}
