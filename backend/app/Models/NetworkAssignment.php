<?php

namespace App\Models;

use App\Enums\CidStatus;
use App\Enums\RecordSource;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class NetworkAssignment extends Model
{
    use SoftDeletes;

    protected $guarded = [];

    protected $hidden = [
        // AP passwords are never persisted; hidden reserved for future sensitive fields.
    ];

    protected function casts(): array
    {
        return [
            'monitoring_eligible' => 'boolean',
            'is_active' => 'boolean',
            'cid_status' => CidStatus::class,
            'source' => RecordSource::class,
            'fecha_activacion' => 'date',
            'valid_from' => 'datetime',
            'valid_to' => 'datetime',
        ];
    }

    public function school(): BelongsTo
    {
        return $this->belongsTo(School::class);
    }

    public function sensors(): HasMany
    {
        return $this->hasMany(PrtgSensor::class);
    }

    public function contactsViaSchool(): HasMany
    {
        return $this->hasMany(SchoolContact::class, 'school_id', 'school_id');
    }
}
