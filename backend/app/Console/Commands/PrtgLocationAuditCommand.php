<?php

namespace App\Console\Commands;

use App\Domain\Monitoring\PRTG\Services\PrtgSyncService;
use Illuminate\Console\Command;
use Throwable;

class PrtgLocationAuditCommand extends Command
{
    protected $signature = 'prtg:location-audit {--detail : Listar PROVINCIA / DISTRITO / CID / DEVICE / MATCH DB}';

    protected $description = 'Auditoría READ-ONLY de provincias/distritos PRTG vs BD. No modifica datos.';

    public function handle(PrtgSyncService $service): int
    {
        $verbose = (bool) $this->option('detail');

        $this->info('================================================');
        $this->info('PRTG LOCATION AUDIT');
        $this->info('================================================');
        $this->newLine();

        try {
            $summary = $service->locationAudit($verbose);
        } catch (Throwable $exception) {
            $this->error($exception->getMessage());

            return self::FAILURE;
        }

        $this->table(['Métrica', 'Valor'], [
            ['Probe', $summary['probe'] ?? ''],
            ['Root group', $summary['root_group'] ?? ''],
            ['Root objid', $summary['root_objid'] ?? ''],
            ['Provincias detectadas', $summary['provinces'] ?? 0],
            ['Distritos detectados', $summary['districts'] ?? 0],
            ['Devices (subtree)', $summary['devices_in_scope'] ?? 0],
            ['Devices CID', $summary['devices_cid'] ?? 0],
            ['Unique CIDs', $summary['unique_cids'] ?? 0],
            ['Duplicate CIDs', $summary['duplicate_cids'] ?? 0],
            ['CIDs asociados (BD)', $summary['associated_with_db'] ?? 0],
            ['CIDs sin asociación', $summary['unassociated'] ?? 0],
            ['Devices sin provincia', $summary['devices_without_province'] ?? 0],
            ['Devices sin distrito', $summary['devices_without_district'] ?? 0],
            ['Jerarquía inesperada', $summary['unexpected_hierarchy'] ?? 0],
            ['Location mismatches', $summary['location_mismatches'] ?? 0],
            ['Assignments con prtg_*', $summary['assignments_with_prtg_location'] ?? 0],
            ['Assignments sin prtg_*', $summary['assignments_missing_prtg_location'] ?? 0],
        ]);

        $this->newLine();
        $this->info('Desglose por provincia');
        $breakdown = collect($summary['province_breakdown'] ?? [])
            ->map(fn (array $row) => [
                $row['province'],
                $row['districts'],
                $row['devices'],
                $row['associated'],
                $row['mismatches'],
            ])
            ->all();

        if ($breakdown === []) {
            $this->comment('Sin provincias bajo el root allowlist.');
        } else {
            $this->table(
                ['Provincia', 'Distritos', 'Devices CID', 'Asociados', 'Mismatches'],
                $breakdown
            );
        }

        if ($verbose) {
            $this->newLine();
            $this->info('Detalle CID (verbose)');
            $rows = collect($summary['verbose_rows'] ?? [])
                ->map(fn (array $row) => [
                    $row['province'],
                    $row['district'],
                    $row['cid'],
                    $row['device'],
                    $row['match_db'],
                    $row['db_province'],
                    $row['db_district'],
                    $row['stored_prtg_province'] ?? '—',
                    $row['stored_prtg_district'] ?? '—',
                    $row['warning'] !== '' ? $row['warning'] : '—',
                ])
                ->all();

            if ($rows === []) {
                $this->comment('Sin devices CID en scope.');
            } else {
                $this->table(
                    ['PROVINCIA', 'DISTRITO', 'CID', 'DEVICE', 'MATCH DB', 'ADMIN PROV', 'ADMIN DIST', 'PRTG PROV', 'PRTG DIST', 'WARNING'],
                    $rows
                );
            }
        }

        $this->newLine();
        $this->info('Scope: '.($summary['source_scope'] ?? ''));
        $this->comment('READ ONLY — no se modificaron schools, sensores ni incidencias.');

        return self::SUCCESS;
    }
}
