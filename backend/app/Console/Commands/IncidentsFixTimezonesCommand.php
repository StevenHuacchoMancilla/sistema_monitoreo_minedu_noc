<?php

namespace App\Console\Commands;

use Carbon\CarbonImmutable;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Convierte a UTC los timestamps naive escritos en hora Lima durante la ventana
 * en que app.timezone estuvo en America/Lima. No toca tablas de Tracking.
 */
class IncidentsFixTimezonesCommand extends Command
{
    protected $signature = 'incidents:fix-timezones
        {--from=2026-09-23 09:59:24 : Inicio (naive) de la ventana escrita en hora local}
        {--to=2026-09-23 11:48:00 : Fin exclusivo (naive) de la ventana escrita en hora local}
        {--source-tz=America/Lima : Zona en la que se escribieron los valores de la ventana}
        {--dry-run : Solo muestra antes/después, no escribe}';

    protected $description = 'Corrige a UTC los timestamps escritos en hora local dentro de una ventana acotada (excluye Tracking).';

    private const EXCLUDED_TABLES = [
        'migrations', 'cache', 'cache_locks', 'jobs', 'job_batches', 'failed_jobs',
        'sessions', 'password_reset_tokens',
    ];

    private const EXCLUDED_COLUMNS = ['expires_at', 'available_at', 'reserved_at'];

    public function handle(): int
    {
        if (DB::getDriverName() !== 'pgsql') {
            $this->error('Este comando solo soporta PostgreSQL.');

            return self::FAILURE;
        }

        $from = (string) $this->option('from');
        $to = (string) $this->option('to');
        $sourceTz = (string) $this->option('source-tz');
        $dryRun = (bool) $this->option('dry-run');

        $this->line(($dryRun ? '[DRY-RUN] ' : '')."Ventana naive [{$from}, {$to}) interpretada en {$sourceTz} → UTC");

        $targets = $this->targets($from, $to);
        if ($targets === []) {
            $this->info('No hay valores en la ventana.');

            return self::SUCCESS;
        }

        $rows = [];
        foreach ($targets as [$table, $column, $count, $min, $max]) {
            $rows[] = [
                "{$table}.{$column}",
                $count,
                $min.' → '.$this->convert($min, $sourceTz),
                $max.' → '.$this->convert($max, $sourceTz),
            ];
        }
        $this->table(['Columna', 'Filas', 'Mín antes → después', 'Máx antes → después'], $rows);

        $this->sampleIncidents($from, $to, $sourceTz);

        if ($dryRun) {
            $this->warn('Dry-run: no se modificó nada.');

            return self::SUCCESS;
        }

        if (! $this->confirm('¿Aplicar la corrección?', false)) {
            return self::FAILURE;
        }

        $updated = 0;
        DB::transaction(function () use ($targets, $from, $to, $sourceTz, &$updated): void {
            foreach ($targets as [$table, $column]) {
                $values = DB::table($table)
                    ->where($column, '>=', $from)
                    ->where($column, '<', $to)
                    ->distinct()
                    ->pluck($column);

                foreach ($values as $value) {
                    $updated += DB::table($table)
                        ->where($column, $value)
                        ->update([$column => $this->convert((string) $value, $sourceTz)]);
                }
            }
        });

        $this->info("Valores actualizados: {$updated}");

        return self::SUCCESS;
    }

    /**
     * @return list<array{0:string,1:string,2:int,3:string,4:string}>
     */
    private function targets(string $from, string $to): array
    {
        $columns = DB::select(
            "select table_name as t, column_name as c from information_schema.columns
             where table_schema = current_schema() and data_type = 'timestamp without time zone'
             order by 1, 2"
        );

        $targets = [];
        foreach ($columns as $col) {
            if (in_array($col->t, self::EXCLUDED_TABLES, true)
                || str_starts_with($col->t, 'tracking')
                || in_array($col->c, self::EXCLUDED_COLUMNS, true)
                || ! Schema::hasColumn($col->t, $col->c)) {
                continue;
            }

            $stats = DB::table($col->t)
                ->where($col->c, '>=', $from)
                ->where($col->c, '<', $to)
                ->selectRaw("count(*) as n, min(\"{$col->c}\")::text as mn, max(\"{$col->c}\")::text as mx")
                ->first();

            if ((int) $stats->n > 0) {
                $targets[] = [$col->t, $col->c, (int) $stats->n, (string) $stats->mn, (string) $stats->mx];
            }
        }

        return $targets;
    }

    private function sampleIncidents(string $from, string $to, string $sourceTz): void
    {
        $sample = DB::table('incidents')
            ->where(fn ($q) => $q
                ->whereBetween('started_at', [$from, $to])
                ->orWhereBetween('recovered_at', [$from, $to]))
            ->orderByDesc('id')
            ->limit(10)
            ->get(['id', 'network_assignment_id as na', DB::raw('started_at::text as s'), DB::raw('recovered_at::text as r')]);

        if ($sample->isEmpty()) {
            return;
        }

        $inWindow = fn (?string $v) => $v !== null && $v >= $from && $v < $to;
        $fmt = fn (?string $v) => $v === null ? '—' : ($inWindow($v) ? $v.' → '.$this->convert($v, $sourceTz) : $v.' (sin cambio)');

        $this->line('Muestra de incidentes (valores naive):');
        $this->table(
            ['id', 'assignment', 'started_at', 'recovered_at'],
            $sample->map(fn ($r) => [$r->id, $r->na, $fmt($r->s), $fmt($r->r)])->all(),
        );
    }

    private function convert(string $naive, string $sourceTz): string
    {
        return CarbonImmutable::parse(substr($naive, 0, 19), $sourceTz)->utc()->format('Y-m-d H:i:s');
    }
}
