<?php

namespace App\Models;

use App\Enums\AffectedWanNode;
use App\Enums\FollowupStatus;
use App\Enums\ManagementClassification;
use App\Enums\ManagementScope;
use App\Enums\RecoveryReviewStatus;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Incident extends Model
{
    public const DETECTION_MANUAL_PARTIAL = 'MANUAL_PARTIAL';

    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'started_at' => 'datetime',
            'recovered_at' => 'datetime',
            'prtg_down_started_at' => 'datetime',
            'prtg_up_at' => 'datetime',
            'last_contact_at' => 'datetime',
            'followup_status' => FollowupStatus::class,
            'management_classification' => ManagementClassification::class,
            'management_scope' => ManagementScope::class,
            'recovery_review_status' => RecoveryReviewStatus::class,
            'affected_wan_node' => AffectedWanNode::class,
            'recovered_while_managing' => 'boolean',
            'recovery_reviewed_at' => 'datetime',
            'school_snapshot' => 'array',
            'network_snapshot' => 'array',
        ];
    }

    public function isManualPartial(): bool
    {
        return $this->detection_source === self::DETECTION_MANUAL_PARTIAL;
    }

    public function school(): BelongsTo
    {
        return $this->belongsTo(School::class);
    }

    public function networkAssignment(): BelongsTo
    {
        return $this->belongsTo(NetworkAssignment::class);
    }

    public function sensor(): BelongsTo
    {
        return $this->belongsTo(PrtgSensor::class, 'prtg_sensor_id');
    }

    public function updates(): HasMany
    {
        return $this->hasMany(IncidentUpdate::class)->orderByDesc('id');
    }

    public function managements(): HasMany
    {
        return $this->hasMany(IncidentManagement::class)->orderByDesc('id');
    }

    public function fieldDispatches(): HasMany
    {
        return $this->hasMany(FieldDispatch::class)->orderByDesc('id');
    }

    public function activeFieldDispatch(): HasMany
    {
        return $this->hasMany(FieldDispatch::class)->active()->orderByDesc('id');
    }

    public function trackingRecords(): HasMany
    {
        return $this->hasMany(TrackingRecord::class)->orderByDesc('id');
    }

    public function activeTracking(): HasMany
    {
        return $this->hasMany(TrackingRecord::class)->notClosed()->orderByDesc('id');
    }

    public function lastManagedContact(): BelongsTo
    {
        return $this->belongsTo(SchoolContact::class, 'last_managed_contact_id');
    }

    public function scopeActive($query)
    {
        return $query->whereNull('recovered_at');
    }

    public function scopeForClosingReport($query)
    {
        // TIPO 1 activo, o recuperado con "Seguir en reporte" (internet intermitente).
        return $query
            ->where('management_classification', ManagementClassification::ContactConfirmed->value)
            ->where(function ($q) {
                $q->whereNull('recovered_at')
                    ->orWhere('recovery_review_status', RecoveryReviewStatus::ContinueMonitoring->value);
            });
    }
}
