<?php

namespace App\Models;

use App\Enums\ContactMatchStatus;
use App\Enums\RecordSource;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\SoftDeletes;

class School extends Model
{
    use SoftDeletes;

    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'active' => 'boolean',
            'contact_match_status' => ContactMatchStatus::class,
            'source' => RecordSource::class,
        ];
    }

    public function networkAssignments(): HasMany
    {
        return $this->hasMany(NetworkAssignment::class);
    }

    public function activeAssignment(): HasOne
    {
        return $this->hasOne(NetworkAssignment::class)->where('is_active', true);
    }

    public function contacts(): HasMany
    {
        return $this->hasMany(SchoolContact::class)->orderBy('position');
    }

    public function incidents(): HasMany
    {
        return $this->hasMany(Incident::class);
    }

    public function cloudnetSites(): HasMany
    {
        return $this->hasMany(CloudnetSite::class);
    }
}
