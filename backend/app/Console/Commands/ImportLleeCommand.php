<?php

namespace App\Console\Commands;

use App\Services\ExcelImportService;
use Illuminate\Console\Command;

class ImportLleeCommand extends Command
{
    protected $signature = 'llee:import
        {--resources= : Ruta al Excel Recurso de Red MINEDU}
        {--contacts= : Ruta al Excel LLEE BASE DE DATOS}';

    protected $description = 'Importa locales educativos y contactos desde los Excel MINEDU';

    public function handle(ExcelImportService $service): int
    {
        ini_set('memory_limit', '512M');
        $resources = $this->option('resources') ?: storage_path('app/private/import/Recurso de Red MINEDU 2.xlsx');
        $contacts = $this->option('contacts') ?: storage_path('app/private/import/LLEE - BASE DE DATOS.xlsx');

        if (! is_file($resources)) {
            $this->error('No se encontró el Excel de recursos: '.$resources);

            return self::FAILURE;
        }

        if (! is_file($contacts)) {
            $this->error('No se encontró el Excel de contactos: '.$contacts);

            return self::FAILURE;
        }

        $this->info('Importando recursos y contactos...');
        $summary = $service->import($resources, $contacts);

        $this->newLine();
        $this->table(
            ['Métrica', 'Valor'],
            [
                ['Estado', $summary['status']],
                ['Filas fuente', $summary['received_count']],
                ['Procesadas', $summary['processed_count']],
                ['Locales creados', $summary['schools_created']],
                ['Locales actualizados', $summary['schools_updated']],
                ['Locales sin cambios', $summary['schools_unchanged']],
                ['Asignaciones creadas', $summary['assignments_created']],
                ['Asignaciones actualizadas', $summary['assignments_updated']],
                ['Asignaciones cerradas', $summary['assignments_closed']],
                ['CIDs válidos', $summary['cids_valid']],
                ['CIDs vacíos', $summary['cids_empty']],
                ['CIDs baja IMPE', $summary['cids_baja']],
                ['CIDs inválidos', $summary['cids_invalid']],
                ['Contactos asociados', $summary['contacts_associated']],
                ['Contactos pendientes', $summary['contacts_pending']],
                ['Contactos ambiguos', $summary['contacts_ambiguous']],
            ]
        );

        $this->info('Sync run #'.$summary['sync_run_id']);

        return self::SUCCESS;
    }
}
