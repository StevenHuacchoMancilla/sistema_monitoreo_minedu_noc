<?php

namespace App\Models;

use App\Enums\DatePrecision;
use App\Enums\TrackingStatus;
use App\Enums\TrackingTechnicalStatus;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class TrackingRecord extends Model
{
    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'status' => TrackingStatus::class,
            'technical_status' => TrackingTechnicalStatus::class,
            'opened_at' => 'datetime',
            'closed_at' => 'datetime',
            'technical_recovered_at' => 'datetime',
            'opened_at_precision' => DatePrecision::class,
            'closed_at_precision' => DatePrecision::class,
            'lock_version' => 'integer',
            'incident_number' => 'integer',
        ];
    }

    public function school(): BelongsTo
    {
        return $this->belongsTo(School::class);
    }

    public function incident(): BelongsTo
    {
        return $this->belongsTo(Incident::class);
    }

    public function networkAssignment(): BelongsTo
    {
        return $this->belongsTo(NetworkAssignment::class);
    }

    public function openedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'opened_by_user_id');
    }

    public function closedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'closed_by_user_id');
    }

    public function updates(): HasMany
    {
        return $this->hasMany(TrackingUpdate::class)->orderBy('id');
    }

    public function latestUpdate(): HasOne
    {
        return $this->hasOne(TrackingUpdate::class)->latestOfMany();
    }

    public function scopeNotClosed(Builder $query): Builder
    {
        return $query->where('status', '!=', TrackingStatus::Closed->value);
    }

    public function scopeOpenForIncident(Builder $query, int $incidentId): Builder
    {
        return $query->where('incident_id', $incidentId)->notClosed();
    }

    public function isClosed(): bool
    {
        $status = $this->status instanceof TrackingStatus
            ? $this->status
            : TrackingStatus::tryFrom((string) $this->status);

        return $status?->isClosed() ?? false;
    }

    public function isOpen(): bool
    {
        return ! $this->isClosed();
    }

    public function openedByDisplayName(): ?string
    {
        return $this->openedBy?->name ?? $this->opened_by_legacy_name;
    }

    public function closedByDisplayName(): ?string
    {
        return $this->closedBy?->name ?? $this->closed_by_legacy_name;
    }

    /**
     * Incrementa lock_version para control de concurrencia optimista.
     */
    public function bumpLockVersion(): void
    {
        $this->lock_version = ((int) $this->lock_version) + 1;
    }

    /**
     * @return array<string, mixed>
     */
    public function toSummaryArray(): array
    {
        $status = $this->status instanceof TrackingStatus
            ? $this->status
            : TrackingStatus::tryFrom((string) $this->status);

        $technical = $this->technical_status instanceof TrackingTechnicalStatus
            ? $this->technical_status
            : TrackingTechnicalStatus::tryFrom((string) ($this->technical_status ?? ''));

        return [
            'id' => $this->id,
            'incident_number' => $this->incident_number,
            'incident_id' => $this->incident_id,
            'school_id' => $this->school_id,
            'network_assignment_id' => $this->network_assignment_id,
            'ticket' => $this->ticket,
            'tss_snapshot' => $this->tss_snapshot,
            'cid_snapshot' => $this->cid_snapshot,
            'description' => $this->description,
            'status' => $status?->value,
            'status_label' => $status?->label(),
            'technical_status' => $technical?->value,
            'technical_status_label' => $technical?->label(),
            'opened_at' => $this->opened_at?->toIso8601String(),
            'opened_at_precision' => $this->opened_at_precision instanceof DatePrecision
                ? $this->opened_at_precision->value
                : $this->opened_at_precision,
            'opened_by_user_id' => $this->opened_by_user_id,
            'opened_by_name' => $this->openedByDisplayName(),
            'closed_at' => $this->closed_at?->toIso8601String(),
            'closed_at_precision' => $this->closed_at_precision instanceof DatePrecision
                ? $this->closed_at_precision->value
                : $this->closed_at_precision,
            'closed_by_user_id' => $this->closed_by_user_id,
            'closed_by_name' => $this->closedByDisplayName(),
            'closing_note' => $this->closing_note,
            'technical_recovered_at' => $this->technical_recovered_at?->toIso8601String(),
            'lock_version' => (int) $this->lock_version,
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
