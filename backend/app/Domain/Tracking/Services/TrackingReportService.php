<?php

namespace App\Domain\Tracking\Services;

use App\Enums\DatePrecision;
use App\Enums\TrackingStatus;
use App\Models\TrackingRecord;
use App\Models\TrackingUpdate;
use Illuminate\Support\Carbon;
use PhpOffice\PhpSpreadsheet\Cell\DataType;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Style\Alignment;
use PhpOffice\PhpSpreadsheet\Style\Border;
use PhpOffice\PhpSpreadsheet\Style\Fill;
use PhpOffice\PhpSpreadsheet\Worksheet\Worksheet;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Vista / export shape alineada a TRACKING GENERAL.xlsx (10 columnas).
 */
class TrackingReportService
{
    public function __construct(private readonly TrackingListService $list) {}

    /**
     * @param  array<string, mixed>  $filters
     * @return array{data: list<array<string, mixed>>, meta: array<string, mixed>, columns: list<array{key: string, label: string}>}
     */
    public function report(array $filters): array
    {
        $limit = (int) ($filters['limit'] ?? 2000);
        if ($limit < 1) {
            $limit = 2000;
        }
        if ($limit > 5000) {
            $limit = 5000;
        }

        $query = $this->list->filteredQuery($filters)
            ->with([
                'openedBy:id,name',
                'closedBy:id,name',
                'updates' => fn ($q) => $q->orderBy('id'),
            ])
            ->orderBy('tracking_records.incident_number')
            ->orderBy('tracking_records.id');

        $total = (clone $query)->count();
        $rows = $query->limit($limit)->get();

        $data = $rows->map(fn (TrackingRecord $row) => $this->mapExcelRow($row))->values()->all();

        return [
            'data' => $data,
            'meta' => [
                'total' => $total,
                'returned' => count($data),
                'truncated' => $total > count($data),
                'limit' => $limit,
            ],
            'columns' => $this->columns(),
        ];
    }

