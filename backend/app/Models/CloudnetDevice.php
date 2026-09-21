<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class CloudnetDevice extends Model
{
    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'online_time' => 'datetime',
            'last_synced_at' => 'datetime',
            'metadata' => 'array',
        ];
    }

    public function site(): BelongsTo
    {
        return $this->belongsTo(CloudnetSite::class, 'cloudnet_site_id');
    }

    public function aps(): HasMany
    {
        return $this->hasMany(CloudnetAp::class);
    }
}
