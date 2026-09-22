<?php

namespace App\Domain\Tracking\Support;

use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Worksheet\Worksheet;

class TrackingExcelReader
{
    /**
     * @return list<array{
     *   __row: int,
     *   incident_number: ?string,
     *   ticket: ?string,
     *   tss: ?string,
     *   cid: ?string,
     *   description: ?string,
     *   opened_raw: mixed,
     *   opened_fmt: string,
     *   opened_by: ?string,
     *   seguimiento: string,
     *   closed_raw: mixed,
     *   closed_fmt: string,
     *   closed_by: ?string
     * }>
     */
    public function read(string $path): array
    {
        if (! is_file($path)) {
            throw new \InvalidArgumentException("No existe el archivo: {$path}");
        }

        $reader = IOFactory::createReaderForFile($path);
        $reader->setReadDataOnly(false);
        $spreadsheet = $reader->load($path);
        $sheet = $spreadsheet->getActiveSheet();

        $this->assertHeaders($sheet);

        $highestRow = (int) $sheet->getHighestDataRow();
        $rows = [];

        for ($r = 2; $r <= $highestRow; $r++) {
            $incidentNumber = $this->fmt($sheet, 1, $r);
            if ($incidentNumber === '') {
                continue;
            }

            $rows[] = [
                '__row' => $r,
                'incident_number' => $incidentNumber,
                'ticket' => $this->nullableFmt($sheet, 2, $r),
                'tss' => $this->nullableFmt($sheet, 3, $r),
                'cid' => $this->nullableFmt($sheet, 4, $r),
                'description' => $this->nullableFmt($sheet, 5, $r),
                'opened_raw' => $sheet->getCell([6, $r])->getValue(),
                'opened_fmt' => $this->fmt($sheet, 6, $r),
                'opened_by' => $this->nullableFmt($sheet, 7, $r),
                'seguimiento' => (string) $sheet->getCell([8, $r])->getFormattedValue(),
                'closed_raw' => $sheet->getCell([9, $r])->getValue(),
                'closed_fmt' => $this->fmt($sheet, 9, $r),
                'closed_by' => $this->nullableFmt($sheet, 10, $r),
            ];
        }

        $spreadsheet->disconnectWorksheets();
        unset($spreadsheet);

        return $rows;
    }

    private function assertHeaders(Worksheet $sheet): void
    {
        $expected = [
            1 => 'N° INCIDENTE',
            2 => 'TICKET',
            3 => 'TSS',
            4 => 'CID',
            5 => 'DESCRIPCION',
            6 => 'APERTURA',
            7 => 'NOMBRE',
            8 => 'SEGUIMIENTO',
            9 => 'CIERRE',
            10 => 'NOMBRE',
        ];

        foreach ($expected as $col => $label) {
            $actual = trim((string) $sheet->getCell([$col, 1])->getFormattedValue());
            $normActual = mb_strtoupper($actual);
            $normExpected = mb_strtoupper($label);
            if ($normActual !== $normExpected && ! ($col === 1 && str_contains($normActual, 'INCIDENTE'))) {
                throw new \RuntimeException(
                    "Header inesperado en columna {$col}: se esperaba [{$label}], se obtuvo [{$actual}]"
                );
            }
        }
    }

    private function fmt(Worksheet $sheet, int $col, int $row): string
    {
        return trim((string) $sheet->getCell([$col, $row])->getFormattedValue());
    }

    private function nullableFmt(Worksheet $sheet, int $col, int $row): ?string
    {
        $v = $this->fmt($sheet, $col, $row);

        return $v === '' ? null : $v;
    }
}