    /**
     * Export XLSX con las 10 columnas originales del Excel operativo.
     *
     * @param  array<string, mixed>  $filters
     */
    public function downloadXlsx(array $filters = []): StreamedResponse
    {
        if (! isset($filters['limit'])) {
            $filters['limit'] = 5000;
        }

        $payload = $this->report($filters);
        $rows = $payload['data'];
        $columns = $payload['columns'];

        $spreadsheet = new Spreadsheet;
        $sheet = $spreadsheet->getActiveSheet();
        $sheet->setTitle('Tracking General');

        foreach ($columns as $col => $column) {
            $sheet->setCellValue([$col + 1, 1], $column['label']);
        }

        $lastCol = count($columns);
        $headerRange = 'A1:'.$sheet->getCell([$lastCol, 1])->getColumn().'1';
        $headerStyle = $sheet->getStyle($headerRange);
        $headerStyle->getFont()->setBold(true)->getColor()->setRGB('FFFFFF');
        $headerStyle->getFill()->setFillType(Fill::FILL_SOLID)->getStartColor()->setRGB('5B21B6');
        $headerStyle->getAlignment()->setHorizontal(Alignment::HORIZONTAL_CENTER)->setVertical(Alignment::VERTICAL_CENTER);

        foreach ($rows as $i => $row) {
            $r = $i + 2;
            $sheet->setCellValue([1, $r], $row['n_incidente']);
            $sheet->setCellValueExplicit([2, $r], (string) ($row['ticket'] ?? ''), DataType::TYPE_STRING);
            $sheet->setCellValueExplicit([3, $r], (string) ($row['tss'] ?? ''), DataType::TYPE_STRING);
            $sheet->setCellValueExplicit([4, $r], (string) ($row['cid'] ?? ''), DataType::TYPE_STRING);
            $sheet->setCellValue([5, $r], $row['descripcion']);
            $sheet->setCellValueExplicit([6, $r], (string) ($row['apertura'] ?? ''), DataType::TYPE_STRING);
            $sheet->setCellValue([7, $r], $row['nombre_apertura']);
            $sheet->setCellValue([8, $r], $row['seguimiento']);
            $sheet->setCellValueExplicit([9, $r], (string) ($row['cierre'] ?? ''), DataType::TYPE_STRING);
            $sheet->setCellValue([10, $r], $row['nombre_cierre']);

            $sheet->getStyle("H{$r}")->getAlignment()->setWrapText(true)->setVertical(Alignment::VERTICAL_TOP);

            if (! empty($row['is_closed'])) {
                // Verde solo visual (como el Excel histórico); el cierre real es CIERRE/NOMBRE.
                $sheet->getStyle("A{$r}:J{$r}")->getFill()
                    ->setFillType(Fill::FILL_SOLID)
                    ->getStartColor()->setRGB('DCFCE7');
            }
        }

        $lastRow = max(1, count($rows) + 1);
        $sheet->getStyle('A1:J'.$lastRow)->getBorders()->getAllBorders()
            ->setBorderStyle(Border::BORDER_THIN)
            ->getColor()->setRGB('CBD5E1');

        $sheet->freezePane('A2');
        $sheet->setAutoFilter('A1:J'.$lastRow);
        $this->setColumnWidths($sheet);

        $filename = 'tracking_general_'.now()->format('Ymd_His').'.xlsx';

        return response()->streamDownload(function () use ($spreadsheet) {
            $writer = new Xlsx($spreadsheet);
            $writer->save('php://output');
        }, $filename, [
            'Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ]);
    }

    /**
     * @return list<array{key: string, label: string}>
     */
    public function columns(): array
    {
        return [
            ['key' => 'n_incidente', 'label' => 'N° INCIDENTE'],
            ['key' => 'ticket', 'label' => 'TICKET'],
            ['key' => 'tss', 'label' => 'TSS'],
            ['key' => 'cid', 'label' => 'CID'],
            ['key' => 'descripcion', 'label' => 'DESCRIPCION'],
            ['key' => 'apertura', 'label' => 'APERTURA'],
            ['key' => 'nombre_apertura', 'label' => 'NOMBRE'],
            ['key' => 'seguimiento', 'label' => 'SEGUIMIENTO'],
            ['key' => 'cierre', 'label' => 'CIERRE'],
            ['key' => 'nombre_cierre', 'label' => 'NOMBRE'],
        ];
    }

    private function setColumnWidths(Worksheet $sheet): void
    {
        $widths = [12, 12, 10, 12, 28, 16, 14, 42, 16, 14];
        foreach ($widths as $i => $width) {
            $sheet->getColumnDimensionByColumn($i + 1)->setWidth($width);
        }
    }

    /**
     * @return array<string, mixed>
     */
    private function mapExcelRow(TrackingRecord $row): array
    {
        $status = $row->status instanceof TrackingStatus
            ? $row->status
            : TrackingStatus::tryFrom((string) $row->status);

        return [
            'id' => $row->id,
            'status' => $status?->value,
            'status_label' => $status?->label(),
            'is_closed' => $row->isClosed(),
            'n_incidente' => $row->incident_number,
            'ticket' => $row->ticket,
            'tss' => $row->tss_snapshot,
            'cid' => $row->cid_snapshot,
            'descripcion' => $row->description,
            'apertura' => $this->formatDate($row->opened_at, $row->opened_at_precision),
            'nombre_apertura' => $row->openedByDisplayName(),
            'seguimiento' => $this->formatSeguimiento($row),
            'cierre' => $this->formatDate($row->closed_at, $row->closed_at_precision),
            'nombre_cierre' => $row->closedByDisplayName(),
        ];
    }

    private function formatSeguimiento(TrackingRecord $row): string
    {
        $lines = [];
        foreach ($row->updates as $update) {
            /** @var TrackingUpdate $update */
            $prefix = $this->updateDatePrefix($update);
            $body = trim((string) $update->body);
            if ($body === '') {
                continue;
            }
            $lines[] = $prefix !== '' ? $prefix.' '.$body : $body;
        }

        return implode("\n", $lines);
    }

    private function updateDatePrefix(TrackingUpdate $update): string
    {
        if ($update->occurred_at instanceof Carbon) {
            if ($update->occurred_at->format('H:i:s') !== '00:00:00') {
                return $update->occurred_at->format('d/m/Y H:i');
            }

            return $update->occurred_at->format('d/m');
        }

        if ($update->occurred_on) {
            $on = $update->occurred_on instanceof Carbon
                ? $update->occurred_on
                : Carbon::parse((string) $update->occurred_on);

            return $on->format('d/m');
        }

        if ($update->created_at instanceof Carbon) {
            return $update->created_at->format('d/m/Y H:i');
        }

        return '';
    }

    private function formatDate(mixed $at, mixed $precision): ?string
    {
        if (! $at instanceof Carbon) {
            return null;
        }

        $isDateOnly = $precision === 'DATE'
            || $precision === DatePrecision::Date
            || ($precision instanceof DatePrecision && $precision === DatePrecision::Date);

        return $isDateOnly ? $at->format('d/m/Y') : $at->format('d/m/Y H:i');
    }
}
