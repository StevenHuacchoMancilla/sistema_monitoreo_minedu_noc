<?php

namespace App\Console\Commands;

use App\Models\Incident;
use App\Models\School;
use App\Models\TrackingRecord;
use App\Models\TrackingUpdate;
use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Limpieza controlada del módulo Tracking General en desarrollo.
 * NO es una migration: no debe ejecutarse accidentalmente en producción.
 */
class PurgeTrackingDevCommand extends Command
{
    protected $signature = 'tracking:purge-dev
        {--force : Confirma el borrado sin prompt interactivo}
        {--dry-run : Solo cuenta filas, no borra}';

    protected $description = 'Borra SOLO tracking_records/tracking_updates (dev/local). No toca incidents ni el resto del NOC.';

    /** @var list<string> */
    private const ALLOWED_ENVS = ['local', 'testing'];

    public function handle(): int
    {
        $env = (string) app()->environment();

        if (! in_array($env, self::ALLOWED_ENVS, true)) {
            $this->error("Abortado: tracking:purge-dev solo corre en local/testing (APP_ENV={$env}).");

            return self::FAILURE;
        }

        $records = TrackingRecord::query()->count();
        $updates = TrackingUpdate::query()->count();
        $incidentsBefore = Incident::query()->count();
        $schoolsBefore = School::query()->count();
        $usersBefore = User::query()->count();

        $this->table(
            ['Métrica', 'Valor'],
            [
                ['APP_ENV', $env],
                ['tracking_records', $records],
                ['tracking_updates', $updates],
                ['incidents (no se tocan)', $incidentsBefore],
                ['schools (no se tocan)', $schoolsBefore],
                ['users (no se tocan)', $usersBefore],
            ]
        );

        if ($this->option('dry-run')) {
            $this->info('[DRY-RUN] Nada borrado.');

            return self::SUCCESS;
        }

        if ($records === 0 && $updates === 0) {
            $this->info('Tracking ya está vacío.');

            return self::SUCCESS;
        }

        if (! $this->option('force') && ! $this->confirm('¿Borrar todos los registros Tracking General?', false)) {
            $this->warn('Cancelado.');

            return self::FAILURE;
        }

        DB::transaction(function (): void {
            // Orden explícito por claridad; cascadeOnDelete también cubriría updates.
            TrackingUpdate::query()->delete();
            TrackingRecord::query()->delete();
        });

        $this->newLine();
        $this->info('Tracking General limpio.');
        $this->table(
            ['Métrica', 'Después'],
            [
                ['tracking_records', TrackingRecord::query()->count()],
                ['tracking_updates', TrackingUpdate::query()->count()],
                ['incidents', Incident::query()->count()],
                ['schools', School::query()->count()],
                ['users', User::query()->count()],
            ]
        );

        if (Incident::query()->count() !== $incidentsBefore
            || School::query()->count() !== $schoolsBefore
            || User::query()->count() !== $usersBefore) {
            $this->error('ALERTA: cambió el conteo de incidents/schools/users — revisar.');

            return self::FAILURE;
        }

        return self::SUCCESS;
    }
}
