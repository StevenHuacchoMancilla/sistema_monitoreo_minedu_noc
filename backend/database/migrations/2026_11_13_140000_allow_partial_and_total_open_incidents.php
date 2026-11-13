<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Permite un enlace parcial MANUAL_PARTIAL abierto en paralelo a una caída total PRTG
 * (mismo assignment + sensor). El índice one-active solo aplica a caídas no parciales.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('incidents')) {
            return;
        }

        DB::statement('DROP INDEX IF EXISTS incidents_one_active_per_assignment_sensor');
        DB::statement("
            CREATE UNIQUE INDEX incidents_one_active_per_assignment_sensor
            ON incidents (network_assignment_id, prtg_sensor_id)
            WHERE recovered_at IS NULL
              AND (detection_source IS NULL OR detection_source <> 'MANUAL_PARTIAL')
        ");

        DB::statement('DROP INDEX IF EXISTS incidents_one_open_manual_partial_per_assignment');
        DB::statement("
            CREATE UNIQUE INDEX incidents_one_open_manual_partial_per_assignment
            ON incidents (network_assignment_id)
            WHERE recovered_at IS NULL
              AND detection_source = 'MANUAL_PARTIAL'
        ");
    }

    public function down(): void
    {
        DB::statement('DROP INDEX IF EXISTS incidents_one_open_manual_partial_per_assignment');
        DB::statement('DROP INDEX IF EXISTS incidents_one_active_per_assignment_sensor');
        DB::statement('
            CREATE UNIQUE INDEX incidents_one_active_per_assignment_sensor
            ON incidents (network_assignment_id, prtg_sensor_id)
            WHERE recovered_at IS NULL
        ');
    }
};
