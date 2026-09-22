<?php

namespace App\Console\Commands;

use App\Domain\Tracking\Services\TrackingImportService;
use Illuminate\Console\Command;

class ImportTrackingCommand extends Command
{
    protected $signature = 'tracking:import
        {--file= : Ruta al Excel TRACKING GENERAL.xlsx}
        {--year=2026 : Año para fechas dd/mm sin año}
        {--dry-run : Simula sin escribir en BD}
        {--force : Reemplaza trackings ya importados con el mismo N°}';

    protected $description = 'Importa el histórico Tracking General (independiente del reporte operativo LLEE)';

    public function handle(TrackingImportService $service): int
    {
        ini_set('memory_limit', '512M');

        $file = $this->option('file') ?: storage_path('app/import/TRACKING GENERAL.xlsx');
        $year = (int) $this->option('year');
        $dryRun = (bool) $this->option('dry-run');
        $force = (bool) $this->option('force');

        if ($year < 2000 || $year > 2100) {
            $this->error('El --year debe ser un año válido (ej. 2026).');

            return self::FAILURE;
        }

        if (! is_file($file)) {
            $this->error('No se encontró el Excel: '.$file);
            $this->line('Copia TRACKING GENERAL.xlsx a storage/app/import/ o pasa --file=...');

            return self::FAILURE;
        }

        $this->info(($dryRun ? '[DRY-RUN] ' : '').'Importando Tracking General...');
        $this->line('Archivo: '.$file);
        $this->line('Año: '.$year);

        $summary = $service->import($file, $year, $dryRun, $force);

        $this->newLine();
        $this->table(
            ['Métrica', 'Valor'],
            [
                ['Estado', $summary['status']],
                ['Filas fuente', $summary['received_count']],
                ['Procesadas', $summary['processed_count']],
                ['Creadas', $summary['created_count']],
                ['Actualizadas', $summary['updated_count']],
                ['Omitidas', $summary['skipped_count']],
                ['Updates creados', $summary['updates_created']],
                ['Mismatch CID/TSS', $summary['mismatch_count']],
                ['Colegio no encontrado', $summary['not_found_count']],
                ['Warnings', $summary['warning_count']],
                ['Errors', $summary['error_count']],
                ['Sync run', $summary['sync_run_id']],
            ]
        );

        return ($summary['status'] ?? '') === 'FAILED' ? self::FAILURE : self::SUCCESS;
    }
}
