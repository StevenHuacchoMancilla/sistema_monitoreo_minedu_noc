<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('incidents', function (Blueprint $table) {
            $table->boolean('recovered_while_managing')
                ->default(false)
                ->after('recovered_at')
                ->index();
            $table->string('recovery_review_status')
                ->nullable()
                ->after('recovered_while_managing')
                ->index();
            $table->timestamp('recovery_reviewed_at')
                ->nullable()
                ->after('recovery_review_status');
        });
    }

    public function down(): void
    {
        Schema::table('incidents', function (Blueprint $table) {
            $table->dropColumn([
                'recovered_while_managing',
                'recovery_review_status',
                'recovery_reviewed_at',
            ]);
        });
    }
};
