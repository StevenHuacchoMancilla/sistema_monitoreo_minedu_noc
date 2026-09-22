<?php

namespace App\Enums;

enum RecoveryReviewStatus: string
{
    case PendingReview = 'PENDING_REVIEW';
    case Acknowledged = 'ACKNOWLEDGED';
    case ContinueMonitoring = 'CONTINUE_MONITORING';

    /**
     * @return list<string>
     */
    public static function values(): array
    {
        return array_column(self::cases(), 'value');
    }

    public function label(): string
    {
        return match ($this) {
            self::PendingReview => 'Pendiente de revisión',
            self::Acknowledged => 'Recuperación confirmada',
            self::ContinueMonitoring => 'Seguimiento activo',
        };
    }
}
