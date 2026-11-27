<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Índices de las lecturas que crecen con el histórico:
 * colas por estado y ticketera ordenada por apertura.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('incidents', function (Blueprint $table) {
            $table->index(['followup_status', 'recovered_at'], 'incidents_followup_recovered_idx');
            $table->index(['detection_source', 'recovered_at'], 'incidents_detection_recovered_idx');
        });

        Schema::table('service_tickets', function (Blueprint $table) {
            $table->index(['opened_at', 'id'], 'service_tickets_opened_id_idx');
        });
    }

    public function down(): void
    {
        Schema::table('incidents', function (Blueprint $table) {
            $table->dropIndex('incidents_followup_recovered_idx');
            $table->dropIndex('incidents_detection_recovered_idx');
        });

        Schema::table('service_tickets', function (Blueprint $table) {
            $table->dropIndex('service_tickets_opened_id_idx');
        });
    }
};
