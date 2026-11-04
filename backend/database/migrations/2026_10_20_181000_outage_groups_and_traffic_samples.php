<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('incidents', function (Blueprint $table) {
            $table->uuid('outage_group_id')->nullable()->after('minedu_reason')->index();
        });

        Schema::create('prtg_traffic_samples', function (Blueprint $table) {
            $table->id();
            $table->foreignId('prtg_sensor_id')->constrained('prtg_sensors')->cascadeOnDelete();
            $table->timestamp('sampled_at')->index();
            $table->decimal('mbps', 12, 4);
            $table->index(['prtg_sensor_id', 'sampled_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('prtg_traffic_samples');
        Schema::table('incidents', function (Blueprint $table) {
            $table->dropColumn('outage_group_id');
        });
    }
};
