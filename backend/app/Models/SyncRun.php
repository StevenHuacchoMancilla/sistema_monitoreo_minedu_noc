<?php

namespace App\Models;

use App\Enums\SyncRunStatus;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class SyncRun extends Model
{
    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'status' => SyncRunStatus::class,
            'started_at' => 'datetime',
            'finished_at' => 'datetime',
            'metadata' => 'array',
        ];
    }

    public function issues(): HasMany
    {
        return $this->hasMany(SyncIssue::class);
    }
}
