<?php

use App\Enums\FollowupStatus;
use App\Enums\ManagementClassification;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Corrige incidencias ya gestionadas como "En espera" (NO_RESPONSE) que
 * quedaron mal en PENDIENTE_CONTACTO por el mapeo anterior del servicio.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::table('incidents')
            ->whereNull('recovered_at')
            ->where('management_classification', ManagementClassification::NoResponse->value)
            ->where('followup_status', FollowupStatus::PendienteContacto->value)
            ->update([
                'followup_status' => FollowupStatus::EnEspera->value,
                'updated_at' => now(),
            ]);
    }

    public function down(): void
    {
        // Irreversible de forma segura: no devolvemos a pendiente.
    }
};
