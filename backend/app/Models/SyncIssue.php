<?php

namespace App\Models;

use App\Enums\SyncIssueSeverity;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SyncIssue extends Model
{
    public $timestamps = false;

    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'severity' => SyncIssueSeverity::class,
            'payload' => 'array',
            'created_at' => 'datetime',
        ];
    }

    public function syncRun(): BelongsTo
    {
        return $this->belongsTo(SyncRun::class);
    }
}
