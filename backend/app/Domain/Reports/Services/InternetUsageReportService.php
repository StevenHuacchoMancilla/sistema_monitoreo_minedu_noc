<?php

namespace App\Domain\Reports\Services;

use App\Domain\Monitoring\PRTG\Services\PrtgTrafficVolumeReader;
use App\Domain\Monitoring\PRTG\Support\TrafficValue;
use App\Enums\MonitoringStatus;
use App\Enums\PrtgSensorRole;
use App\Models\Incident;
use App\Models\NetworkAssignment;
use App\Models\PrtgTrafficSample;
use App\Support\OperationalTime;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Style\Fill;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Uso de internet por colegio a partir de los sensores de transmisión y recepción de PRTG.
 */
class InternetUsageReportService
{
    public function __construct(
        private readonly PrtgTrafficVolumeReader $trafficVolume,
    ) {}

    /**
     * @return array{
     *   total: int,
     *   rows: list<array<string, mixed>>,
     *   top: array{period_label: string, rural: list<array<string, mixed>>, urbano: list<array<string, mixed>>},
     *   top_caballococha: array{period_label: string, rural: list<array<string, mixed>>, urbano: list<array<string, mixed>>}
     * }
     */
    public function preview(?string $search = null): array
    {
        $rows = $this->rows($search);

        return [
            'total' => count($rows),
            'rows' => $rows,
            'top' => $this->topRuralUrbano(false),
            'top_caballococha' => $this->topRuralUrbano(true),
        ];
    }

