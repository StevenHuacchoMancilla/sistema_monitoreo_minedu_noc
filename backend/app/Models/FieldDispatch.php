<?php

namespace App\Models;

use App\Enums\FieldDispatchStatus;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class FieldDispatch extends Model
{
    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'status' => FieldDispatchStatus::class,
            'planned_at' => 'datetime',
            'dispatched_at' => 'datetime',
            'on_site_at' => 'datetime',
            'cancelled_at' => 'datetime',
            'completed_at' => 'datetime',
        ];
    }

    public function incident(): BelongsTo
    {
        return $this->belongsTo(Incident::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function scopeActive(Builder $query): Builder
    {
        return $query->whereIn('status', FieldDispatchStatus::activeValues());
    }

    public function toApiArray(): array
    {
        $status = $this->status instanceof FieldDispatchStatus
            ? $this->status
            : FieldDispatchStatus::tryFrom((string) $this->status);

        return [
            'id' => $this->id,
            'incident_id' => $this->incident_id,
            'status' => $status?->value,
            'status_label' => $status?->label(),
            'is_active' => $status?->isActive() ?? false,
            'technician_name' => $this->technician_name,
            'notes' => $this->notes,
            'cancellation_reason' => $this->cancellation_reason,
            'planned_at' => $this->planned_at?->toIso8601String(),
            'dispatched_at' => $this->dispatched_at?->toIso8601String(),
            'on_site_at' => $this->on_site_at?->toIso8601String(),
            'cancelled_at' => $this->cancelled_at?->toIso8601String(),
            'completed_at' => $this->completed_at?->toIso8601String(),
            'created_by' => $this->created_by,
            'updated_by' => $this->updated_by,
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
