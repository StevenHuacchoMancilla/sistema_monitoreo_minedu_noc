<?php

use App\Enums\ManagementClassification;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('incidents', function (Blueprint $table) {
            $table->string('management_classification')
                ->default(ManagementClassification::Unclassified->value)
                ->after('followup_status')
                ->index();
            $table->string('management_scope')->nullable()->after('management_classification');
            $table->text('outage_text')->nullable()->after('management_scope');
            $table->text('detail_text')->nullable()->after('outage_text');
            $table->foreignId('last_managed_contact_id')
                ->nullable()
                ->after('detail_text')
                ->constrained('school_contacts')
                ->nullOnDelete();
        });

        Schema::create('incident_managements', function (Blueprint $table) {
            $table->id();
            $table->foreignId('incident_id')->constrained()->cascadeOnDelete();
            $table->string('classification')->index();
            $table->string('scope')->nullable();
            $table->text('outage_text')->nullable();
            $table->text('detail')->nullable();
            $table->text('observation')->nullable();
            $table->foreignId('contact_id')->nullable()->constrained('school_contacts')->nullOnDelete();
            $table->string('contact_name_snapshot')->nullable();
            $table->string('contact_phone_snapshot')->nullable();
            $table->string('contact_role_snapshot')->nullable();
            $table->timestamp('contact_attempted_at')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['incident_id', 'created_at']);
        });

        // Activas sin gestión previa → NEW_OUTAGE (aparecen como amarillas).
        DB::table('incidents')
            ->whereNull('recovered_at')
            ->update([
                'management_classification' => ManagementClassification::NewOutage->value,
            ]);

        // Cerradas históricas → UNCLASSIFIED (no inventar contacto).
        DB::table('incidents')
            ->whereNotNull('recovered_at')
            ->update([
                'management_classification' => ManagementClassification::Unclassified->value,
            ]);
    }

    public function down(): void
    {
        Schema::dropIfExists('incident_managements');

        Schema::table('incidents', function (Blueprint $table) {
            $table->dropConstrainedForeignId('last_managed_contact_id');
            $table->dropColumn([
                'management_classification',
                'management_scope',
                'outage_text',
                'detail_text',
            ]);
        });
    }
};
