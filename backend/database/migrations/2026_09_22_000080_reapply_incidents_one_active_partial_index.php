<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Tras ALTER TABLE en SQLite, el índice parcial se recrea sin WHERE.
 * Reaplicamos one-active-per-sensor para permitir re-caídas (nueva incidencia).
 */
return new class extends Migration
{
    public function up(): void
    {
        $driver = Schema::getConnection()->getDriverName();

        if ($driver === 'pgsql') {
            DB::statement('DROP INDEX IF EXISTS incidents_one_active_per_assignment_sensor');
            DB::statement('
                CREATE UNIQUE INDEX incidents_one_active_per_assignment_sensor
                ON incidents (network_assignment_id, prtg_sensor_id)
                WHERE recovered_at IS NULL
            ');

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
        // No revertir: el índice parcial es el contrato correcto.
    }
};
