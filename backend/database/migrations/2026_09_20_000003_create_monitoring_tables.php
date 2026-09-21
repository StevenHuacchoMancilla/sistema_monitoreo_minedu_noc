<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('prtg_sensors', function (Blueprint $table) {
            $table->id();
            $table->foreignId('network_assignment_id')->nullable()->constrained()->nullOnDelete();
            $table->string('prtg_sensor_id')->index();
            $table->string('prtg_device_id')->nullable()->index();
            $table->string('device_name')->nullable();
            $table->string('name');
            $table->string('type')->nullable();
            $table->integer('status_raw')->nullable()->index();
            $table->string('status_text')->nullable();
            $table->string('normalized_status')->nullable()->index();
            $table->string('last_value')->nullable();
            $table->string('unit')->nullable();
            $table->timestamp('last_check')->nullable();
            $table->string('down_since')->nullable();
            $table->timestamp('last_synced_at')->nullable();
            $table->json('metadata')->nullable();
            $table->timestamps();

            $table->unique('prtg_sensor_id');
        });

        Schema::create('prtg_events', function (Blueprint $table) {
            $table->id();
            $table->foreignId('network_assignment_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('prtg_sensor_id')->nullable()->constrained('prtg_sensors')->nullOnDelete();
            $table->string('previous_status')->nullable();
            $table->string('new_status');
            $table->timestamp('occurred_at');
            $table->json('payload')->nullable();
            $table->timestamp('created_at')->nullable();
        });

        Schema::create('incidents', function (Blueprint $table) {
            $table->id();
            $table->foreignId('school_id')->constrained()->restrictOnDelete();
            $table->foreignId('network_assignment_id')->constrained()->restrictOnDelete();
            $table->foreignId('prtg_sensor_id')->nullable()->constrained('prtg_sensors')->nullOnDelete();
            $table->timestamp('started_at')->index();
            $table->timestamp('recovered_at')->nullable()->index();
            $table->string('current_status')->nullable();
            $table->string('followup_status')->default('PENDIENTE_CONTACTO')->index();
            $table->string('contact_status')->nullable();
            $table->string('cause')->nullable();
            $table->text('evidence_observations')->nullable();
            $table->timestamp('last_contact_at')->nullable();
            $table->json('school_snapshot')->nullable();
            $table->json('network_snapshot')->nullable();
            $table->timestamps();
        });

        Schema::create('incident_updates', function (Blueprint $table) {
            $table->id();
            $table->foreignId('incident_id')->constrained()->cascadeOnDelete();
            $table->string('type')->default('NOTE');
            $table->string('status_before')->nullable();
            $table->string('status_after')->nullable();
            $table->text('observation')->nullable();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->timestamp('created_at')->nullable();
        });

        Schema::create('cloudnet_sites', function (Blueprint $table) {
            $table->id();
            $table->string('shop_id')->unique();
            $table->string('site_name')->nullable();
            $table->string('cid_detected')->nullable()->index();
            $table->string('codigo_local_detected')->nullable()->index();
            $table->foreignId('network_assignment_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('school_id')->nullable()->constrained()->nullOnDelete();
            $table->string('address')->nullable();
            $table->string('match_status')->nullable();
            $table->timestamp('last_synced_at')->nullable();
            $table->json('metadata')->nullable();
            $table->timestamps();
        });

        Schema::create('cloudnet_devices', function (Blueprint $table) {
            $table->id();
            $table->foreignId('cloudnet_site_id')->constrained()->cascadeOnDelete();
            $table->string('serial')->nullable()->index();
            $table->string('model')->nullable();
            $table->string('status')->nullable();
            $table->string('ip')->nullable();
            $table->string('mac')->nullable();
            $table->timestamp('online_time')->nullable();
            $table->timestamp('last_synced_at')->nullable();
            $table->json('metadata')->nullable();
            $table->timestamps();
        });

        Schema::create('cloudnet_aps', function (Blueprint $table) {
            $table->id();
            $table->foreignId('cloudnet_site_id')->constrained()->cascadeOnDelete();
            $table->foreignId('cloudnet_device_id')->nullable()->constrained()->nullOnDelete();
            $table->string('serial')->nullable()->index();
            $table->string('model')->nullable();
            $table->string('status')->nullable();
            $table->string('mac')->nullable();
            $table->string('ip')->nullable();
            $table->unsignedInteger('clients')->nullable();
            $table->timestamp('last_synced_at')->nullable();
            $table->json('metadata')->nullable();
            $table->timestamps();
        });

        $driver = Schema::getConnection()->getDriverName();
        if ($driver === 'pgsql') {
            DB::statement('
                CREATE UNIQUE INDEX incidents_one_active_per_assignment_sensor
                ON incidents (network_assignment_id, prtg_sensor_id)
                WHERE recovered_at IS NULL
            ');
        } else {
            DB::statement('
                CREATE UNIQUE INDEX incidents_one_active_per_assignment_sensor
                ON incidents (network_assignment_id, prtg_sensor_id)
                WHERE recovered_at IS NULL
            ');
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('cloudnet_aps');
        Schema::dropIfExists('cloudnet_devices');
        Schema::dropIfExists('cloudnet_sites');
        Schema::dropIfExists('incident_updates');
        Schema::dropIfExists('incidents');
        Schema::dropIfExists('prtg_events');
        Schema::dropIfExists('prtg_sensors');
    }
};
