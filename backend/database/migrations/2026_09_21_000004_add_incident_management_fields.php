<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('incidents', function (Blueprint $table) {
            $table->string('contact_result')->nullable()->after('contact_status');
            $table->string('responsible_area')->nullable()->after('contact_result');
            $table->string('glpi_ticket')->nullable()->after('responsible_area');
            $table->text('diagnosis')->nullable()->after('glpi_ticket');
        });
    }

    public function down(): void
    {
        Schema::table('incidents', function (Blueprint $table) {
            $table->dropColumn(['contact_result', 'responsible_area', 'glpi_ticket', 'diagnosis']);
        });
    }
};
