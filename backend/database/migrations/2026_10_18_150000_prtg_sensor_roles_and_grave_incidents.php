<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('prtg_sensors', function (Blueprint $table) {
            $table->string('sensor_role', 32)->nullable()->after('type')->index();
        });

        Schema::table('incidents', function (Blueprint $table) {
            $table->boolean('is_grave_incident')->default(false)->after('reopened_from_management');
            $table->timestamp('grave_opened_at')->nullable()->after('is_grave_incident');
            $table->foreignId('grave_opened_by_user_id')->nullable()->after('grave_opened_at')
                ->constrained('users')->nullOnDelete();
            $table->timestamp('grave_closed_at')->nullable()->after('grave_opened_by_user_id');
            $table->index(['is_grave_incident', 'grave_closed_at']);
        });
    }

    public function down(): void
    {
        Schema::table('incidents', function (Blueprint $table) {
            $table->dropConstrainedForeignId('grave_opened_by_user_id');
            $table->dropColumn(['is_grave_incident', 'grave_opened_at', 'grave_closed_at']);
        });

        Schema::table('prtg_sensors', function (Blueprint $table) {
            $table->dropColumn('sensor_role');
        });
    }
};
