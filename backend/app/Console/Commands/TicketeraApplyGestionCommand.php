<?php

namespace App\Console\Commands;

use App\Domain\Ticketera\Services\TicketeraGestionWriter;
use Illuminate\Console\Command;

class TicketeraApplyGestionCommand extends Command
{
    protected $signature = 'ticketera:apply-gestion';

    protected $description = 'Copia la ticketera importada a la gestión de cada ticket';

    public function handle(TicketeraGestionWriter $writer): int
    {
        $counts = $writer->applyImported();
        $this->info(sprintf(
            'Gestiones creadas %d · actualizadas %d · ya tenían causa %d · sin colegio %d',
            $counts['created'],
            $counts['updated'],
            $counts['skipped'],
            $counts['unmatched'],
        ));

        return self::SUCCESS;
    }
}
