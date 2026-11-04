<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PrtgTrafficSample extends Model
{
    public $timestamps = false;

    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'sampled_at' => 'datetime',
            'mbps' => 'float',
        ];
    }

    public function sensor(): BelongsTo
    {
        return $this->belongsTo(PrtgSensor::class, 'prtg_sensor_id');
    }
}
