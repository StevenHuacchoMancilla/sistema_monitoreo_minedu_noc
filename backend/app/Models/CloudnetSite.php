<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class CloudnetSite extends Model
{
    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'last_synced_at' => 'datetime',
            'metadata' => 'array',
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

    public function devices(): HasMany
    {
        return $this->hasMany(CloudnetDevice::class);
    }

    public function aps(): HasMany
    {
        return $this->hasMany(CloudnetAp::class);
    }
}
