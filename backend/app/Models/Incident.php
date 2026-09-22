<?php

namespace App\Models;

use App\Enums\FollowupStatus;
use App\Enums\ManagementClassification;
use App\Enums\ManagementScope;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Incident extends Model
{
    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'started_at' => 'datetime',
            'recovered_at' => 'datetime',
            'last_contact_at' => 'datetime',
            'followup_status' => FollowupStatus::class,
            'management_classification' => ManagementClassification::class,
            'management_scope' => ManagementScope::class,
            'school_snapshot' => 'array',
            'network_snapshot' => 'array',
        ];
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
        return $query->active()
            ->where('management_classification', ManagementClassification::ContactConfirmed->value);
    }
}
