<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('audit_logs', function (Blueprint $table) {
            $table->string('module')->nullable()->after('action');
            $table->string('ip_address', 45)->nullable()->after('source');
            $table->string('user_agent', 512)->nullable()->after('ip_address');

            $table->index('module');
            $table->index(['module', 'action']);
        });

        // Backfill módulo desde entity_type histórico.
        if (Schema::getConnection()->getDriverName() === 'pgsql') {
            DB::statement(<<<'SQL'
                UPDATE audit_logs SET module = CASE
                    WHEN entity_type LIKE '%\\School' AND entity_type NOT LIKE '%Contact%' THEN 'SCHOOLS'
                    WHEN entity_type LIKE '%NetworkAssignment%' THEN 'NETWORK_ASSIGNMENTS'
                    WHEN entity_type LIKE '%SchoolContact%' THEN 'CONTACTS'
                    WHEN entity_type LIKE '%Incident%' THEN 'INCIDENTS'
                    WHEN entity_type LIKE '%User%' THEN 'AUTH'
                    ELSE 'ADMINISTRATION'
                END
                WHERE module IS NULL
            SQL);
        } else {
            DB::table('audit_logs')->whereNull('module')->update(['module' => 'ADMINISTRATION']);
        }
    }

    public function down(): void
    {
        Schema::table('audit_logs', function (Blueprint $table) {
            $table->dropIndex(['module', 'action']);
            $table->dropIndex(['module']);
            $table->dropColumn(['module', 'ip_address', 'user_agent']);
        });
    }
};
