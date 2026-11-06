<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('incidents', function (Blueprint $table) {
            $table->boolean('escalated_from_partial')->default(false)->after('current_status');
        });

        if (Schema::getConnection()->getDriverName() !== 'pgsql') {
            return;
        }

        DB::statement("
            UPDATE incidents i
            SET escalated_from_partial = true
            WHERE EXISTS (
                SELECT 1 FROM incident_updates u
                WHERE u.incident_id = i.id
                  AND u.observation ILIKE '%parcial%caído%'
            )
            OR EXISTS (
                SELECT 1 FROM prtg_events e
                WHERE e.network_assignment_id = i.network_assignment_id
                  AND e.previous_status = 'PARCIAL'
                  AND e.new_status = 'CAIDO'
                  AND e.occurred_at >= i.started_at
                  AND (i.recovered_at IS NULL OR e.occurred_at <= i.recovered_at)
            )
        ");
    }

    public function down(): void
    {
        Schema::table('incidents', function (Blueprint $table) {
            $table->dropColumn('escalated_from_partial');
        });
    }
};
