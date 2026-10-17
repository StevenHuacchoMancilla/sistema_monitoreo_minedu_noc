<?php

namespace App\Console\Commands;

use App\Domain\Monitoring\PRTG\Services\PrtgSensorQuery;
use App\Domain\Monitoring\PRTG\Services\PrtgSyncService;
use App\Models\Incident;
use Illuminate\Console\Command;
use Throwable;

class PrtgApplyScopeCommand extends Command
{
    protected $signature = 'prtg:apply-scope
        {--sync : Tras el prune, ejecuta un sync completo del scope actual}';

    protected $description = 'Cierra caídas/sensores de ramas PRTG anteriores y deja el scope allowlist actual (REGION LORETO)';

    public function handle(PrtgSyncService $sync): int
    {
        $scope = PrtgSensorQuery::currentScope();
        $this->info("Scope actual: {$scope}");
        $this->info('Incidencias abiertas antes: '.Incident::query()->whereNull('recovered_at')->count());

        $prune = PrtgSensorQuery::pruneObsoleteScopeSensors($scope);
        $this->table(
            ['Métrica', 'Valor'],
            [
                ['Sensores obsoletos eliminados', $prune['deleted_sensors']],
                ['Incidencias cerradas (rama anterior)', $prune['closed_incidents']],
            ]
        );
        $this->info('Incidencias abiertas tras prune: '.Incident::query()->whereNull('recovered_at')->count());

        if (! $this->option('sync')) {
            $this->comment('Usa --sync para leer ahora mismo REGION LORETO y abrir/cerrar según Ping.');

            return self::SUCCESS;
        }

        $this->info('Sincronizando PRTG...');
        try {
            $summary = $sync->sync();
        } catch (Throwable $exception) {
            $this->error($exception->getMessage());

            return self::FAILURE;
        }

        if (! empty($summary['skipped'])) {
            $this->warn('Sync omitido: '.$summary['reason']);

            return self::SUCCESS;
        }

        $this->table(
            ['Métrica', 'Valor'],
            collect($summary)
                ->only([
                    'source_scope',
                    'matched',
                    'downs',
                    'operativos',
                    'processed_count',
                    'closed_obsolete_incidents',
                    'pruned_obsolete_sensors',
                    'closed_operativo',
                ])
                ->map(fn ($v, $k) => [$k, is_scalar($v) ? $v : json_encode($v)])
                ->values()
                ->all()
        );
        $this->info('Incidencias abiertas finales: '.Incident::query()->whereNull('recovered_at')->count());

        return self::SUCCESS;
    }
}
