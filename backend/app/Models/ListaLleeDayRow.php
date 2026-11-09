<?php

namespace App\Models;

use App\Enums\ListaLleeEstado;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ListaLleeDayRow extends Model
{
    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'outage_at' => 'datetime',
            'lista_estado' => ListaLleeEstado::class,
        ];
    }

    public function day(): BelongsTo
    {
        return $this->belongsTo(ListaLleeDay::class, 'lista_llee_day_id');
    }

    public function incident(): BelongsTo
    {
        return $this->belongsTo(Incident::class);
    }
}
