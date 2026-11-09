<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('service_tickets', function (Blueprint $table) {
            $table->boolean('is_maintenance')->default(false)->after('kind')->index();
            $table->string('technician_phone', 40)->nullable()->after('technician_name');
        });

        // GS01 ya existentes = mantenimiento programado.
        DB::table('service_tickets')
            ->where('cause_code', 'GS01')
            ->update(['is_maintenance' => true]);

        DB::table('service_tickets')
            ->whereNull('cause_code')
            ->whereIn('incident_id', function ($q) {
                $q->select('id')->from('incidents')->where('root_cause_code', 'GS01');
            })
            ->update(['is_maintenance' => true]);
    }

    public function down(): void
    {
        Schema::table('service_tickets', function (Blueprint $table) {
            $table->dropColumn(['is_maintenance', 'technician_phone']);
        });
    }
};
