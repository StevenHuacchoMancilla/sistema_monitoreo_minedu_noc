<?php

namespace App\Console\Commands;

use App\Models\FieldDispatch;
use App\Models\Incident;
use App\Models\IncidentManagement;
use App\Models\IncidentUpdate;
use App\Models\ServiceTicket;
use App\Models\TrackingRecord;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Arranque limpio del reporte: deja solo caídas abiertas, pendiente de cierre e incidencias graves.
 */
class PurgeHistoricalIncidentsCommand extends Command
{
    protected $signature = 'incidents:purge-historical
                            {--dry-run : Solo cuenta, no borra}';

    protected $description = 'Elimina incidencias históricas recuperadas/cerradas; conserva abiertas, pendiente de cierre e incidencias graves';

    public function handle(): int
    {
        $keepQuery = Incident::query()->where(function ($q) {
            $q->whereNull('recovered_at')
                ->orWhere('followup_status', 'PENDIENTE_CIERRE')
                ->orWhere(function ($q2) {
                    $q2->where('is_grave_incident', true)->whereNull('grave_closed_at');
                });
        });

        $dropIds = Incident::query()
            ->whereNot(function ($q) {
                $q->whereNull('recovered_at')
                    ->orWhere('followup_status', 'PENDIENTE_CIERRE')
                    ->orWhere(function ($q2) {
                        $q2->where('is_grave_incident', true)->whereNull('grave_closed_at');
                    });
            })
            ->orderBy('id')
            ->pluck('id');

        $keep = (clone $keepQuery)->count();
        $drop = $dropIds->count();

        $this->info("Conservar: {$keep} · Eliminar: {$drop}");

        if ($drop === 0) {
            $this->info('Nada que limpiar.');

            return self::SUCCESS;
        }

        if ($this->option('dry-run')) {
            $this->info('Dry-run: no se borró nada.');

            return self::SUCCESS;
        }

        $chunks = $dropIds->chunk(200);
        $deleted = 0;

        foreach ($chunks as $chunk) {
            $ids = $chunk->all();
            DB::transaction(function () use ($ids, &$deleted) {
                IncidentManagement::query()->whereIn('incident_id', $ids)->delete();
                IncidentUpdate::query()->whereIn('incident_id', $ids)->delete();
                FieldDispatch::query()->whereIn('incident_id', $ids)->delete();
                ServiceTicket::query()->whereIn('incident_id', $ids)->delete();
                TrackingRecord::query()->whereIn('incident_id', $ids)->delete();
                $deleted += Incident::query()->whereIn('id', $ids)->delete();
            });
        }

        $this->info("Histórico eliminado: {$deleted} incidencia(s). Quedan {$keep} operativas.");

        return self::SUCCESS;
    }
}
