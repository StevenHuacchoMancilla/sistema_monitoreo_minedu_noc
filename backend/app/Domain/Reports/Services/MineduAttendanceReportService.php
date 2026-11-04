<?php

namespace App\Domain\Reports\Services;

use App\Domain\Incidents\Services\SlaClockService;
use App\Enums\MineduReason;
use App\Models\Incident;
use App\Support\OperationalTime;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Style\Alignment;
use PhpOffice\PhpSpreadsheet\Style\Border;
use PhpOffice\PhpSpreadsheet\Style\Fill;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Anexo 30: atención de incidentes agrupada en Energía, Afectación e Incidencia.
 */
class MineduAttendanceReportService
{
    public function __construct(private readonly SlaClockService $sla) {}

    /**
     * @return array{total: int, groups: list<array{key: string, label: string, total: int}>, rows: list<array<string, mixed>>}
     */
    public function preview(): array
    {
        $rows = $this->rows();
        $groups = [];
        foreach (MineduReason::cases() as $reason) {
            $groups[] = [
                'key' => $reason->value,
                'label' => $reason->label(),
                'total' => count(array_filter($rows, fn (array $row) => $row['minedu_reason'] === $reason->value)),
            ];
        }

        return [
            'total' => count($rows),
            'groups' => $groups,
            'rows' => $rows,
        ];
    }

