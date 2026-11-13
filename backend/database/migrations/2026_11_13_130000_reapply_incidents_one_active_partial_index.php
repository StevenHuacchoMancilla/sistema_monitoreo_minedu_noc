<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * SQLite pierde el WHERE del índice parcial tras ALTER TABLE en incidents.
 * Reaplica one-active para permitir re-caídas (nueva fila con recovered_at IS NULL).
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('incidents')) {
            return;
        }

        DB::statement('DROP INDEX IF EXISTS incidents_one_active_per_assignment_sensor');
        DB::statement('
            CREATE UNIQUE INDEX incidents_one_active_per_assignment_sensor
            ON incidents (network_assignment_id, prtg_sensor_id)
            WHERE recovered_at IS NULL
        ');
    }

    public function down(): void
    {
        // El índice parcial es el contrato correcto; no revertir.
    }
};
