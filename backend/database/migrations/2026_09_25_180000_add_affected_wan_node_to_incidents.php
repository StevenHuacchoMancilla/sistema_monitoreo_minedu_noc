<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('incidents', function (Blueprint $table) {
            $table->string('affected_wan_node', 20)->nullable()->after('detection_source');
            $table->index('affected_wan_node');
        });
    }

    public function down(): void
    {
        Schema::table('incidents', function (Blueprint $table) {
            $table->dropIndex(['affected_wan_node']);
            $table->dropColumn('affected_wan_node');
        });
    }
};
