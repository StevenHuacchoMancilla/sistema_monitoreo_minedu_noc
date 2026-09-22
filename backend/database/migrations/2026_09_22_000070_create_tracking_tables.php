<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('tracking_records', function (Blueprint $table) {
            $table->id();
            $table->unsignedInteger('incident_number')->nullable()->index();
            $table->foreignId('incident_id')->nullable()->constrained('incidents')->nullOnDelete();
            $table->foreignId('school_id')->constrained('schools')->restrictOnDelete();
            $table->foreignId('network_assignment_id')->nullable()->constrained('network_assignments')->nullOnDelete();

            $table->string('ticket')->nullable()->index();
            $table->string('tss_snapshot')->nullable()->index();
            $table->string('cid_snapshot')->nullable()->index();
            $table->text('description')->nullable();

            $table->string('status')->default('OPEN')->index();
            $table->string('technical_status')->nullable()->index();

            $table->timestamp('opened_at')->index();
            $table->string('opened_at_precision')->default('DATETIME');
            $table->foreignId('opened_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('opened_by_legacy_name')->nullable();

            $table->timestamp('closed_at')->nullable()->index();
            $table->string('closed_at_precision')->nullable();
            $table->foreignId('closed_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('closed_by_legacy_name')->nullable();
            $table->text('closing_note')->nullable();

            $table->timestamp('technical_recovered_at')->nullable();
            $table->unsignedInteger('lock_version')->default(1);

            $table->timestamps();

            $table->index(['status', 'opened_at']);
            $table->index(['school_id', 'status']);
            $table->unique('incident_number');
        });

        Schema::create('tracking_updates', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tracking_record_id')->constrained('tracking_records')->cascadeOnDelete();
            $table->string('event_type')->default('COMMENT')->index();
            $table->text('body');
            $table->foreignId('created_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('legacy_actor_name')->nullable();
            $table->date('occurred_on')->nullable()->index();
            $table->timestamp('occurred_at')->nullable();
            $table->timestamps();

            $table->index(['tracking_record_id', 'created_at']);
            $table->index(['tracking_record_id', 'occurred_on']);
        });

        $driver = Schema::getConnection()->getDriverName();
        if ($driver === 'pgsql') {
            DB::statement("
                CREATE UNIQUE INDEX tracking_records_one_open_per_incident
                ON tracking_records (incident_id)
                WHERE incident_id IS NOT NULL
                  AND status <> 'CLOSED'
            ");
        } else {
            // SQLite (tests): índice parcial equivalente.
            DB::statement("
                CREATE UNIQUE INDEX tracking_records_one_open_per_incident
                ON tracking_records (incident_id)
                WHERE incident_id IS NOT NULL
                  AND status != 'CLOSED'
            ");
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('tracking_updates');
        Schema::dropIfExists('tracking_records');
    }
};
