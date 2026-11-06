<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('service_tickets', function (Blueprint $table) {
            $table->id();
            $table->foreignId('incident_id')->nullable()->unique()->constrained()->nullOnDelete();
            $table->foreignId('school_id')->nullable()->constrained()->nullOnDelete();
            $table->string('ticket_code', 40)->unique();
            $table->string('kind', 20);
            $table->string('status', 20)->default('ABIERTO')->index();
            $table->string('cid', 32)->nullable()->index();
            $table->string('tss', 32)->nullable();
            $table->string('school_name')->nullable();
            $table->string('province')->nullable();
            $table->string('district')->nullable();
            $table->string('energy')->nullable();
            $table->string('area')->nullable();
            $table->string('opened_by_name')->nullable();
            $table->string('closed_by_name')->nullable();
            $table->string('minedu')->nullable();
            $table->string('cause_code', 16)->nullable();
            $table->string('segment')->nullable();
            $table->string('attention')->nullable();
            $table->string('cause')->nullable();
            $table->text('detail')->nullable();
            $table->timestamp('opened_at')->nullable()->index();
            $table->timestamp('restored_at')->nullable();
            $table->timestamp('closed_at')->nullable();
            $table->string('technician_name')->nullable();
            $table->string('polygon')->nullable();
            $table->string('visit_reason')->nullable();
            $table->timestamp('arrived_at')->nullable();
            $table->timestamp('departed_at')->nullable();
            $table->text('activities')->nullable();
            $table->text('materials')->nullable();
            $table->string('source', 20)->default('LIVE');
            $table->unsignedInteger('source_row')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('service_tickets');
    }
};
