<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Tracking General: columnas operativas CODIGO (letras A–Z) y CAUSA (texto libre).
 * Additive — no toca datos existentes.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tracking_records', function (Blueprint $table) {
            $table->string('codigo', 64)->nullable()->after('description');
            $table->text('causa')->nullable()->after('codigo');
        });
    }

    public function down(): void
    {
        Schema::table('tracking_records', function (Blueprint $table) {
            $table->dropColumn(['codigo', 'causa']);
        });
    }
};
