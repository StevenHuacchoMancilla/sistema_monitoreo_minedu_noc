<?php

namespace App\Models;

use App\Enums\ManagementClassification;
use App\Enums\ManagementScope;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class IncidentManagement extends Model
{
    protected $table = 'incident_managements';

    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'classification' => ManagementClassification::class,
            'scope' => ManagementScope::class,
            'contact_attempted_at' => 'datetime',
        ];
    }

    public function incident(): BelongsTo
    {
        return $this->belongsTo(Incident::class);
    }

    public function contact(): BelongsTo
    {
        return $this->belongsTo(SchoolContact::class, 'contact_id');
    }

    public function author(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
