<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('incidents', function (Blueprint $table) {
            $table->string('detection_source', 40)->nullable()->after('prtg_sensor_id');
            $table->string('prtg_down_fingerprint', 64)->nullable()->after('detection_source');
            $table->timestamp('prtg_down_started_at')->nullable()->after('prtg_down_fingerprint');
            $table->timestamp('prtg_up_at')->nullable()->after('prtg_down_started_at');
            $table->unique('prtg_down_fingerprint');
            $table->index('detection_source');
        });
    }

    public function down(): void
    {
        Schema::table('incidents', function (Blueprint $table) {
            $table->dropUnique(['prtg_down_fingerprint']);
            $table->dropIndex(['detection_source']);
            $table->dropColumn([
                'detection_source',
                'prtg_down_fingerprint',
                'prtg_down_started_at',
                'prtg_up_at',
            ]);
        });
    }
};
