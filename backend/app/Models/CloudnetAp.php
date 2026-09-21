<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CloudnetAp extends Model
{
    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'last_synced_at' => 'datetime',
            'metadata' => 'array',
        ];
    }

    public function site(): BelongsTo
    {
        return $this->belongsTo(CloudnetSite::class, 'cloudnet_site_id');
    }

    public function device(): BelongsTo
    {
        return $this->belongsTo(CloudnetDevice::class, 'cloudnet_device_id');
    }
}
