<?php

use App\Enums\FollowupStatus;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('incidents', function (Blueprint $table) {
            $table->boolean('reopened_from_management')
                ->default(false)
                ->after('recovered_while_managing')
                ->comment('Recayó con Tracking/seguimiento abierto: no entra a Caídas activas nuevas');
        });

        // Backfill: activas en gestión con Tracking abierto y evidencia de re-caída (SYSTEM update).
        $managing = FollowupStatus::managingValues();
        $placeholders = implode(',', array_fill(0, count($managing), '?'));

        DB::update(
            "UPDATE incidents
             SET reopened_from_management = true
             WHERE recovered_at IS NULL
               AND followup_status IN ($placeholders)
               AND EXISTS (
                 SELECT 1 FROM tracking_records t
                 WHERE t.incident_id = incidents.id
                   AND t.status <> 'CLOSED'
               )
               AND EXISTS (
                 SELECT 1 FROM incident_updates u
                 WHERE u.incident_id = incidents.id
                   AND u.type = 'SYSTEM'
                   AND (
                     u.observation LIKE ?
                     OR u.observation LIKE ?
                     OR u.observation LIKE ?
                   )
               )",
            [
                ...$managing,
                '%Recaída en gestión%',
                '%re-caída%',
                '%Seguir en reporte%',
            ]
        );
    }

    public function down(): void
    {
        Schema::table('incidents', function (Blueprint $table) {
            $table->dropColumn('reopened_from_management');
        });
    }
};
