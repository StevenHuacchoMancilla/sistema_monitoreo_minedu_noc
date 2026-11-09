<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('incidents', function (Blueprint $table) {
            $table->boolean('is_requirement_case')->default(false)->after('grave_closed_at');
            $table->timestamp('requirement_opened_at')->nullable()->after('is_requirement_case');
            $table->foreignId('requirement_opened_by_user_id')
                ->nullable()
                ->after('requirement_opened_at')
                ->constrained('users')
                ->nullOnDelete();
            $table->timestamp('requirement_closed_at')->nullable()->after('requirement_opened_by_user_id');
            $table->index(['is_requirement_case', 'requirement_closed_at'], 'incidents_requirement_open_idx');
        });
    }

    public function down(): void
    {
        Schema::table('incidents', function (Blueprint $table) {
            $table->dropIndex('incidents_requirement_open_idx');
            $table->dropConstrainedForeignId('requirement_opened_by_user_id');
            $table->dropColumn([
                'is_requirement_case',
                'requirement_opened_at',
                'requirement_closed_at',
            ]);
        });
    }
};
