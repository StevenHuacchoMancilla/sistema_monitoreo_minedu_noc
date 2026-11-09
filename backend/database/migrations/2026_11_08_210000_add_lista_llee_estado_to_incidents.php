<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('incidents', function (Blueprint $table) {
            $table->string('lista_llee_estado', 40)->nullable()->after('cause');
            $table->index('lista_llee_estado');
        });
    }

    public function down(): void
    {
        Schema::table('incidents', function (Blueprint $table) {
            $table->dropIndex(['lista_llee_estado']);
            $table->dropColumn('lista_llee_estado');
        });
    }
};
