<?php

namespace App\Console\Commands;

use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Vacía datos operativos/maestro de prueba para cargar Excel real en producción.
 * Conserva usuarios (ADMIN / operadores) y tablas de framework.
 */
class PurgeOperationalDataCommand extends Command
{
    protected $signature = 'noc:purge-operational
        {--force : Confirma el borrado sin prompt}
        {--dry-run : Solo lista tablas y conteos}
        {--keep-users : Conserva users (por defecto true; flag explícito)}';

    protected $description = 'Borra incidencias, tracking, escuelas, sensores y sync; conserva usuarios.';

    /**
     * Orden: hijos → padres. Solo tablas operativas/maestro.
     *
     * @var list<string>
     */
    private const TABLES = [
        'tracking_updates',
        'tracking_records',
        'field_dispatches',
        'incident_managements',
        'incident_updates',
        'incidents',
        'prtg_events',
        'prtg_sensors',
        'cloudnet_aps',
        'cloudnet_devices',
        'cloudnet_sites',
        'school_contacts',
        'network_assignments',
        'schools',
        'sync_issues',
        'sync_runs',
        'audit_logs',
        'jobs',
        'job_batches',
        'failed_jobs',
        'cache',
        'cache_locks',
        'sessions',
        'personal_access_tokens',
    ];

    public function handle(): int
    {
        $existing = [];
        foreach (self::TABLES as $table) {
            if (Schema::hasTable($table)) {
                $existing[] = $table;
            }
        }

        $rows = [];
        foreach ($existing as $table) {
            $rows[] = [$table, DB::table($table)->count()];
        }
        $rows[] = ['users (conservados)', User::query()->count()];

        $this->table(['Tabla', 'Filas'], $rows);

        if ($this->option('dry-run')) {
            $this->info('[DRY-RUN] Nada borrado.');

            return self::SUCCESS;
        }

        if (! $this->option('force') && ! $this->confirm(
            '¿Vaciar TODOS los datos operativos/maestro y dejar solo usuarios?',
            false
        )) {
            $this->warn('Cancelado.');

            return self::FAILURE;
        }

        $usersBefore = User::query()->count();

        $driver = Schema::getConnection()->getDriverName();

        DB::transaction(function () use ($existing, $driver): void {
            if ($driver === 'pgsql') {
                foreach ($existing as $table) {
                    DB::statement('TRUNCATE TABLE '.$table.' RESTART IDENTITY CASCADE');
                }

                return;
            }

            Schema::disableForeignKeyConstraints();
            try {
                foreach ($existing as $table) {
                    DB::table($table)->delete();
                }
            } finally {
                Schema::enableForeignKeyConstraints();
            }
        });

        $usersAfter = User::query()->count();
        $this->newLine();
        $this->info('Datos operativos vaciados. Usuarios conservados: '.$usersAfter);

        if ($usersAfter !== $usersBefore) {
            $this->error('ALERTA: el conteo de users cambió (antes '.$usersBefore.', ahora '.$usersAfter.').');

            return self::FAILURE;
        }

        foreach ($existing as $table) {
            $count = DB::table($table)->count();
            if ($count > 0) {
                $this->warn("{$table} aún tiene {$count} fila(s).");
            }
        }

        $this->comment('Listo para importar Excel / sincronizar PRTG desde cero.');

        return self::SUCCESS;
    }
}
