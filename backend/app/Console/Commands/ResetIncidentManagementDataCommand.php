<?php

namespace App\Console\Commands;

use App\Enums\FollowupStatus;
use App\Models\FieldDispatch;
use App\Models\Incident;
use App\Models\IncidentManagement;
use App\Models\IncidentUpdate;
use App\Models\ServiceTicket;
use App\Models\TrackingRecord;
use App\Models\TrackingUpdate;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Deja las caídas PRTG sin gestión/ticket/historial precargado (arranque operativo limpio).
 * Conserva colegios, sensores e incidencias abiertas/recuperadas.
 */
class ResetIncidentManagementDataCommand extends Command
{
    protected $signature = 'incidents:reset-management
                            {--force : Ejecuta sin confirmación}
                            {--dry-run : Solo muestra conteos}';

    protected $description = 'Vacía gestiones, tickets TGS, historial y causas precargadas; deja caídas listas para gestionar a mano';

    public function handle(): int
    {
        $counts = [
            'incident_managements' => IncidentManagement::query()->count(),
            'incident_updates' => IncidentUpdate::query()->count(),
            'service_tickets' => ServiceTicket::query()->count(),
            'tracking_records' => class_exists(TrackingRecord::class) ? TrackingRecord::query()->count() : 0,
            'tracking_updates' => class_exists(TrackingUpdate::class) ? TrackingUpdate::query()->count() : 0,
            'field_dispatches' => Schema::hasTable('field_dispatches') ? FieldDispatch::query()->count() : 0,
            'lista_llee_days' => Schema::hasTable('lista_llee_days') ? DB::table('lista_llee_days')->count() : 0,
            'lista_llee_day_rows' => Schema::hasTable('lista_llee_day_rows') ? DB::table('lista_llee_day_rows')->count() : 0,
            'incidents_with_detail' => Incident::query()->whereNotNull('detail_text')->where('detail_text', '!=', '')->count(),
            'incidents_with_cause' => Incident::query()->whereNotNull('root_cause_code')->where('root_cause_code', '!=', '')->count(),
            'active_incidents' => Incident::query()->whereNull('recovered_at')->count(),
        ];

        $this->table(['Dato', 'Filas'], collect($counts)->map(fn ($v, $k) => [$k, $v])->values()->all());

        if ($this->option('dry-run')) {
            $this->info('[DRY-RUN] Nada modificado.');

            return self::SUCCESS;
        }

        if (! $this->option('force') && ! $this->confirm('¿Vaciar gestiones/tickets/historial precargados?', false)) {
            $this->warn('Cancelado.');

            return self::FAILURE;
        }

        DB::transaction(function (): void {
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

            Incident::query()->update([
                'detail_text' => null,
                'outage_text' => null,
                'root_cause_code' => null,
                'cause' => null,
                'minedu_reason' => null,
                // NOT NULL en BD: sin gestionar = caída nueva / sin clasificar.
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

            // Caídas abiertas: vuelven a Pendiente de gestión para empezar de cero.
            Incident::query()
                ->whereNull('recovered_at')
                ->where(function ($q) {
                    $q->whereNull('followup_status')
                        ->orWhereNotIn('followup_status', [
                            FollowupStatus::Cerrado->value,
                            FollowupStatus::Recuperado->value,
                        ]);
                })
                ->update([
                    'followup_status' => FollowupStatus::PendienteContacto->value,
                ]);
        });

        $this->info('Gestión/tickets/historial vaciados. Caídas PRTG conservadas, listas para llenar a mano.');

        return self::SUCCESS;
    }
}
