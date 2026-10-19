<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::dropIfExists('cloudnet_aps');
        Schema::dropIfExists('cloudnet_devices');
        Schema::dropIfExists('cloudnet_sites');

        // Historial de sync Cloudnet (issues → runs)
        if (Schema::hasTable('sync_issues') && Schema::hasTable('sync_runs')) {
            DB::table('sync_issues')
                ->whereIn('sync_run_id', DB::table('sync_runs')->where('source', 'CLOUDNET')->select('id'))
                ->delete();

            DB::table('sync_runs')->where('source', 'CLOUDNET')->delete();
        }
    }

    public function down(): void
    {
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
    }
};
