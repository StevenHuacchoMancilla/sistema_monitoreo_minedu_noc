<?php

namespace App\Console\Commands;

use App\Domain\Schools\Services\ImplementacionWorkbookImporter;
use Illuminate\Console\Command;

class ImportImplementacionCommand extends Command
{
    protected $signature = 'schools:import-implementacion
        {path : Ruta al Excel con la hoja IMPLEMENTACION}
        {--dry-run : Solo cuenta coincidencias sin guardar}';

    protected $description = 'Actualiza ámbito (URBANA/RURAL), tipo de energía, zona e instalación desde la hoja IMPLEMENTACION';

    public function handle(ImplementacionWorkbookImporter $importer): int
    {
        $path = (string) $this->argument('path');
        $dry = (bool) $this->option('dry-run');

        $this->info(($dry ? '[DRY-RUN] ' : '').'Importando IMPLEMENTACION…');

        $counts = $importer->import($path, $dry);

        $this->info(sprintf(
            'Filas %d · actualizados %d · sin match %d · asignaciones tech %d · tickets energía %d',
            $counts['total_rows'],
            $counts['updated'],
            $counts['unmatched'],
            $counts['assignments_updated'],
            $counts['tickets_updated'],
        ));

        return self::SUCCESS;
    }
}
