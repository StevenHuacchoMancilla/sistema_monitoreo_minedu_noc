<?php

namespace App\Domain\Tracking\Services;

use App\Domain\Tracking\Support\TrackingTicketCodes;
use App\Enums\AuditModule;
use App\Enums\AuditSource;
use App\Enums\DatePrecision;
use App\Enums\TrackingStatus;
use App\Enums\TrackingTechnicalStatus;
use App\Models\Incident;
use App\Models\TrackingRecord;
use App\Services\AuditLogger;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class TrackingOpenService
{
    public function __construct(
        private readonly AuditLogger $audit,
        private readonly TrackingDetailService $detail,
        private readonly TrackingTicketCodes $tickets,
    ) {}

    /**
     * Abre Tracking desde una incidencia PRTG (o reutiliza el existente, abierto o cerrado).
     *
     * @return array{created: bool, data: array<string, mixed>}
     */
    public function openFromIncident(Incident $incident, int $userId, ?string $ticket = null): array
    {
        if (! $incident->school_id) {
            throw ValidationException::withMessages([
                'incident_id' => ['La incidencia no tiene colegio asociado.'],
            ]);
        }

        // 1 incidente → 1 Tracking (aunque esté cerrado).
        $existing = TrackingRecord::query()
            ->where('incident_id', (int) $incident->id)
            ->orderByDesc('id')
            ->first();

        if ($existing) {
            return $this->payload(false, $existing);
        }

        $incident->loadMissing(['school:id,current_sequence', 'networkAssignment:id,cid']);

        $cid = trim((string) ($incident->networkAssignment?->cid ?? ''));
        $tss = $incident->school?->current_sequence;
        $technical = $incident->recovered_at === null
            ? TrackingTechnicalStatus::Down
            : TrackingTechnicalStatus::Recovered;

        try {
            /** @var array{created: bool, tracking: TrackingRecord} $result */
            $result = DB::transaction(function () use ($incident, $userId, $cid, $tss, $technical) {
                $locked = TrackingRecord::query()
                    ->where('incident_id', (int) $incident->id)
                    ->lockForUpdate()
                    ->first();

                if ($locked) {
                    return ['created' => false, 'tracking' => $locked];
                }

                $nextNumber = ((int) TrackingRecord::query()->max('incident_number')) + 1;
                if ($nextNumber < 1) {
                    $nextNumber = 1;
                }

                $openedAt = now();
                $identity = $this->mintUniqueIdentity(
                    $tss !== null ? (string) $tss : '0',
                    $cid !== '' ? $cid : '0',
                    $openedAt,
                );

                $tracking = TrackingRecord::query()->create([
                    'public_id' => $identity['public_id'],
                    'incident_number' => $nextNumber,
                    'incident_id' => $incident->id,
                    'school_id' => $incident->school_id,
                    'network_assignment_id' => $incident->network_assignment_id,
                    'ticket' => $identity['report_ticket'],
                    'case_code' => $identity['case_code'],
                    'report_ticket' => $identity['report_ticket'],
                    'tss_snapshot' => $tss !== null ? (string) $tss : null,
                    'cid_snapshot' => $cid !== '' ? $cid : null,
                    'description' => $this->defaultDescription($cid),
                    'status' => TrackingStatus::Open,
                    'technical_status' => $technical,
                    'opened_at' => $openedAt,
                    'opened_at_precision' => DatePrecision::DateTime,
                    'opened_by_user_id' => $userId,
                    'opened_by_legacy_name' => null,
                    'lock_version' => 1,
                ]);

                $this->audit->record(
                    $tracking,
                    'OPEN_TRACKING',
                    null,
                    [
                        'incident_id' => $incident->id,
                        'incident_number' => $tracking->incident_number,
                        'public_id' => $tracking->public_id,
                        'case_code' => $tracking->case_code,
                        'report_ticket' => $tracking->report_ticket,
                        'school_id' => $tracking->school_id,
                        'network_assignment_id' => $tracking->network_assignment_id,
                        'tss_snapshot' => $tracking->tss_snapshot,
                        'cid_snapshot' => $tracking->cid_snapshot,
                        'description' => $tracking->description,
                        'status' => TrackingStatus::Open->value,
                        'opened_by_user_id' => $userId,
                    ],
                    AuditModule::TrackingGeneral,
                    AuditSource::Api,
                    $userId
                );

                return ['created' => true, 'tracking' => $tracking];
            });
        } catch (QueryException $e) {
            $race = TrackingRecord::query()
                ->where('incident_id', (int) $incident->id)
                ->orderByDesc('id')
                ->first();

            if ($race) {
                return $this->payload(false, $race);
            }

            throw $e;
        }

        return $this->payload($result['created'], $result['tracking']);
    }

    /**
     * @return array{public_id: string, suffix: string, case_code: string, report_ticket: string}
     */
    private function mintUniqueIdentity(string $tss, string $cid, $openedAt): array
    {
        for ($i = 0; $i < 8; $i++) {
            $identity = $this->tickets->mint($tss, $cid, $openedAt);
            $exists = TrackingRecord::query()
                ->where('public_id', $identity['public_id'])
                ->orWhere('case_code', $identity['case_code'])
                ->orWhere('report_ticket', $identity['report_ticket'])
                ->exists();
            if (! $exists) {
                return $identity;
            }
        }

        throw ValidationException::withMessages([
            'ticket' => ['No se pudo generar un ticket único. Reintenta.'],
        ]);
    }

    /**
     * @return array{created: bool, data: array<string, mixed>}
     */
    private function payload(bool $created, TrackingRecord $tracking): array
    {
        return [
            'created' => $created,
            'data' => $this->detail->show($tracking->fresh() ?? $tracking)['data'],
        ];
    }

    private function defaultDescription(string $cid): string
    {
        if ($cid === '') {
            return 'LINK DOWN';
        }

        return 'LINK DOWN CID'.$cid;
    }
}
