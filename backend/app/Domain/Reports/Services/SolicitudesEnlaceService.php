<?php

namespace App\Domain\Reports\Services;

use App\Domain\Monitoring\PRTG\Services\PrtgHistoricOutageReader;
use App\Domain\Monitoring\PRTG\Services\PrtgService;
use App\Domain\Monitoring\PRTG\Support\PrtgOutageIntervalBuilder;
use App\Domain\Monitoring\PRTG\Support\PrtgTimestamps;
use App\Enums\MonitoringStatus;
use App\Models\NetworkAssignment;
use App\Models\PrtgSensor;
use Carbon\CarbonImmutable;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Style\Alignment;
use PhpOffice\PhpSpreadsheet\Style\Border;
use PhpOffice\PhpSpreadsheet\Style\Fill;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;
use Symfony\Component\HttpFoundation\StreamedResponse;
use Throwable;

/**
 * Colegios cuyo enlace primario/secundario es Providencia, Santa Cruz, o ambos.
 * Estado y caídas salen del sensor Ping en PRTG (no del historial local).
 * Caídas: todas las de los últimos 7 días; si no hay ninguna en esa ventana, solo la última.
 */
class SolicitudesEnlaceService
{
    private const TZ = 'America/Lima';

    private const WINDOW_DAYS = 7;

    private const MONTH_DAYS = 30;

    private const HISTORY_DAYS = 120;

    public function __construct(
        private readonly PrtgHistoricOutageReader $history,
        private readonly PrtgService $prtg,
    ) {}

