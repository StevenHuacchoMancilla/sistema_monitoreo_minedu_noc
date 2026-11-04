<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('incidents', function (Blueprint $table) {
            $table->string('minedu_reason', 20)->nullable()->after('root_cause_code');
            $table->timestamp('clock_paused_at')->nullable()->after('minedu_reason');
            $table->unsignedInteger('clock_pause_seconds')->default(0)->after('clock_paused_at');
            $table->index('minedu_reason');
        });
    }

    public function down(): void
    {
        Schema::table('incidents', function (Blueprint $table) {
            $table->dropIndex(['minedu_reason']);
            $table->dropColumn(['minedu_reason', 'clock_paused_at', 'clock_pause_seconds']);
        });
    }
};
