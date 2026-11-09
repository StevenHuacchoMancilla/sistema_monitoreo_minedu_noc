<?php

namespace App\Console\Commands;

use App\Domain\Ticketera\Services\ServiceTicketService;
use Illuminate\Console\Command;

class PruneUnmanagedTicketsCommand extends Command
{
    protected $signature = 'tickets:prune-unmanaged';

    protected $description = 'Elimina tickets LIVE abiertos sin gestión (creados al caer antes de la nueva lógica)';

    public function handle(ServiceTicketService $tickets): int
    {
        $deleted = $tickets->pruneUnmanagedLiveTickets();
        $this->info("Tickets sin gestión eliminados: {$deleted}");

        return self::SUCCESS;
    }
}