    public function downloadXlsx(): StreamedResponse
    {
        $payload = $this->build();
        $spreadsheet = new Spreadsheet;

        $resumen = $spreadsheet->getActiveSheet();
        $resumen->setTitle('Resumen');
        $resumen->setCellValue('A1', 'SOLICITUDES · PROVIDENCIA / SANTA CRUZ');
        $resumen->setCellValue('A2', 'Fuente: sensor Ping PRTG · Generado: '.($payload['generated_at'] ?? ''));
        $resumen->setCellValue('A3', 'Ventana de caídas: últimos '.(int) ($payload['window_days'] ?? self::WINDOW_DAYS).' días (si no hay, solo la última)');
        $resumen->mergeCells('A1:L1');
        $resumen->mergeCells('A2:L2');
        $resumen->mergeCells('A3:L3');
        $resumen->getStyle('A1')->getFont()->setBold(true)->setSize(14);
        $resumen->getStyle('A2:A3')->getFont()->setItalic(true);

        $headers = [
            'Grupo',
            'CID',
            'Local educativo',
            'Código local',
            'Provincia',
            'Distrito',
            'Primario',
            'Secundario',
            'Estado',
            'Activo desde',
            'Activo hace',
            'En línea / caído hace',
            'Modo caídas',
            'N° caídas',
            'Sensor PRTG',
        ];
        foreach ($headers as $i => $header) {
            $resumen->setCellValue([$i + 1, 5], $header);
        }
        $resumen->getStyle('A5:O5')->getFont()->setBold(true)->getColor()->setRGB('FFFFFF');
        $resumen->getStyle('A5:O5')->getFill()->setFillType(Fill::FILL_SOLID)->getStartColor()->setRGB('1E3A8A');

        $row = 6;
        $fallRows = [];
        foreach ($payload['groups'] as $group) {
            foreach ($group['schools'] as $school) {
                $statusLine = $this->statusLineForExport($school);
                $values = [
                    $group['label'],
                    $school['cid'] ?? '',
                    $school['local_educativo'] ?? '',
                    $school['codigo_local'] ?? '',
                    $school['provincia'] ?? '',
                    $school['distrito'] ?? '',
                    $school['nodo_primario'] ?? '',
                    $school['nodo_secundario'] ?? 'Sin enlace',
                    $school['estado_label'] ?? '',
                    ! empty($school['sin_caidas']) ? 'Sin caída en 120 días' : ($school['activo_desde'] ?? ''),
                    ! empty($school['sin_caidas']) ? 'Continuo' : $this->formatSeconds($school['activo_segundos'] ?? null),
                    $statusLine,
                    $this->modeLabelForExport((string) ($school['caidas_modo'] ?? ''), (int) ($payload['window_days'] ?? self::WINDOW_DAYS)),
                    count($school['caidas'] ?? []),
                    $school['prtg_sensor_id'] ?? '',
                ];
                foreach ($values as $c => $value) {
                    $resumen->setCellValue([$c + 1, $row], $value);
                }
                foreach ($school['caidas'] ?? [] as $fall) {
                    $fallRows[] = [
                        $group['label'],
                        $school['cid'] ?? '',
                        $school['local_educativo'] ?? '',
                        $fall['inicio'] ?? '',
                        $fall['fin'] ?? 'Sigue caído',
                        $this->formatSeconds($fall['duracion_segundos'] ?? null),
                        ! empty($fall['abierta']) ? 'Abierta' : 'Recuperada',
                    ];
                }
                $row++;
            }
        }
        $lastResumen = max(5, $row - 1);
        $resumen->getStyle('A5:O'.$lastResumen)->getBorders()->getAllBorders()
            ->setBorderStyle(Border::BORDER_THIN)->getColor()->setRGB('CBD5E1');
        $resumen->getStyle('A6:O'.$lastResumen)->getAlignment()->setVertical(Alignment::VERTICAL_TOP)->setWrapText(true);
        foreach ([22, 12, 28, 12, 14, 14, 14, 14, 12, 12, 14, 22, 28, 10, 12] as $i => $width) {
            $resumen->getColumnDimensionByColumn($i + 1)->setWidth($width);
        }
        $resumen->freezePane('A6');

        $detalle = $spreadsheet->createSheet();
        $detalle->setTitle('Caídas PRTG');
        $detalle->setCellValue('A1', 'DETALLE DE CAÍDAS · SENSOR PING PRTG');
        $detalle->mergeCells('A1:G1');
        $detalle->getStyle('A1')->getFont()->setBold(true)->setSize(13);
        $fallHeaders = ['Grupo', 'CID', 'Local educativo', 'Inicio', 'Fin', 'Duración', 'Estado'];
        foreach ($fallHeaders as $i => $header) {
            $detalle->setCellValue([$i + 1, 3], $header);
        }
        $detalle->getStyle('A3:G3')->getFont()->setBold(true)->getColor()->setRGB('FFFFFF');
        $detalle->getStyle('A3:G3')->getFill()->setFillType(Fill::FILL_SOLID)->getStartColor()->setRGB('0F766E');
        $r = 4;
        foreach ($fallRows as $fallRow) {
            foreach ($fallRow as $c => $value) {
                $detalle->setCellValue([$c + 1, $r], $value);
            }
            $r++;
        }
        if ($fallRows === []) {
            $detalle->setCellValue('A4', 'Sin caídas en el criterio de la ventana.');
        }
        $lastDetalle = max(3, $r - 1);
        $detalle->getStyle('A3:G'.$lastDetalle)->getBorders()->getAllBorders()
            ->setBorderStyle(Border::BORDER_THIN)->getColor()->setRGB('CBD5E1');
        foreach ([22, 12, 28, 24, 24, 14, 12] as $i => $width) {
            $detalle->getColumnDimensionByColumn($i + 1)->setWidth($width);
        }
        $detalle->freezePane('A4');

        $filename = 'solicitudes_providencia_santa_cruz_'.now(self::TZ)->format('Ymd_His').'.xlsx';

        return response()->streamDownload(function () use ($spreadsheet) {
            (new Xlsx($spreadsheet))->save('php://output');
        }, $filename, [
            'Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    public function build(): array
    {
        $now = CarbonImmutable::now(self::TZ);
        $weekStart = $now->subDays(self::WINDOW_DAYS);

        $assignments = NetworkAssignment::query()
            ->where('is_active', true)
            ->whereRaw("UPPER(TRIM(COALESCE(nodo_acceso_a, ''))) IN ('PROVIDENCIA', 'SANTA CRUZ')")
            ->with([
                'school:id,local_educativo,provincia,distrito,codigo_local',
                'sensors' => fn ($q) => $q
                    ->where('sensor_role', 'PING')
                    ->select(['id', 'network_assignment_id', 'prtg_sensor_id', 'name', 'normalized_status']),
            ])
            ->orderBy('cid')
            ->get();

        $grouped = [
            'ambos' => [],
            'providencia' => [],
            'santa_cruz' => [],
        ];

        foreach ($assignments as $assignment) {
            $bucket = $this->bucket(
                (string) ($assignment->nodo_acceso_a ?? ''),
                (string) ($assignment->nodo_acceso_b ?? ''),
            );
            if ($bucket === null) {
                continue;
            }
            $grouped[$bucket][] = $assignment;
        }

        $groups = [
            $this->groupPayload('ambos', 'Providencia – Santa Cruz', 'Primario Providencia y secundario Santa Cruz', $grouped['ambos'], $now, $weekStart),
            $this->groupPayload('providencia', 'Solo Providencia', 'Primario Providencia, sin enlace secundario', $grouped['providencia'], $now, $weekStart),
            $this->groupPayload('santa_cruz', 'Solo Santa Cruz', 'Primario Santa Cruz, sin enlace secundario', $grouped['santa_cruz'], $now, $weekStart),
        ];

        return [
            'generated_at' => $now->toIso8601String(),
            'source' => 'prtg_ping',
            'window_days' => self::WINDOW_DAYS,
            'total' => array_sum(array_map(fn (array $g) => $g['total'], $groups)),
            'groups' => $groups,
        ];
    }

    /**
     * @param  list<NetworkAssignment>  $assignments
     * @return array<string, mixed>
     */
    private function groupPayload(
        string $key,
        string $label,
        string $hint,
        array $assignments,
        CarbonImmutable $now,
        CarbonImmutable $weekStart,
    ): array {
        $schools = [];
        foreach ($assignments as $assignment) {
            $schools[] = $this->schoolPayload($assignment, $now, $weekStart);
        }

        usort($schools, fn (array $a, array $b) => strcmp((string) $a['cid'], (string) $b['cid']));

        return [
            'key' => $key,
            'label' => $label,
            'hint' => $hint,
            'total' => count($schools),
            'schools' => $schools,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function schoolPayload(
        NetworkAssignment $assignment,
        CarbonImmutable $now,
        CarbonImmutable $weekStart,
    ): array {
        $school = $assignment->school;
        /** @var PrtgSensor|null $ping */
        $ping = $assignment->sensors->first();
        $sensorId = is_numeric($ping?->prtg_sensor_id) ? (int) $ping->prtg_sensor_id : null;

        $activation = $assignment->fecha_activacion
            ? CarbonImmutable::parse($assignment->fecha_activacion->toDateString(), self::TZ)->startOfDay()
            : null;

        $status = $ping?->normalized_status ?? MonitoringStatus::SinDatos;
        $enLineaDesde = null;
        $caidoDesde = null;
        $prtgError = null;
        $outages = [];

        if ($sensorId === null) {
            $prtgError = 'Sin sensor Ping en PRTG';
        } else {
            try {
                $live = $this->livePing($sensorId);
                if ($live !== null) {
                    $raw = $live['status_raw'] ?? null;
                    $status = MonitoringStatus::fromPrtgRaw(is_numeric($raw) ? (int) $raw : null);
                    if ($status === MonitoringStatus::Caido) {
                        $caidoDesde = PrtgTimestamps::stateSince($live, 'downtimesince', $now)['at'];
                    }
                }

                $outages = $this->realOutages(
                    $sensorId,
                    $now->subDays(self::HISTORY_DAYS)->utc(),
                    CarbonImmutable::now('UTC'),
                );
            } catch (Throwable $exception) {
                $prtgError = 'PRTG no respondió'.($exception->getMessage() !== '' ? ': '.$exception->getMessage() : '');
            }
        }

        $down = $status === MonitoringStatus::Caido;
        $lastRecovery = $this->latestRecovery($outages);
        if ($down) {
            $open = $this->latestOpen($outages);
            $caidoDesde = $open['started_at'] ?? $caidoDesde;
        } else {
            $enLineaDesde = $lastRecovery;
        }
        $sinCaidas = ! $down && $lastRecovery === null;

        [$mode, $falls] = $this->selectFalls($outages, $now);

        $secundario = $this->isEmptyNode($this->norm((string) ($assignment->nodo_acceso_b ?? '')))
            ? null
            : trim((string) $assignment->nodo_acceso_b);

        return [
            'assignment_id' => $assignment->id,
            'school_id' => $school?->id,
            'cid' => $assignment->cid,
            'codigo_local' => $school?->codigo_local,
            'local_educativo' => $school?->local_educativo,
            'provincia' => $school?->provincia,
            'distrito' => $school?->distrito,
            'nodo_primario' => trim((string) ($assignment->nodo_acceso_a ?? '')) ?: null,
            'nodo_secundario' => $secundario,
            'prtg_sensor_id' => $sensorId,
            'prtg_error' => $prtgError,
            'fecha_activacion' => $activation?->toDateString(),
            'sin_caidas' => $sinCaidas,
            'activo_desde' => $enLineaDesde?->timezone(self::TZ)->toIso8601String(),
            'activo_segundos' => $enLineaDesde ? $this->secondsBetween($enLineaDesde, $now) : null,
            'estado' => $down ? MonitoringStatus::Caido->value : MonitoringStatus::Operativo->value,
            'estado_label' => $down ? 'Caído' : 'Operativo',
            'en_linea_desde' => $enLineaDesde?->timezone(self::TZ)->toIso8601String(),
            'en_linea_segundos' => $enLineaDesde ? $this->secondsBetween($enLineaDesde, $now) : null,
            'caido_desde' => $caidoDesde?->timezone(self::TZ)->toIso8601String(),
            'caido_segundos' => $caidoDesde ? $this->secondsBetween($caidoDesde, $now) : null,
            'caidas_modo' => $mode,
            'caidas' => $falls,
        ];
    }

    /**
     * @param  array<int, array{started_at: CarbonImmutable, recovered_at: ?CarbonImmutable}>  $outages
     * @return array{0: string, 1: list<array<string, mixed>>}
     */
    private function selectFalls(array $outages, CarbonImmutable $now): array
    {
        if ($outages === []) {
            return ['ninguna', []];
        }

        $weekStart = $now->subDays(self::WINDOW_DAYS)->utc();
        $monthStart = $now->subDays(self::WINDOW_DAYS + self::MONTH_DAYS)->utc();

        $recent = array_values(array_filter(
            $outages,
            fn (array $outage) => $outage['started_at']->greaterThanOrEqualTo($weekStart),
        ));

        if ($recent !== []) {
            usort($recent, fn (array $a, array $b) => $a['started_at']->getTimestamp() <=> $b['started_at']->getTimestamp());
            $chosen = $recent;
            $mode = 'semana';
        } else {
            $inMonth = array_values(array_filter(
                $outages,
                fn (array $outage) => $outage['started_at']->greaterThanOrEqualTo($monthStart)
                    && $outage['started_at']->lessThan($weekStart),
            ));
            if ($inMonth === []) {
                return ['ninguna', []];
            }
            usort($inMonth, fn (array $a, array $b) => $b['started_at']->getTimestamp() <=> $a['started_at']->getTimestamp());
            $chosen = [$inMonth[0]];
            $mode = 'mes';
        }

        $rows = [];
        foreach ($chosen as $index => $outage) {
            $start = $outage['started_at']->timezone(self::TZ);
            $end = $outage['recovered_at']?->timezone(self::TZ);
            $open = $end === null;
            $rows[] = [
                'id' => $start->getTimestamp().'-'.$index,
                'inicio' => $start->toIso8601String(),
                'fin' => $end?->toIso8601String(),
                'duracion_segundos' => $this->secondsBetween($start, $end ?? $now),
                'abierta' => $open,
                'estado' => $open ? MonitoringStatus::Caido->value : MonitoringStatus::Operativo->value,
            ];
        }

        return [$mode, $rows];
    }

    /**
     * Solo "Fallo" / Down del Ping. "Fallo (parcial)" y Advertencia no son caída.
     *
     * @return array<int, array{started_at: CarbonImmutable, recovered_at: ?CarbonImmutable}>
     */
    private function realOutages(int $sensorId, CarbonImmutable $fromUtc, CarbonImmutable $toUtc): array
    {
        $events = [];
        foreach ($this->history->fetchMessages($sensorId, 4000) as $row) {
            $at = PrtgTimestamps::fromOle($row['datetime_raw'] ?? null);
            if ($at === null || $at->lt($fromUtc) || $at->gt($toUtc)) {
                continue;
            }
            $status = strip_tags((string) ($row['status'] ?? ''));
            $events[] = [
                'at' => $at,
                'kind' => $this->classifyRealDown($status),
                'status' => $status,
            ];
        }

        $now = CarbonImmutable::now('UTC');

        return array_values(array_filter(
            PrtgOutageIntervalBuilder::build($events),
            function (array $outage) use ($now): bool {
                $end = $outage['recovered_at'] ?? $now;

                return $end->getTimestamp() - $outage['started_at']->getTimestamp() >= 60;
            },
        ));
    }

    /**
     * @return 'DOWN'|'UP'|'WARN'
     */
    private function classifyRealDown(string $status): string
    {
        $s = mb_strtolower(trim($status));
        if ($s === 'ok' || $s === 'up' || str_contains($s, 'arriba')) {
            return 'UP';
        }
        if ($s === 'fallo' || $s === 'down') {
            return 'DOWN';
        }

        return 'WARN';
    }

    /**
     * @return array<string, mixed>|null
     */
    private function livePing(int $prtgSensorId): ?array
    {
        $rows = $this->prtg->fetchTable('sensors', [
            'columns' => 'objid,sensor,status,status_raw,lastcheck_raw,downtimesince_raw,uptimesince_raw',
            'id' => $prtgSensorId,
            'count' => 1,
        ]);

        return $rows[0] ?? null;
    }

    /**
     * @param  array<int, array{started_at: CarbonImmutable, recovered_at: ?CarbonImmutable}>  $outages
     * @return array{started_at: CarbonImmutable, recovered_at: ?CarbonImmutable}|null
     */
    private function latestOpen(array $outages): ?array
    {
        $open = null;
        foreach ($outages as $outage) {
            if ($outage['recovered_at'] === null) {
                $open = $outage;
            }
        }

        return $open;
    }

    /**
     * @param  array<int, array{started_at: CarbonImmutable, recovered_at: ?CarbonImmutable}>  $outages
     */
    private function latestRecovery(array $outages): ?CarbonImmutable
    {
        $latest = null;
        foreach ($outages as $outage) {
            $end = $outage['recovered_at'] ?? null;
            if ($end !== null && ($latest === null || $end->greaterThan($latest))) {
                $latest = $end;
            }
        }

        return $latest;
    }

    private function bucket(string $primary, string $secondary): ?string
    {
        $a = $this->norm($primary);
        $b = $this->norm($secondary);
        $bEmpty = $this->isEmptyNode($b);

        if ($a === 'PROVIDENCIA' && $b === 'SANTA CRUZ') {
            return 'ambos';
        }
        if ($a === 'PROVIDENCIA' && $bEmpty) {
            return 'providencia';
        }
        if ($a === 'SANTA CRUZ' && $bEmpty) {
            return 'santa_cruz';
        }

        return null;
    }

    private function norm(string $value): string
    {
        $v = mb_strtoupper(trim($value));
        $v = preg_replace('/\s+/', ' ', $v) ?? $v;

        return $v;
    }

    private function isEmptyNode(string $value): bool
    {
        return $value === '' || in_array($value, ['N/A', 'NA', 'N.A.', 'N.A', 'S/N', 'S/D', '-', '—', 'NONE', 'NULL'], true);
    }

    private function secondsBetween(CarbonImmutable $from, CarbonImmutable $to): int
    {
        return max(0, $to->getTimestamp() - $from->getTimestamp());
    }

    /**
     * @param  array<string, mixed>  $school
     */
    private function statusLineForExport(array $school): string
    {
        if (($school['estado'] ?? '') === MonitoringStatus::Caido->value) {
            $since = $school['caido_desde'] ?? null;
            $label = $this->formatSeconds($school['caido_segundos'] ?? null);

            return 'Caído hace '.$label.($since ? ' (desde '.$since.')' : '');
        }
        if (! empty($school['sin_caidas'])) {
            return 'Sin caída de Ping en 120 días';
        }
        $since = $school['activo_desde'] ?? null;
        $label = $this->formatSeconds($school['activo_segundos'] ?? null);

        return 'Activo continuo hace '.$label.($since ? ' (desde '.$since.')' : '');
    }

    private function modeLabelForExport(string $mode, int $days): string
    {
        return match ($mode) {
            'semana' => "Caídas reales de Ping, últimos {$days} días",
            'mes' => 'Sin caída en 7 días · última del mes anterior',
            default => 'Sin caída real de Ping',
        };
    }

    private function formatSeconds(mixed $seconds): string
    {
        if ($seconds === null || ! is_numeric($seconds) || (int) $seconds < 0) {
            return '—';
        }
        $total = (int) $seconds;
        if ($total < 60) {
            return '< 1 min';
        }
        $days = intdiv($total, 86_400);
        $hours = intdiv($total % 86_400, 3600);
        $minutes = intdiv($total % 3600, 60);
        if ($days > 0) {
            return "{$days} d {$hours} h";
        }
        if ($hours > 0) {
            return $hours.' h '.str_pad((string) $minutes, 2, '0', STR_PAD_LEFT).' min';
        }

        return "{$minutes} min";
    }
}
