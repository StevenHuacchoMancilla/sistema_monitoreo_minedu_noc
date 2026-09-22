<?php

namespace App\Console\Commands;

use App\Domain\Monitoring\PRTG\Services\PrtgSyncService;
use Illuminate\Console\Command;
use Throwable;

class PrtgScopeAuditCommand extends Command
{
    protected $signature = 'prtg:scope-audit';

    protected $description = 'Auditoría READ-ONLY del scope PRTG allowlist (Sonda local → Operadores Global Fiber). No modifica incidencias.';

    public function handle(PrtgSyncService $service): int
    {
        $this->info('================================================');
        $this->info('PRTG SCOPE AUDIT');
        $this->info('================================================');
        $this->newLine();

        try {
            $summary = $service->scopeAudit();
        } catch (Throwable $exception) {
            $this->error($exception->getMessage());

            return self::FAILURE;
        }

        $rows = [
            ['Probe', $summary['probe'] ?? ''],
            ['Root group', $summary['root_group'] ?? ''],
            ['Root objid', $summary['root_objid'] ?? ''],
            ['Provincias', $summary['provinces'] ?? 0],
            ['Distritos', $summary['districts'] ?? 0],
            ['Devices (en subtree)', $summary['devices'] ?? 0],
            ['Devices CID', $summary['devices_cid'] ?? 0],
            ['Unique CIDs', $summary['unique_cids'] ?? 0],
            ['Duplicate CIDs', $summary['duplicate_cids'] ?? 0],
            ['Associated with DB', $summary['associated_with_db'] ?? 0],
            ['Unassociated', $summary['unassociated'] ?? 0],
            ['Ping sensors', $summary['ping_sensors'] ?? 0],
            ['Devices without Ping', $summary['devices_without_ping'] ?? 0],
            ['Excluded objects', $summary['excluded_objects'] ?? 0],
            ['Excluded outside scope', $summary['excluded_outside_scope'] ?? 0],
            ['Ignored no CID', $summary['ignored_no_cid'] ?? 0],
            ['Warnings', $summary['warnings'] ?? 0],
            ['Sync run #', $summary['sync_run_id'] ?? ''],
        ];

        $this->table(['Métrica', 'Valor'], $rows);
        $this->newLine();
        $this->info('Scope: '.($summary['source_scope'] ?? ''));
        $this->comment('READ ONLY — no se modificaron incidencias ni sensores.');

        return self::SUCCESS;
    }
}
