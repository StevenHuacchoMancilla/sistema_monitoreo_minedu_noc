<?php

namespace App\Console\Commands;

use App\Models\FieldDispatch;
use App\Models\Incident;
use App\Models\IncidentAttachment;
use App\Models\IncidentManagement;
use App\Models\IncidentUpdate;
use App\Models\ServiceTicket;
use App\Models\SyncIssue;
use App\Models\SyncRun;
use App\Models\TrackingRecord;
use App\Models\TrackingUpdate;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;

/**
 * Arranque en blanco operativo: borra tickets/caídas/lista/tracking.
 * Conserva colegios, asignaciones, sensores PRTG y usuarios.
 */
class ResetIncidentManagementDataCommand extends Command
{
    protected $signature = 'incidents:reset-management
                            {--force : Ejecuta sin confirmación}
                            {--dry-run : Solo muestra conteos}
                            {--keep-incidents : Solo vacía gestiones/tickets (modo anterior)}';

    protected $description = 'Vacía datos operativos (incidencias, tickets, lista) conservando colegios y usuarios';

    public function handle(): int
    {
        $keepIncidents = (bool) $this->option('keep-incidents');

        $counts = [
            'incidents' => Incident::query()->count(),
            'incident_attachments' => Schema::hasTable('incident_attachments')
                ? IncidentAttachment::query()->count()
                : 0,
            'incident_managements' => IncidentManagement::query()->count(),
            'incident_updates' => IncidentUpdate::query()->count(),
            'service_tickets' => ServiceTicket::query()->count(),
            'tracking_records' => class_exists(TrackingRecord::class) ? TrackingRecord::query()->count() : 0,
            'tracking_updates' => class_exists(TrackingUpdate::class) ? TrackingUpdate::query()->count() : 0,
            'field_dispatches' => Schema::hasTable('field_dispatches') ? FieldDispatch::query()->count() : 0,
            'lista_llee_days' => Schema::hasTable('lista_llee_days') ? DB::table('lista_llee_days')->count() : 0,
            'lista_llee_day_rows' => Schema::hasTable('lista_llee_day_rows') ? DB::table('lista_llee_day_rows')->count() : 0,
            'sync_issues' => Schema::hasTable('sync_issues') ? SyncIssue::query()->count() : 0,
            'sync_runs' => Schema::hasTable('sync_runs') ? SyncRun::query()->count() : 0,
            'schools_preserved' => DB::table('schools')->count(),
            'users_preserved' => DB::table('users')->count(),
        ];

        $this->table(['Dato', 'Filas'], collect($counts)->map(fn ($v, $k) => [$k, $v])->values()->all());

        if ($this->option('dry-run')) {
            $this->info('[DRY-RUN] Nada modificado.');

            return self::SUCCESS;
        }

        $prompt = $keepIncidents
            ? '¿Vaciar gestiones/tickets/historial precargados (conservar incidencias)?'
            : '¿Borrar TODAS las incidencias/tickets/lista y dejar el sistema en blanco (colegios y usuarios se conservan)?';

        if (! $this->option('force') && ! $this->confirm($prompt, false)) {
            $this->warn('Cancelado.');

            return self::FAILURE;
        }

        DB::transaction(function () use ($keepIncidents): void {
            if (Schema::hasTable('lista_llee_day_rows')) {
                DB::table('lista_llee_day_rows')->delete();
            }
            if (Schema::hasTable('lista_llee_days')) {
                DB::table('lista_llee_days')->delete();
            }
            if (Schema::hasTable('tracking_updates')) {
                TrackingUpdate::query()->delete();
            }
            if (Schema::hasTable('tracking_records')) {
                TrackingRecord::query()->delete();
            }
            if (Schema::hasTable('field_dispatches')) {
                FieldDispatch::query()->delete();
            }

            IncidentManagement::query()->delete();
            IncidentUpdate::query()->delete();
            ServiceTicket::query()->delete();

            if (Schema::hasTable('incident_attachments')) {
                $paths = IncidentAttachment::query()->pluck('path')->filter()->all();
                IncidentAttachment::query()->delete();
                foreach ($paths as $path) {
                    if (is_string($path) && $path !== '' && Storage::disk('public')->exists($path)) {
                        Storage::disk('public')->delete($path);
                    }
                }
                if (Storage::disk('public')->exists('ticket-evidence')) {
                    Storage::disk('public')->deleteDirectory('ticket-evidence');
                }
            }

            if (Schema::hasTable('sync_issues')) {
                SyncIssue::query()->delete();
            }
            if (Schema::hasTable('sync_runs')) {
                SyncRun::query()->delete();
            }

            if ($keepIncidents) {
                Incident::query()->update([
                    'detail_text' => null,
                    'outage_text' => null,
                    'root_cause_code' => null,
                    'cause' => null,
                    'minedu_reason' => null,
                    'management_classification' => \App\Enums\ManagementClassification::NewOutage->value,
                    'management_scope' => null,
                    'lista_llee_estado' => null,
                    'last_contact_at' => null,
                    'clock_paused_at' => null,
                    'clock_pause_seconds' => 0,
                    'clock_pauses' => null,
                    'recovered_while_managing' => false,
                    'reopened_from_management' => false,
                    'recovery_review_status' => null,
                    'recovery_reviewed_at' => null,
                    'is_grave_incident' => false,
                    'grave_opened_at' => null,
                    'grave_closed_at' => null,
                    'is_requirement_case' => false,
                    'requirement_opened_at' => null,
                    'requirement_closed_at' => null,
                ]);

                Incident::query()
                    ->whereNull('recovered_at')
                    ->update([
                        'followup_status' => \App\Enums\FollowupStatus::PendienteContacto->value,
                    ]);
            } else {
                // Hijos ya borrados; cascadas/FK restantes.
                Incident::query()->delete();
            }
        });

        if ($keepIncidents) {
            $this->info('Gestión/tickets/historial vaciados. Incidencias conservadas.');
        } else {
            $this->info('Sistema operativo en blanco. Colegios, sensores y usuarios conservados.');
        }

        return self::SUCCESS;
    }
}
