<?php

namespace App\Models;

use App\Enums\AffectedWanNode;
use App\Enums\FollowupStatus;
use App\Enums\ManagementClassification;
use App\Enums\ManagementScope;
use App\Enums\MineduReason;
use App\Enums\RecoveryReviewStatus;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class Incident extends Model
{
    public const DETECTION_MANUAL_PARTIAL = 'MANUAL_PARTIAL';

    public const DETECTION_PREVENTIVE = 'PREVENTIVE';

    public const DETECTION_HISTORICAL = 'HISTORICAL';

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
            'escalated_from_partial' => 'boolean',
            'recovered_while_managing' => 'boolean',
            'reopened_from_management' => 'boolean',
            'is_grave_incident' => 'boolean',
            'grave_opened_at' => 'datetime',
            'grave_closed_at' => 'datetime',
            'minedu_reason' => MineduReason::class,
            'clock_paused_at' => 'datetime',
            'clock_pause_seconds' => 'integer',
            'clock_pauses' => 'array',
            'recovery_reviewed_at' => 'datetime',
            'school_snapshot' => 'array',
            'network_snapshot' => 'array',
        ];
    }

    public function isOpenGrave(): bool
    {
        return (bool) $this->is_grave_incident && $this->grave_closed_at === null;
    }

    public function isManualPartial(): bool
    {
        return $this->detection_source === self::DETECTION_MANUAL_PARTIAL;
    }

    public function isPreventive(): bool
    {
        return $this->detection_source === self::DETECTION_PREVENTIVE;
    }

    public function serviceTicket(): HasOne
    {
        return $this->hasOne(ServiceTicket::class);
    }

    /** Caídas reales. El preventivo y el histórico cargado no entran en las colas de caída. */
    public function scopeFalls($query)
    {
        return $query->where(function ($q) {
            $q->whereNull('detection_source')
                ->orWhereNotIn('detection_source', [self::DETECTION_PREVENTIVE, self::DETECTION_HISTORICAL]);
        });
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
