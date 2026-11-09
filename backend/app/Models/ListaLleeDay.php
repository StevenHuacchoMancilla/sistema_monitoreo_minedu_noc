<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ListaLleeDay extends Model
{
    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'report_date' => 'date',
        ];
    }

    public function rows(): HasMany
    {
        return $this->hasMany(ListaLleeDayRow::class)->orderBy('id');
    }
}
