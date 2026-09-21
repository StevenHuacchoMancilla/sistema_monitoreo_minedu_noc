<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PrtgEvent extends Model
{
    public $timestamps = false;

    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'occurred_at' => 'datetime',
            'created_at' => 'datetime',
            'payload' => 'array',
        ];
    }

    public function networkAssignment(): BelongsTo
    {
        return $this->belongsTo(NetworkAssignment::class);
    }

    public function sensor(): BelongsTo
    {
        return $this->belongsTo(PrtgSensor::class, 'prtg_sensor_id');
    }
}
