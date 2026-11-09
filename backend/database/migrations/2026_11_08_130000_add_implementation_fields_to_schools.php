<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('schools', function (Blueprint $table) {
            // ÁREA del Excel IMPLEMENTACION (URBANA / RURAL). No confundir con clasificacion TIPO I–IV.
            $table->string('ambito', 20)->nullable()->after('clasificacion')->index();
            $table->string('energy_type', 64)->nullable()->after('ambito')->index();
            $table->string('implementation_zone', 120)->nullable()->after('energy_type');
            $table->string('implementation_span', 120)->nullable()->after('implementation_zone');
            $table->string('installation_type', 40)->nullable()->after('implementation_span');
        });
    }

    public function down(): void
    {
        Schema::table('schools', function (Blueprint $table) {
            $table->dropIndex(['ambito']);
            $table->dropIndex(['energy_type']);
            $table->dropColumn([
                'ambito',
                'energy_type',
                'implementation_zone',
                'implementation_span',
                'installation_type',
            ]);
        });
    }
};
