<?php

namespace App\Domain\Reports\Services;

use PhpOffice\PhpSpreadsheet\Cell\DataType;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Style\Alignment;
use PhpOffice\PhpSpreadsheet\Style\Border;
use PhpOffice\PhpSpreadsheet\Style\Fill;
use PhpOffice\PhpSpreadsheet\Worksheet\Worksheet;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;
use Symfony\Component\HttpFoundation\StreamedResponse;

class ClosingReportService
{
    public function __construct(private readonly OperationalReportService $operational) {}

    /**
     * @return array{total: int, rows: list<array<string, mixed>>, note: string, columns: list<string>}
     */
    public function preview(): array
    {
        $rows = $this->operational->closingRows()->values()->all();

        return [
            'total' => count($rows),
            'rows' => $rows,
            'note' => 'Lista de LLEE del día · sin Activo ni Restablecido · DETALLE manual.',
            'columns' => OperationalReportService::officialColumns(),
        ];
    }

    public function downloadXlsx(): StreamedResponse
    {
        $preview = $this->preview();
        $rows = $preview['rows'];
        $headers = OperationalReportService::officialColumns();

        $spreadsheet = new Spreadsheet;
        $sheet = $spreadsheet->getActiveSheet();
        $sheet->setTitle('Lista LLEE');

        foreach ($headers as $col => $header) {
            $sheet->setCellValue([$col + 1, 1], $header);
        }

        $lastCol = count($headers);
        $headerRange = 'A1:'.$sheet->getCell([$lastCol, 1])->getColumn().'1';
        $headerStyle = $sheet->getStyle($headerRange);
        $headerStyle->getFont()->setBold(true)->getColor()->setRGB('FFFFFF');
        $headerStyle->getFill()->setFillType(Fill::FILL_SOLID)->getStartColor()->setRGB('1E3A5F');
        $headerStyle->getAlignment()->setHorizontal(Alignment::HORIZONTAL_CENTER);

        foreach ($rows as $i => $row) {
            $r = $i + 2;
            $sheet->setCellValue([1, $r], $row['n']);
            $sheet->setCellValueExplicit([2, $r], (string) ($row['cid'] ?? ''), DataType::TYPE_STRING);
            $sheet->setCellValue([3, $r], $row['local_educativo']);
            $sheet->setCellValue([4, $r], $row['presentacion_nombre_prtg']);
            $sheet->setCellValue([5, $r], $row['estado_prtg'] ?? '');
            $sheet->setCellValue([6, $r], $row['lista_estado'] ?? '');
            $sheet->setCellValueExplicit([7, $r], (string) ($row['root_cause_code'] ?? ''), DataType::TYPE_STRING);
            $sheet->setCellValue([8, $r], $row['root_cause'] ?? '');
            $sheet->setCellValue([9, $r], $row['caida']);
            $sheet->setCellValue([10, $r], $row['detalle']);
            $sheet->setCellValue([11, $r], $row['provincia']);
            $sheet->setCellValue([12, $r], $row['distrito']);
            $sheet->setCellValue([13, $r], $row['zona'] ?? '');

            $fill = ($row['color_key'] ?? '') === 'red' ? 'FECACA' : 'FDE68A';
            $end = $sheet->getCell([$lastCol, $r])->getColumn();
            $sheet->getStyle("A{$r}:{$end}{$r}")->getFill()
                ->setFillType(Fill::FILL_SOLID)
                ->getStartColor()->setRGB($fill);
        }

        $lastRow = max(1, count($rows) + 1);
        $endCol = $sheet->getCell([$lastCol, 1])->getColumn();
        $sheet->getStyle('A1:'.$endCol.$lastRow)->getBorders()->getAllBorders()
            ->setBorderStyle(Border::BORDER_THIN)
            ->getColor()->setRGB('CBD5E1');

        $sheet->freezePane('A2');
        $sheet->setAutoFilter('A1:'.$endCol.$lastRow);
        $this->setColumnWidths($sheet);

        $filename = 'lista_llee_'.now()->format('Ymd_His').'.xlsx';

        return response()->streamDownload(function () use ($spreadsheet) {
            $writer = new Xlsx($spreadsheet);
            $writer->save('php://output');
        }, $filename, [
            'Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ]);
    }

    private function setColumnWidths(Worksheet $sheet): void
    {
        $widths = [8, 12, 28, 40, 12, 18, 10, 28, 16, 40, 18, 16, 14];
        foreach ($widths as $i => $width) {
            $sheet->getColumnDimensionByColumn($i + 1)->setWidth($width);
        }
    }
}
