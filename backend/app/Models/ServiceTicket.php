<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ServiceTicket extends Model
{
    public const KIND_CORRECTIVE = 'CORRECTIVO';

    public const KIND_PREVENTIVE = 'PREVENTIVO';

    /** Ticket sin denominación correctivo/preventivo (seguimiento + detalle de evento opcional). */
    public const KIND_FREE = 'ASIGNACION_LIBRE';

    public const STATUS_OPEN = 'ABIERTO';

    public const STATUS_CLOSED = 'CERRADO';

    public const SOURCE_LIVE = 'LIVE';

    public const SOURCE_IMPORT = 'IMPORT';

    /** Causa raíz: Mantenimiento programado o migración de tecnología. */
    public const MAINTENANCE_ROOT_CAUSE = 'GS01';

    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'is_maintenance' => 'boolean',
            'opened_at' => 'datetime',
            'restored_at' => 'datetime',
            'closed_at' => 'datetime',
            'arrived_at' => 'datetime',
            'departed_at' => 'datetime',
        ];
    }

    public static function isMaintenanceCause(?string $code): bool
    {
        return strtoupper(trim((string) $code)) === self::MAINTENANCE_ROOT_CAUSE;
    }

    /** @return list<string> */
    public static function kinds(): array
    {
        return [self::KIND_CORRECTIVE, self::KIND_PREVENTIVE, self::KIND_FREE];
    }

    public static function kindLabel(?string $kind): string
    {
        return match (strtoupper(trim((string) $kind))) {
            self::KIND_PREVENTIVE => 'Preventivo',
            self::KIND_FREE => 'Asignación libre',
            default => 'Correctivo',
        };
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

    public function isFreeAssignment(): bool
    {
        return $this->kind === self::KIND_FREE;
    }

    public function isMaintenance(): bool
    {
        return (bool) $this->is_maintenance;
    }
}
