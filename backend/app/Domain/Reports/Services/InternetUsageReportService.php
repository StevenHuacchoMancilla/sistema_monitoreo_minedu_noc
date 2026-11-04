<?php

namespace App\Domain\Reports\Services;

use App\Domain\Monitoring\PRTG\Support\TrafficValue;
use App\Enums\PrtgSensorRole;
use App\Models\NetworkAssignment;
use App\Models\PrtgTrafficSample;
use App\Support\OperationalTime;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Style\Fill;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Uso de internet por colegio a partir de los sensores de transmisión y recepción de PRTG.
 */
class InternetUsageReportService
{
    /**
     * @return array{total: int, rows: list<array<string, mixed>>}
     */
    public function preview(?string $search = null): array
    {
        $rows = $this->rows($search);

        return [
            'total' => count($rows),
            'rows' => $rows,
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
     * @return list<array<string, mixed>>
     */
    private function rows(?string $search): array
    {
        $query = NetworkAssignment::query()
            ->with([
                'school:id,local_educativo,codigo_local,provincia,distrito',
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
            $term = '%'.mb_strtolower(trim($search)).'%';
            $query->where(function ($q) use ($term) {
                $q->whereRaw('LOWER(cid) like ?', [$term])
                    ->orWhereHas('school', function ($s) use ($term) {
                        $s->whereRaw('LOWER(local_educativo) like ?', [$term])
                            ->orWhereRaw('LOWER(COALESCE(codigo_local, \'\')) like ?', [$term]);
                    });
            });
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
