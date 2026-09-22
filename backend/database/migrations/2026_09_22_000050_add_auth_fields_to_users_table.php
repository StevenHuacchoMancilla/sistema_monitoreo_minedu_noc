<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('role')->default('NOC_OPERATOR')->after('password');
            $table->boolean('active')->default(true)->after('role');
            $table->timestamp('last_login_at')->nullable()->after('active');

            $table->index('role');
            $table->index('active');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropIndex(['role']);
            $table->dropIndex(['active']);
            $table->dropColumn(['role', 'active', 'last_login_at']);
        });
    }
};
