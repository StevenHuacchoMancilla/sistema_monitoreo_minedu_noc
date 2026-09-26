<?php

namespace App\Models;

use App\Enums\TrackingEventType;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class TrackingUpdate extends Model
{
    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'event_type' => TrackingEventType::class,
            'occurred_on' => 'date',
            'occurred_at' => 'datetime',
        ];
    }

    public function trackingRecord(): BelongsTo
    {
        return $this->belongsTo(TrackingRecord::class);
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by_user_id');
    }

    public function actorDisplayName(): string
    {
        if ($this->createdBy?->name) {
            return $this->createdBy->name;
        }

        if ($this->legacy_actor_name) {
            return (string) $this->legacy_actor_name;
        }

        $type = $this->event_type instanceof TrackingEventType
            ? $this->event_type
            : TrackingEventType::tryFrom((string) $this->event_type);

        return $type?->isSystem() ? 'Sistema' : 'Desconocido';
    }

    /**
     * @return array<string, mixed>
     */
    public function toApiArray(): array
    {
        $type = $this->event_type instanceof TrackingEventType
            ? $this->event_type
            : TrackingEventType::tryFrom((string) $this->event_type);

        return [
            'id' => $this->id,
            'tracking_record_id' => $this->tracking_record_id,
            'event_type' => $type?->value,
            'event_type_label' => $type?->label(),
            'is_system' => $type?->isSystem() ?? false,
            'body' => $this->body,
            'created_by_user_id' => $this->created_by_user_id,
            'legacy_actor_name' => $this->legacy_actor_name,
            'actor_name' => $this->actorDisplayName(),
            'occurred_on' => $this->occurred_on?->toDateString(),
            'occurred_at' => $this->occurred_at?->toIso8601String(),
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
            'can_delete' => ! ($type?->isSystem() ?? false),
        ];
    }
}
