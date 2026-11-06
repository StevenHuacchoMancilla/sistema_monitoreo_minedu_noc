<?php

namespace App\Console\Commands;

use App\Domain\Ticketera\Services\TicketeraWorkbookImporter;
use Illuminate\Console\Command;

class TicketeraImportCommand extends Command
{
    protected $signature = 'ticketera:import {path : Ruta del Excel de ticketera}';

    protected $description = 'Carga la hoja TICKETERA al sistema y asigna código a las caídas abiertas';

    public function handle(TicketeraWorkbookImporter $importer): int
    {
        $path = (string) $this->argument('path');
        $counts = $importer->import($path);
        $this->info(sprintf(
            'Importados %d · ya existían %d · sin colegio %d · caídas abiertas con código %d',
            $counts['imported'],
            $counts['skipped'],
            $counts['unmatched'],
            $counts['linked'],
        ));

        return self::SUCCESS;
    }
};
