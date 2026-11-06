<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ServiceTicket extends Model
{
    public const KIND_CORRECTIVE = 'CORRECTIVO';

    public const KIND_PREVENTIVE = 'PREVENTIVO';

    public const STATUS_OPEN = 'ABIERTO';

    public const STATUS_CLOSED = 'CERRADO';

    public const SOURCE_LIVE = 'LIVE';

    public const SOURCE_IMPORT = 'IMPORT';

    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'opened_at' => 'datetime',
            'restored_at' => 'datetime',
            'closed_at' => 'datetime',
            'arrived_at' => 'datetime',
            'departed_at' => 'datetime',
        ];
    }

    public function incident(): BelongsTo
    {
        return $this->belongsTo(Incident::class);
    }

    public function school(): BelongsTo
    {
        return $this->belongsTo(School::class);
    }

    public function isPreventive(): bool
    {
        return $this->kind === self::KIND_PREVENTIVE;
    }
}
