<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('schools', function (Blueprint $table) {
            $table->id();
            $table->unsignedInteger('current_sequence')->nullable()->index();
            $table->string('legacy_reference')->nullable();
            $table->string('codigo_local');
            $table->string('codigo_modular')->nullable();
            $table->string('local_educativo');
            $table->string('departamento')->nullable();
            $table->string('provincia')->nullable();
            $table->string('distrito')->nullable();
            $table->string('centro_poblado')->nullable();
            $table->string('latitud')->nullable();
            $table->string('longitud')->nullable();
            $table->string('clasificacion')->nullable();
            $table->string('nivel_iiee')->nullable();
            $table->boolean('active')->default(true);
            $table->string('contact_match_status')->default('CONTACT_PENDING');
            $table->unsignedTinyInteger('contact_match_priority')->nullable();
            $table->unsignedInteger('contact_source_row')->nullable();
            $table->string('source')->default('IMPORT');
            $table->string('source_file')->nullable();
            $table->unsignedInteger('source_row')->nullable();
            $table->softDeletes();
            $table->timestamps();

            $table->index('codigo_local');
            $table->index('provincia');
            $table->index('distrito');
            $table->index(['codigo_local', 'codigo_modular']);
        });

        Schema::create('network_assignments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('school_id')->constrained()->restrictOnDelete();
            $table->string('cid')->nullable();
            $table->string('cid_status');
            $table->boolean('monitoring_eligible')->default(false);
            $table->string('prtg_device_name')->nullable();
            $table->string('sysname_router')->nullable();
            $table->string('capacidad_mbps')->nullable();
            $table->string('tecnologia_acceso')->nullable();
            $table->string('nodo_pop')->nullable();
            $table->string('ip_publica')->nullable();
            $table->string('ip_loopback')->nullable();
            $table->string('nodo_acceso_a')->nullable();
            $table->string('gateway_wan')->nullable();
            $table->string('ip_wan_principal')->nullable();
            $table->string('netmask_wan_principal')->nullable();
            $table->string('puerto_switch_a')->nullable();
            $table->string('modulo_optico_a')->nullable();
            $table->string('nodo_acceso_b')->nullable();
            $table->string('ip_wan_secundaria')->nullable();
            $table->string('netmask_wan_secundaria')->nullable();
            $table->string('puerto_switch_b')->nullable();
            $table->string('modulo_optico_b')->nullable();
            $table->string('vlan_uplink')->nullable();
            $table->string('vlan_internet')->nullable();
            $table->string('ip_lan')->nullable();
            $table->string('puerto_nodo_a')->nullable();
            $table->string('puerto_nodo_b')->nullable();
            $table->string('vlan_mgmt_ap')->nullable();
            $table->string('ip_mgmt_ap')->nullable();
            $table->string('ssid_ap')->nullable();
            $table->string('estado_router_fuente')->nullable();
            $table->string('estado_ap_fuente')->nullable();
            $table->string('enlaces')->nullable();
            $table->string('config_prtg')->nullable();
            $table->string('serie_router')->nullable();
            $table->string('serie_ap')->nullable();
            $table->string('serie_ont')->nullable();
            $table->string('olt')->nullable();
            $table->string('puerto_olt')->nullable();
            $table->text('observaciones')->nullable();
            $table->date('fecha_activacion')->nullable();
            $table->timestamp('valid_from')->nullable();
            $table->timestamp('valid_to')->nullable();
            $table->boolean('is_active')->default(true);
            $table->string('source')->default('IMPORT');
            $table->string('source_file')->nullable();
            $table->unsignedInteger('source_row')->nullable();
            $table->softDeletes();
            $table->timestamps();

            $table->index('cid');
            $table->index('is_active');
            $table->index(['school_id', 'is_active']);
        });

        Schema::create('school_contacts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('school_id')->constrained()->restrictOnDelete();
            $table->unsignedTinyInteger('position');
            $table->string('name')->nullable();
            $table->string('role')->nullable();
            $table->string('phone')->nullable();
            $table->string('validation_status')->nullable();
            $table->string('source')->default('IMPORT');
            $table->string('source_file')->nullable();
            $table->unsignedInteger('source_row')->nullable();
            $table->softDeletes();
            $table->timestamps();

            $table->unique(['school_id', 'position']);
        });

        Schema::create('sync_runs', function (Blueprint $table) {
            $table->id();
            $table->string('source');
            $table->timestamp('started_at');
            $table->timestamp('finished_at')->nullable();
            $table->string('status');
            $table->unsignedInteger('received_count')->default(0);
            $table->unsignedInteger('processed_count')->default(0);
            $table->unsignedInteger('created_count')->default(0);
            $table->unsignedInteger('updated_count')->default(0);
            $table->unsignedInteger('ignored_count')->default(0);
            $table->unsignedInteger('warning_count')->default(0);
            $table->unsignedInteger('error_count')->default(0);
            $table->json('metadata')->nullable();
            $table->timestamps();
        });

        Schema::create('sync_issues', function (Blueprint $table) {
            $table->id();
            $table->foreignId('sync_run_id')->constrained()->cascadeOnDelete();
            $table->string('severity');
            $table->string('code');
            $table->unsignedInteger('source_row')->nullable();
            $table->string('cid')->nullable();
            $table->string('codigo_local')->nullable();
            $table->text('message');
            $table->json('payload')->nullable();
            $table->timestamp('created_at')->nullable();
        });

        Schema::create('audit_logs', function (Blueprint $table) {
            $table->id();
            $table->string('entity_type');
            $table->unsignedBigInteger('entity_id');
            $table->string('action');
            $table->json('before_json')->nullable();
            $table->json('after_json')->nullable();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('source')->nullable();
            $table->timestamp('created_at')->nullable();

            $table->index(['entity_type', 'entity_id']);
        });

        $driver = Schema::getConnection()->getDriverName();

        if ($driver === 'pgsql') {
            DB::statement("
                CREATE UNIQUE INDEX network_assignments_active_valid_cid_unique
                ON network_assignments (cid)
                WHERE is_active = true
                  AND deleted_at IS NULL
                  AND cid_status = 'VALID'
                  AND cid IS NOT NULL
            ");
            DB::statement("
                CREATE UNIQUE INDEX network_assignments_active_school_unique
                ON network_assignments (school_id)
                WHERE is_active = true
                  AND deleted_at IS NULL
            ");
        } else {
            DB::statement("
                CREATE UNIQUE INDEX network_assignments_active_valid_cid_unique
                ON network_assignments (cid)
                WHERE is_active = 1
                  AND deleted_at IS NULL
                  AND cid_status = 'VALID'
                  AND cid IS NOT NULL
            ");
            DB::statement("
                CREATE UNIQUE INDEX network_assignments_active_school_unique
                ON network_assignments (school_id)
                WHERE is_active = 1
                  AND deleted_at IS NULL
            ");
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('audit_logs');
        Schema::dropIfExists('sync_issues');
        Schema::dropIfExists('sync_runs');
        Schema::dropIfExists('school_contacts');
        Schema::dropIfExists('network_assignments');
        Schema::dropIfExists('schools');
    }
};