    public function downloadXlsx(?string $search = null): StreamedResponse
    {
        $rows = $this->rows($search);
        $spreadsheet = new Spreadsheet;
        $sheet = $spreadsheet->getActiveSheet();
        $sheet->setTitle('Uso de internet');
        $headers = [
            'CID', 'Local educativo', 'Código de local', 'Provincia', 'Distrito',
            'TX actual', 'TX mín', 'TX máx', 'TX promedio',
            'RX actual', 'RX mín', 'RX máx', 'RX promedio',
            'Muestras', 'Último check',
        ];
        foreach ($headers as $i => $header) {
            $sheet->setCellValue([$i + 1, 1], $header);
        }
        $sheet->getStyle('A1:O1')->getFont()->setBold(true)->getColor()->setRGB('FFFFFF');
        $sheet->getStyle('A1:O1')->getFill()->setFillType(Fill::FILL_SOLID)->getStartColor()->setRGB('1E3A5F');

        foreach ($rows as $i => $row) {
            $r = $i + 2;
            $values = [
                $row['cid'], $row['local_educativo'], $row['codigo_local'], $row['provincia'], $row['distrito'],
                $row['tx_actual'], $row['tx_min'], $row['tx_max'], $row['tx_avg'],
                $row['rx_actual'], $row['rx_min'], $row['rx_max'], $row['rx_avg'],
                $row['samples'], $row['last_check'],
            ];
            foreach ($values as $c => $value) {
                $sheet->setCellValue([$c + 1, $r], $value);
            }
        }

        foreach ([14, 36, 16, 18, 18, 16, 14, 14, 16, 16, 14, 14, 16, 12, 18] as $i => $width) {
            $sheet->getColumnDimensionByColumn($i + 1)->setWidth($width);
        }

        $filename = 'uso_internet_prtg_'.now()->format('Ymd_His').'.xlsx';

        return response()->streamDownload(function () use ($spreadsheet) {
            (new Xlsx($spreadsheet))->save('php://output');
        }, $filename, [
            'Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ]);
    }

    /**
     * Top 5 Rural y Top 5 Urbano.
     * General: pico de velocidad (muestras mes). Caballococha: volumen histórico PRTG del mes en curso (MB).
     *
     * @return array{period_label: string, rural: list<array<string, mixed>>, urbano: list<array<string, mixed>>}
     */
    private function topRuralUrbano(bool $onlyCaballococha = false): array
    {
        $now = OperationalTime::now();
        $from = OperationalTime::dayStart($now->copy()->startOfMonth());
        $periodSeconds = max(1, $now->getTimestamp() - $from->getTimestamp());
        $periodLabel = $onlyCaballococha
            ? 'Caballococha · Consumo volumen PRTG en MB ('.OperationalTime::format($from, 'd/m/Y').' – '.OperationalTime::format($now, 'd/m/Y H:i').')'
            : 'Mes en curso ('.OperationalTime::format($from, 'd/m/Y').' – '.OperationalTime::format($now, 'd/m/Y H:i').')';

        $stats = null;
        if (! $onlyCaballococha) {
            $stats = PrtgTrafficSample::query()
                ->where('sampled_at', '>=', $from)
                ->selectRaw('prtg_sensor_id, MAX(mbps) as max_mbps')
                ->groupBy('prtg_sensor_id')
                ->get()
                ->keyBy('prtg_sensor_id');
        }

        $caidasBySchool = Incident::query()
            ->where('started_at', '>=', $from)
            ->selectRaw('school_id, COUNT(*) as caidas')
            ->groupBy('school_id')
            ->pluck('caidas', 'school_id');

        $downtimeSql = $this->monthDowntimeSecondsExpression($from, $now);
        $downtimeBySchool = Incident::query()
            ->where(function ($q) use ($from) {
                $q->where('started_at', '>=', $from)
                    ->orWhere(function ($q2) use ($from) {
                        $q2->where('started_at', '<', $from)
                            ->where(function ($q3) use ($from) {
                                $q3->whereNull('recovered_at')
                                    ->orWhere('recovered_at', '>=', $from);
                            });
                    });
            })
            ->selectRaw("school_id, SUM({$downtimeSql}) as downtime_seconds")
            ->groupBy('school_id')
            ->pluck('downtime_seconds', 'school_id');

        $query = NetworkAssignment::query()
            ->with([
                'school:id,local_educativo,codigo_local,current_sequence,provincia,distrito,ambito',
                'sensors' => fn ($q) => $q->whereIn('sensor_role', [
                    PrtgSensorRole::Transmision->value,
                    PrtgSensorRole::Recepcion->value,
                    PrtgSensorRole::Ping->value,
                ]),
            ])
            ->whereHas('sensors', fn ($q) => $q->whereIn('sensor_role', [
                PrtgSensorRole::Transmision->value,
                PrtgSensorRole::Recepcion->value,
            ]));

        if ($onlyCaballococha) {
            $this->constrainCaballocochaNode($query);
        }

        $assignments = $query->get();
        $volumeFrom = CarbonImmutable::instance($from);
        $volumeTo = CarbonImmutable::instance($now);

        $candidates = $assignments->map(function (NetworkAssignment $assignment) use (
            $stats,
            $caidasBySchool,
            $downtimeBySchool,
            $periodSeconds,
            $onlyCaballococha,
            $volumeFrom,
            $volumeTo
        ) {
            $school = $assignment->school;
            if ($school === null) {
                return null;
            }

            $bucket = $this->ambitoBucket((string) ($school->ambito ?? ''));
            if ($bucket === null) {
                return null;
            }

            $tx = $assignment->sensors->firstWhere('sensor_role', PrtgSensorRole::Transmision->value);
            $rx = $assignment->sensors->firstWhere('sensor_role', PrtgSensorRole::Recepcion->value);
            $ping = $assignment->sensors->firstWhere('sensor_role', PrtgSensorRole::Ping->value)
                ?? $assignment->sensors->first(fn ($s) => strcasecmp((string) ($s->name ?? ''), 'Ping') === 0);

            $schoolId = (int) $school->id;
            $caidas = (int) ($caidasBySchool[$schoolId] ?? 0);
            $downtime = max(0.0, (float) ($downtimeBySchool[$schoolId] ?? 0));
            $estabilidad = round(max(0.0, min(100.0, 100.0 * (1.0 - min(1.0, $downtime / $periodSeconds)))), 1);

            $pingStatus = $ping?->normalized_status;
            $pingLabel = $pingStatus instanceof MonitoringStatus
                ? $pingStatus->label()
                : ($ping?->status_text ?: 'Sin Ping');

            if ($onlyCaballococha) {
                $sensorForVolume = $tx ?? $rx;
                $prtgId = (int) ($sensorForVolume?->prtg_sensor_id ?? 0);
                $bytes = $prtgId > 0
                    ? $this->trafficVolume->totalVolumeBytes($prtgId, $volumeFrom, $volumeTo)
                    : null;
                if ($bytes === null || $bytes <= 0) {
                    return null;
                }

                return [
                    'bucket' => $bucket,
                    'assignment_id' => $assignment->id,
                    'school_id' => $schoolId,
                    'cid' => $assignment->cid,
                    'tss' => $school->current_sequence,
                    'local_educativo' => $school->local_educativo,
                    'codigo_local' => $school->codigo_local,
                    'provincia' => $school->provincia,
                    'distrito' => $school->distrito,
                    'ambito' => strtoupper(trim((string) $school->ambito)),
                    'tecnologia' => trim((string) ($assignment->tecnologia_acceso ?? '')) ?: null,
                    'nodo_acceso' => trim((string) ($assignment->nodo_acceso_a ?: $assignment->nodo_acceso_b ?: '')) ?: null,
                    'consumo_sort' => $bytes,
                    'consumo' => PrtgTrafficVolumeReader::formatBytes($bytes),
                    'consumo_max' => PrtgTrafficVolumeReader::formatBytes($bytes),
                    'caidas' => $caidas,
                    'estabilidad_pct' => $estabilidad,
                    'estabilidad' => number_format($estabilidad, 1, '.', '').' %',
                    'prtg_status' => $pingLabel,
                    'metric' => 'volume_month_mb',
                ];
            }

            $txMax = $tx && $stats->has($tx->id) ? (float) $stats->get($tx->id)->max_mbps : null;
            $rxMax = $rx && $stats->has($rx->id) ? (float) $stats->get($rx->id)->max_mbps : null;
            $consumoMax = max($txMax ?? 0.0, $rxMax ?? 0.0);
            if ($consumoMax <= 0.0 && $txMax === null && $rxMax === null) {
                return null;
            }

            return [
                'bucket' => $bucket,
                'assignment_id' => $assignment->id,
                'school_id' => $schoolId,
                'cid' => $assignment->cid,
                'tss' => $school->current_sequence,
                'local_educativo' => $school->local_educativo,
                'codigo_local' => $school->codigo_local,
                'provincia' => $school->provincia,
                'distrito' => $school->distrito,
                'ambito' => strtoupper(trim((string) $school->ambito)),
                'consumo_sort' => $consumoMax,
                'consumo_max' => TrafficValue::format($consumoMax),
                'tx_max' => TrafficValue::format($txMax),
                'rx_max' => TrafficValue::format($rxMax),
                'caidas' => $caidas,
                'estabilidad_pct' => $estabilidad,
                'estabilidad' => number_format($estabilidad, 1, '.', '').' %',
                'prtg_status' => $pingLabel,
                'metric' => 'speed_month',
            ];
        })->filter()->values();

        $rank = function (string $bucket) use ($candidates): array {
            return $candidates
                ->where('bucket', $bucket)
                ->sort(function (array $a, array $b) {
                    if ($a['caidas'] !== $b['caidas']) {
                        return $a['caidas'] <=> $b['caidas'];
                    }

                    return $b['consumo_sort'] <=> $a['consumo_sort'];
                })
                ->take(5)
                ->values()
                ->map(function (array $row, int $index) {
                    unset($row['bucket'], $row['consumo_sort']);

                    return array_merge(['rank' => $index + 1], $row);
                })
                ->all();
        };

        return [
            'period_label' => $periodLabel,
            'rural' => $rank('rural'),
            'urbano' => $rank('urbano'),
        ];
    }

    /**
     * Solo nodo principal Caballococha (NODO ACCESO A), GPON o P2P.
     * No incluye nodo secundario (nodo_acceso_b) ni coincidencias solo por OLT.
     */
    private function constrainCaballocochaNode(\Illuminate\Database\Eloquent\Builder $query): void
    {
        $driver = DB::connection()->getDriverName();
        $like = $driver === 'pgsql' ? 'ILIKE' : 'LIKE';

        $query->whereRaw(
            "REPLACE(UPPER(COALESCE(nodo_acceso_a, '')), ' ', '') {$like} ?",
            ['%CABALLOCOCHA%']
        );
    }

    private function ambitoBucket(string $ambito): ?string
    {
        $value = strtoupper(trim($ambito));
        if ($value === '') {
            return null;
        }
        if (str_contains($value, 'RURAL')) {
            return 'rural';
        }
        if (str_contains($value, 'URBAN')) {
            return 'urbano';
        }

        return null;
    }

    /**
     * Segundos de downtime de una incidencia recortados al mes en curso.
     * Timestamps embebidos (formato controlado) para no chocar con bindings del WHERE.
     */
    private function monthDowntimeSecondsExpression(\DateTimeInterface $from, \DateTimeInterface $to): string
    {
        $fromStr = $from->format('Y-m-d H:i:s');
        $toStr = $to->format('Y-m-d H:i:s');
        $driver = DB::connection()->getDriverName();

        if ($driver === 'pgsql') {
            $start = "greatest(started_at, timestamp '{$fromStr}')";
            $end = "least(coalesce(recovered_at, timestamp '{$toStr}'), timestamp '{$toStr}')";
            $diff = "extract(epoch from ({$end} - {$start}))";

            return "case when {$end} > {$start} then {$diff} else 0 end";
        }

        $start = "max(started_at, '{$fromStr}')";
        $end = "min(coalesce(recovered_at, '{$toStr}'), '{$toStr}')";
        $diff = "(julianday({$end}) - julianday({$start})) * 86400";

        return "case when {$end} > {$start} then {$diff} else 0 end";
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function rows(?string $search): array
    {
        $query = NetworkAssignment::query()
            ->with([
                'school:id,local_educativo,codigo_local,current_sequence,provincia,distrito',
                'sensors' => fn ($q) => $q->whereIn('sensor_role', [
                    PrtgSensorRole::Transmision->value,
                    PrtgSensorRole::Recepcion->value,
                ]),
            ])
            ->whereHas('sensors', fn ($q) => $q->whereIn('sensor_role', [
                PrtgSensorRole::Transmision->value,
                PrtgSensorRole::Recepcion->value,
            ]));

        if ($search !== null && trim($search) !== '') {
            \App\Support\CidTssSearch::constrainAssignment($query, $search);
        }

        $from = OperationalTime::dayStart(OperationalTime::now()->startOfMonth());
        $stats = PrtgTrafficSample::query()
            ->where('sampled_at', '>=', $from)
            ->selectRaw('prtg_sensor_id, MIN(mbps) as min_mbps, MAX(mbps) as max_mbps, AVG(mbps) as avg_mbps, COUNT(*) as samples')
            ->groupBy('prtg_sensor_id')
            ->get()
            ->keyBy('prtg_sensor_id');

        return $query->orderBy('cid')->get()->map(function (NetworkAssignment $assignment) use ($stats) {
            $tx = $assignment->sensors->firstWhere('sensor_role', PrtgSensorRole::Transmision->value);
            $rx = $assignment->sensors->firstWhere('sensor_role', PrtgSensorRole::Recepcion->value);
            $school = $assignment->school;
            $times = collect([$tx?->last_check, $rx?->last_check])->filter();
            $last = $times->sortBy(fn ($time) => $time->getTimestamp())->last();
            $txStats = $tx ? $stats->get($tx->id) : null;
            $rxStats = $rx ? $stats->get($rx->id) : null;

            return [
                'assignment_id' => $assignment->id,
                'cid' => $assignment->cid,
                'local_educativo' => $school?->local_educativo,
                'codigo_local' => $school?->codigo_local,
                'provincia' => $school?->provincia,
                'distrito' => $school?->distrito,
                'transmision' => $this->reading($tx),
                'recepcion' => $this->reading($rx),
                'tx_actual' => TrafficValue::format(TrafficValue::toMbps($tx?->last_value)),
                'tx_min' => TrafficValue::format($txStats?->min_mbps !== null ? (float) $txStats->min_mbps : null),
                'tx_max' => TrafficValue::format($txStats?->max_mbps !== null ? (float) $txStats->max_mbps : null),
                'tx_avg' => TrafficValue::format($txStats?->avg_mbps !== null ? (float) $txStats->avg_mbps : null),
                'rx_actual' => TrafficValue::format(TrafficValue::toMbps($rx?->last_value)),
                'rx_min' => TrafficValue::format($rxStats?->min_mbps !== null ? (float) $rxStats->min_mbps : null),
                'rx_max' => TrafficValue::format($rxStats?->max_mbps !== null ? (float) $rxStats->max_mbps : null),
                'rx_avg' => TrafficValue::format($rxStats?->avg_mbps !== null ? (float) $rxStats->avg_mbps : null),
                'samples' => (int) (($txStats->samples ?? 0) + ($rxStats->samples ?? 0)),
                'last_check' => $last ? OperationalTime::format($last, 'd/m/Y H:i') : null,
            ];
        })->values()->all();
    }

    private function reading(mixed $sensor): ?string
    {
        if ($sensor === null) {
            return null;
        }
        $value = trim((string) ($sensor->last_value ?? ''));
        $unit = trim((string) ($sensor->unit ?? ''));
        if ($value === '') {
            return $sensor->status_text;
        }

        return $unit !== '' ? $value.' '.$unit : $value;
    }
}
