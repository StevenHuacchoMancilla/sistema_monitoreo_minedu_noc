<?php

namespace App\Console\Commands;

use App\Domain\Incidents\Services\IncidentOperativeCloseService;
use App\Domain\Ticketera\Services\ServiceTicketService;
use App\Enums\FollowupStatus;
use App\Enums\MonitoringStatus;
use App\Models\Incident;
use Illuminate\Console\Command;

class PurgePendienteCierreCommand extends Command
{
    protected $signature = 'incidents:purge-pendiente-cierre
                            {--dry-run : Solo cuenta, no cierra}
                            {--with-parciales : También cierra caídas abiertas que solo están en PARCIAL (intermitentes)}';

    protected $description = 'Cierra Pendiente de cierre (y opcionalmente intermitentes) para arranque limpio';

    public function handle(
        IncidentOperativeCloseService $operativeClose,
        ServiceTicketService $serviceTickets,
    ): int {
        $pendienteIds = Incident::query()
            ->where('followup_status', FollowupStatus::PendienteCierre)
            ->orderBy('id')
            ->pluck('id');

        $parcialIds = collect();
        if ($this->option('with-parciales')) {
            $parcialIds = Incident::query()
                ->whereNull('recovered_at')
                ->where('followup_status', '!=', FollowupStatus::Cerrado)
                ->where(function ($q) {
                    $q->where('current_status', MonitoringStatus::Parcial->value)
                        ->orWhereHas(
                            'sensor',
                            fn ($s) => $s->where('normalized_status', MonitoringStatus::Parcial->value)
                        );
                })
                ->where('detection_source', '!=', Incident::DETECTION_MANUAL_PARTIAL)
                ->orderBy('id')
                ->pluck('id');
        }

        $ids = $pendienteIds->merge($parcialIds)->unique()->values();
        $total = $ids->count();

        if ($total === 0) {
            $this->info('Nada que limpiar.');

            return self::SUCCESS;
        }

        if ($this->option('dry-run')) {
            $this->info("Dry-run: {$pendienteIds->count()} pendiente(s) de cierre + {$parcialIds->count()} parcial(es).");

            return self::SUCCESS;
        }

        $closed = 0;
        foreach ($ids as $id) {
            $incident = Incident::query()->find($id);
            if ($incident === null) {
                continue;
            }
            if ($incident->followup_status === FollowupStatus::Cerrado) {
                continue;
            }

            $note = $incident->followup_status === FollowupStatus::PendienteCierre
                ? 'Cierre masivo: limpieza de Pendiente de cierre para arranque operativo.'
                : 'Cierre masivo: intermitente/parcial no cuenta como caída real.';

            $result = $operativeClose->close($incident, $note, 0);
            $serviceTickets->close($result['incident'], 'sistema');
            $closed++;
        }

        $this->info("Limpieza lista: {$closed} ticket(s) cerrado(s).");

        return self::SUCCESS;
    }
}
