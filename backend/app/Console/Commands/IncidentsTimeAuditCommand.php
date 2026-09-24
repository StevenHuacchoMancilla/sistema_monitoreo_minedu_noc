<?php

namespace App\Console\Commands;

use Carbon\CarbonImmutable;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Auditoría READ-ONLY de consistencia temporal de incidentes (valores naive en app.timezone).
 */
class IncidentsTimeAuditCommand extends Command
{
    protected $signature = 'incidents:time-audit {--limit=15 : Filas de muestra por hallazgo}';

    protected $description = 'Auditoría READ-ONLY: fechas futuras, recovered_at < started_at y patrones de desfase horario.';

    public function handle(): int
    {
        $limit = max(1, (int) $this->option('limit'));
        $storageTz = (string) config('app.timezone');
        $displayTz = (string) config('app.display_timezone');
        $now = CarbonImmutable::now($storageTz);
        $nowNaive = $now->format('Y-m-d H:i:s');

        $this->line("Almacenamiento: {$storageTz} · Visualización: {$displayTz}");
        $this->line("Ahora: {$nowNaive} ({$storageTz}) · ".$now->tz($displayTz)->format('Y-m-d H:i:s')." ({$displayTz})");
        $this->line('Incidentes totales: '.DB::table('incidents')->count());

        $columns = ['id', 'network_assignment_id', 'started_at', 'recovered_at', 'created_at'];

        $this->section(
            'started_at en el futuro',
            DB::table('incidents')->where('started_at', '>', $nowNaive),
            $columns,
            $limit,
        );

        $this->section(
            'recovered_at en el futuro',
            DB::table('incidents')->where('recovered_at', '>', $nowNaive),
            $columns,
            $limit,
        );

        $this->section(
            'recovered_at < started_at (duración negativa)',
            DB::table('incidents')->whereNotNull('recovered_at')->whereColumn('recovered_at', '<', 'started_at'),
            $columns,
            $limit,
        );

        $this->offsetPattern();

        return self::SUCCESS;
    }

    private function section(string $title, $query, array $columns, int $limit): void
    {
        $count = (clone $query)->count();
        $this->newLine();
        $this->line("== {$title}: {$count}");
        if ($count === 0) {
            return;
        }

        $rows = $query->orderByDesc('id')->limit($limit)->get($columns);
        $this->table($columns, $rows->map(fn ($r) => array_map(fn ($c) => $r->{$c}, $columns))->all());
    }

    /**
     * started_at vs created_at: si se registraron en la misma corrida su diferencia es ~0;
     * diferencias cercanas a ±N horas exactas indican mezcla de zonas.
     */
    private function offsetPattern(): void
    {
        $rows = DB::table('incidents')
            ->whereNotNull('created_at')
            ->get(['started_at', 'created_at']);

        $buckets = [];
        foreach ($rows as $r) {
            $diffHours = (int) round((strtotime((string) $r->created_at) - strtotime((string) $r->started_at)) / 3600);
            $buckets[$diffHours] = ($buckets[$diffHours] ?? 0) + 1;
        }
        ksort($buckets);

        $this->newLine();
        $this->line('== Diferencia created_at − started_at (horas redondeadas)');
        $this->table(['Horas', 'Incidentes'], collect($buckets)->map(fn ($n, $h) => [$h, $n])->values()->all());
    }
}
