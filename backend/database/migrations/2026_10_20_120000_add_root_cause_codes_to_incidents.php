<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('incidents', function (Blueprint $table) {
            $table->string('root_cause_group_code', 8)->nullable()->after('cause');
            $table->string('root_cause_code', 16)->nullable()->after('root_cause_group_code');
        });
    }

    public function down(): void
    {
        Schema::table('incidents', function (Blueprint $table) {
            $table->dropColumn(['root_cause_group_code', 'root_cause_code']);
        });
    }
};
