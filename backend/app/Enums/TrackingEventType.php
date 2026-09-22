<?php

namespace App\Enums;

enum TrackingEventType: string
{
    case Comment = 'COMMENT';
    case Diagnosis = 'DIAGNOSIS';
    case Contact = 'CONTACT';
    case Escalation = 'ESCALATION';
    case FieldAction = 'FIELD_ACTION';
    case TechnicalRecovery = 'TECHNICAL_RECOVERY';
    case SystemEvent = 'SYSTEM_EVENT';
    case Other = 'OTHER';

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
            self::Comment => 'Comentario',
            self::Diagnosis => 'Diagnóstico',
            self::Contact => 'Contacto',
            self::Escalation => 'Escalamiento',
            self::FieldAction => 'Acción en campo',
            self::TechnicalRecovery => 'Recuperación técnica',
            self::SystemEvent => 'Evento de sistema',
            self::Other => 'Otro',
        };
    }

    public function isSystem(): bool
    {
        return $this === self::TechnicalRecovery || $this === self::SystemEvent;
    }
}