    public function downloadXlsx(): StreamedResponse
    {
        $preview = $this->preview();
        $spreadsheet = new Spreadsheet;
        $sheet = $spreadsheet->getActiveSheet();
        $sheet->setTitle('Anexo 30');

        $sheet->setCellValue('A1', 'FORMATO DE REPORTE DE ATENCION DE INCIDENTES');
        $sheet->setCellValue('A2', 'SERVICIO DE CONECTIVIDAD A INTERNET PARA LOCALES EDUCATIVOS DE LA REGION LORETO');
        $sheet->setCellValue('A3', 'ELABORADO POR: GLOBAL FIBER PERU S.A.C.');
        $sheet->mergeCells('A1:Q1');
        $sheet->mergeCells('A2:Q2');
        $sheet->getStyle('A1:A3')->getFont()->setBold(true);

        $headers = [
            'N° INCIDENCIA',
            'CODIGO DEL LOCAL EDUCATIVO',
            'NOMBRE DE LA INSTITUCION EDUCATIVA',
            'DEPARTAMENTO',
            'PROVINCIA',
            'DISTRITO',
            'CONTACTO',
            'TIPO DE REQUERIMIENTO/INCIDENCIA',
            'FECHA Y HORA DE REPORTE',
            'FECHA Y HORA DE GENERACION DEL TICKET',
            'FECHA Y HORA DE SOLUCION',
            'TIEMPO TOTAL (HRS)',
            'TIEMPO EFECTIVO (HRS)',
            'DETALLE DE LA SOLUCION',
            'RESPONSABLE',
            'ACTIVIDADES REALIZADAS',
            'RAZON MINEDU',
        ];
        foreach ($headers as $i => $header) {
            $sheet->setCellValue([$i + 1, 5], $header);
        }
        $sheet->getStyle('A5:Q5')->getFont()->setBold(true)->getColor()->setRGB('FFFFFF');
        $sheet->getStyle('A5:Q5')->getFill()->setFillType(Fill::FILL_SOLID)->getStartColor()->setRGB('1E3A5F');
        $sheet->getStyle('A5:Q5')->getAlignment()->setWrapText(true);

        $fills = [
            MineduReason::CaidaEnlace->value => 'DBEAFE',
            MineduReason::CaidaEnergia->value => 'FDE68A',
            MineduReason::Requerimiento->value => 'E2E8F0',
        ];

        foreach ($preview['rows'] as $index => $row) {
            $r = $index + 6;
            $values = [
                $index + 1,
                $row['codigo_local'],
                $row['local_educativo'],
                $row['departamento'],
                $row['provincia'],
                $row['distrito'],
                $row['contacto'],
                $row['minedu_label'],
                $row['reportado_at'],
                $row['ticket_at'],
                $row['solucion_at'],
                $row['horas_totales'],
                $row['horas_efectivas'],
                $row['detalle'],
                $row['responsable'],
                $row['actividades'],
                $row['minedu_label'],
            ];
            foreach ($values as $c => $value) {
                $sheet->setCellValue([$c + 1, $r], $value);
            }
            $color = $fills[$row['minedu_reason']] ?? 'FFFFFF';
            $sheet->getStyle("A{$r}:Q{$r}")->getFill()->setFillType(Fill::FILL_SOLID)->getStartColor()->setRGB($color);
        }

        $last = max(5, count($preview['rows']) + 5);
        $sheet->getStyle('A5:Q'.$last)->getBorders()->getAllBorders()
            ->setBorderStyle(Border::BORDER_THIN)->getColor()->setRGB('CBD5E1');
        $sheet->getStyle('A6:Q'.$last)->getAlignment()->setVertical(Alignment::VERTICAL_TOP)->setWrapText(true);
        foreach ([18, 16, 36, 16, 18, 18, 32, 18, 20, 22, 20, 14, 16, 40, 22, 40, 16] as $i => $width) {
            $sheet->getColumnDimensionByColumn($i + 1)->setWidth($width);
        }

        $filename = 'anexo30_atencion_incidentes_'.now()->format('Ymd_His').'.xlsx';

        return response()->streamDownload(function () use ($spreadsheet) {
            (new Xlsx($spreadsheet))->save('php://output');
        }, $filename, [
            'Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ]);
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function rows(): array
    {
        $start = OperationalTime::dayStart(OperationalTime::now()->startOfMonth());
        $end = OperationalTime::dayEnd(OperationalTime::now()->endOfMonth());

        $incidents = Incident::query()
            ->with([
                'school',
                'networkAssignment',
                'managements' => fn ($q) => $q->orderBy('id'),
            ])
            ->whereNotNull('minedu_reason')
            ->where('started_at', '<=', $end)
            ->where(function ($q) use ($start) {
                $q->whereNull('recovered_at')->orWhere('recovered_at', '>=', $start);
            })
            ->orderByRaw("CASE minedu_reason WHEN 'CAIDA_ENERGIA' THEN 0 WHEN 'CAIDA_ENLACE' THEN 1 ELSE 2 END")
            ->orderBy('started_at')
            ->get();

        return $incidents->map(function (Incident $incident) {
            $reason = $incident->minedu_reason instanceof MineduReason
                ? $incident->minedu_reason
                : MineduReason::from((string) $incident->minedu_reason);
            $school = $incident->school;
            $contact = $incident->managements->reverse()->first(fn ($m) => filled($m->contact_name_snapshot));
            $activities = $incident->managements
                ->map(fn ($m) => trim((string) ($m->detail ?: $m->observation ?: '')))
                ->filter()
                ->unique()
                ->implode(' · ');
            $elapsed = $this->sla->elapsedSeconds($incident);
            $net = $this->sla->effectiveSeconds($incident);

            return [
                'incident_id' => $incident->id,
                'cid' => $incident->networkAssignment?->cid,
                'codigo_local' => $school?->codigo_local,
                'local_educativo' => $school?->local_educativo,
                'departamento' => $school?->departamento,
                'provincia' => $school?->provincia,
                'distrito' => $school?->distrito,
                'contacto' => $contact
                    ? trim($contact->contact_name_snapshot.' · '.$contact->contact_phone_snapshot)
                    : null,
                'minedu_reason' => $reason->value,
                'minedu_label' => $reason->label(),
                'reportado_at' => OperationalTime::format($incident->started_at, 'd/m/Y H:i'),
                'ticket_at' => OperationalTime::format($incident->created_at, 'd/m/Y H:i'),
                'solucion_at' => OperationalTime::format($incident->recovered_at, 'd/m/Y H:i'),
                'horas_totales' => round($elapsed / 3600, 2),
                'horas_efectivas' => round($net / 3600, 2),
                'detalle' => $incident->detail_text,
                'responsable' => $incident->management_scope?->value,
                'actividades' => $activities !== '' ? $activities : $incident->detail_text,
            ];
        })->values()->all();
    }
}
