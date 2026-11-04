<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::table('incidents')->where('minedu_reason', 'ENERGIA')->update(['minedu_reason' => 'CAIDA_ENERGIA']);
        DB::table('incidents')->whereIn('minedu_reason', ['AFECTACION', 'INCIDENCIA'])->update(['minedu_reason' => 'CAIDA_ENLACE']);
    }

    public function down(): void
    {
        DB::table('incidents')->where('minedu_reason', 'CAIDA_ENERGIA')->update(['minedu_reason' => 'ENERGIA']);
        DB::table('incidents')->where('minedu_reason', 'CAIDA_ENLACE')->update(['minedu_reason' => 'AFECTACION']);
        DB::table('incidents')->where('minedu_reason', 'REQUERIMIENTO')->update(['minedu_reason' => null]);
    }
};
