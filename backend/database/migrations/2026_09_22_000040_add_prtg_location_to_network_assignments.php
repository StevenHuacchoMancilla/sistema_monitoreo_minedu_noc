<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('network_assignments', function (Blueprint $table) {
            $table->string('prtg_province')->nullable()->after('prtg_device_name');
            $table->string('prtg_district')->nullable()->after('prtg_province');
            $table->index('prtg_province');
            $table->index('prtg_district');
            $table->index(['prtg_province', 'prtg_district']);
        });

        // Backfill solo en PostgreSQL (DISTINCT ON / jsonb / UPDATE…FROM).
        if (
            Schema::hasTable('prtg_sensors')
            && Schema::getConnection()->getDriverName() === 'pgsql'
        ) {
            DB::statement(<<<'SQL'
                UPDATE network_assignments AS na
                SET
                    prtg_province = sub.prov,
                    prtg_district = sub.dist
                FROM (
                    SELECT DISTINCT ON (network_assignment_id)
                        network_assignment_id,
                        NULLIF(TRIM(metadata->>'prtg_province_group'), '') AS prov,
                        NULLIF(TRIM(metadata->>'prtg_district_group'), '') AS dist
                    FROM prtg_sensors
                    WHERE network_assignment_id IS NOT NULL
                      AND (
                          NULLIF(TRIM(metadata->>'prtg_province_group'), '') IS NOT NULL
                          OR NULLIF(TRIM(metadata->>'prtg_district_group'), '') IS NOT NULL
                      )
                    ORDER BY network_assignment_id, last_synced_at DESC NULLS LAST, id DESC
                ) AS sub
                WHERE na.id = sub.network_assignment_id
                  AND na.prtg_province IS NULL
                  AND na.prtg_district IS NULL
            SQL);
        }
    }

    public function down(): void
    {
        Schema::table('network_assignments', function (Blueprint $table) {
            $table->dropIndex(['prtg_province', 'prtg_district']);
            $table->dropIndex(['prtg_province']);
            $table->dropIndex(['prtg_district']);
            $table->dropColumn(['prtg_province', 'prtg_district']);
        });
    }
};
