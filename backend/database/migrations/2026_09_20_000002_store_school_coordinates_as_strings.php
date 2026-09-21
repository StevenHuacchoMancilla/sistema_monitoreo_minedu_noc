<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        $driver = Schema::getConnection()->getDriverName();

        if ($driver !== 'pgsql') {
            return;
        }

        DB::statement('ALTER TABLE schools ALTER COLUMN latitud TYPE varchar(64) USING latitud::text');
        DB::statement('ALTER TABLE schools ALTER COLUMN longitud TYPE varchar(64) USING longitud::text');
    }

    public function down(): void
    {
        // Coordinates remain strings; rolling back to numeric would drop malformed Excel values.
    }
};
