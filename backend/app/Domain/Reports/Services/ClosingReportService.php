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
            'note' => 'Solo CONTACT_CONFIRMED activas (filas rojas). Recuperadas excluidas.',
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
        $sheet->setTitle('Informe cierre');

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
            $sheet->setCellValue([5, $r], $row['caida']);
            $sheet->setCellValue([6, $r], $row['tipo']);
            $sheet->setCellValue([7, $r], $row['detalle']);
            $sheet->setCellValue([8, $r], $row['pext_pint']);
            $sheet->setCellValue([9, $r], $row['provincia']);
            $sheet->setCellValue([10, $r], $row['distrito']);
            $sheet->setCellValueExplicit([11, $r], (string) ($row['codigo_local'] ?? ''), DataType::TYPE_STRING);

            $sheet->getStyle("A{$r}:K{$r}")->getFill()
                ->setFillType(Fill::FILL_SOLID)
                ->getStartColor()->setRGB('FEE2E2');
        }

        $lastRow = max(1, count($rows) + 1);
        $sheet->getStyle('A1:K'.$lastRow)->getBorders()->getAllBorders()
            ->setBorderStyle(Border::BORDER_THIN)
            ->getColor()->setRGB('CBD5E1');

        $sheet->freezePane('A2');
        $sheet->setAutoFilter('A1:K'.$lastRow);
        $this->setColumnWidths($sheet);

        $filename = 'informe_cierre_contacto_confirmado_'.now()->format('Ymd_His').'.xlsx';

        return response()->streamDownload(function () use ($spreadsheet) {
            $writer = new Xlsx($spreadsheet);
            $writer->save('php://output');
        }, $filename, [
            'Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ]);
    }

    private function setColumnWidths(Worksheet $sheet): void
    {
        $widths = [8, 12, 28, 42, 18, 10, 36, 12, 24, 20, 16];
        foreach ($widths as $i => $width) {
            $sheet->getColumnDimensionByColumn($i + 1)->setWidth($width);
        }
    }
}
