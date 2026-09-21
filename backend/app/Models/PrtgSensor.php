<?php

namespace App\Models;

use App\Enums\MonitoringStatus;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class PrtgSensor extends Model
{
    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'normalized_status' => MonitoringStatus::class,
            'last_check' => 'datetime',
            'last_synced_at' => 'datetime',
            'metadata' => 'array',
        ];
    }

    public function networkAssignment(): BelongsTo
    {
        return $this->belongsTo(NetworkAssignment::class);
    }

    public function events(): HasMany
    {
        return $this->hasMany(PrtgEvent::class);
    }
}
