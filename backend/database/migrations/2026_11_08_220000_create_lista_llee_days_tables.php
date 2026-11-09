<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('incidents', function (Blueprint $table) {
            if (! Schema::hasColumn('incidents', 'lista_detalle')) {
                $table->text('lista_detalle')->nullable()->after('lista_llee_estado');
            }
        });

        Schema::create('lista_llee_days', function (Blueprint $table) {
            $table->id();
            $table->date('report_date')->unique();
            $table->timestamps();
        });

        Schema::create('lista_llee_day_rows', function (Blueprint $table) {
            $table->id();
            $table->foreignId('lista_llee_day_id')->constrained('lista_llee_days')->cascadeOnDelete();
            $table->foreignId('incident_id')->constrained('incidents')->cascadeOnDelete();
            $table->unsignedInteger('tss')->nullable();
            $table->string('cid', 64)->nullable();
            $table->string('local_educativo', 255)->nullable();
            $table->string('presentacion_nombre_prtg', 512)->nullable();
            $table->string('estado_prtg', 8)->nullable();
            $table->string('lista_estado', 40)->nullable();
            $table->string('root_cause_code', 16)->nullable();
            $table->string('root_cause', 500)->nullable();
            $table->timestamp('outage_at')->nullable();
            $table->string('caida', 64)->nullable();
            $table->text('detalle')->nullable();
            $table->string('provincia', 120)->nullable();
            $table->string('distrito', 120)->nullable();
            $table->string('zona', 40)->nullable();
            $table->string('color_key', 16)->nullable();
            $table->timestamps();

            $table->unique(['lista_llee_day_id', 'incident_id']);
            $table->index('lista_estado');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('lista_llee_day_rows');
        Schema::dropIfExists('lista_llee_days');

        Schema::table('incidents', function (Blueprint $table) {
            if (Schema::hasColumn('incidents', 'lista_detalle')) {
                $table->dropColumn('lista_detalle');
            }
        });
    }
};
