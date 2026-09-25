<?php

namespace App\Domain\Reports\Services;

use App\Domain\Monitoring\PRTG\Support\PrtgOperationalLocation;
use App\Enums\FollowupStatus;
use App\Enums\ManagementClassification;
use App\Enums\TrackingStatus;
use App\Models\Incident;
use App\Models\TrackingRecord;
use App\Support\OperationalTime;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Carbon;
use PhpOffice\PhpSpreadsheet\Cell\DataType;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Style\Alignment;
use PhpOffice\PhpSpreadsheet\Style\Border;
use PhpOffice\PhpSpreadsheet\Style\Fill;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Reporte General: todos los incidentes (activos + recuperados) en el período,
 * con columnas operativas + TIPO (= letras CODIGO del Tracking) y CAUSA.
 */
class GeneralReportService
{
    /**
     * @param  array{
     *   period?: string,
     *   day?: ?string,
     *   from?: ?string,
     *   to?: ?string,
     *   provincia?: ?string,
     *   distrito?: ?string,
     *   search?: ?string,
     *   limit?: int
     * }  $filters
     * @return array{data: list<array<string, mixed>>, meta: array<string, mixed>, columns: list<array{key: string, label: string}>}
     */
    public function report(array $filters = []): array
    {
        $limit = (int) ($filters['limit'] ?? 5000);
        if ($limit < 1) {
            $limit = 5000;
        }
        if ($limit > 10000) {
            $limit = 10000;
        }

        [$from, $to, $periodLabel] = $this->resolvePeriod($filters);

        $query = $this->baseQuery($filters, $from, $to);
        $total = (clone $query)->count();
        $incidents = $query->limit($limit)->get();

        $data = $incidents->values()->map(
            fn (Incident $incident, int $i) => $this->mapRow($incident, $i + 1)
        )->all();

        return [
            'data' => $data,
            'meta' => [
                'total' => $total,
                'returned' => count($data),
                'truncated' => $total > count($data),
                'limit' => $limit,
                'period' => $filters['period'] ?? 'today',
                'period_label' => $periodLabel,
                'from' => $from?->copy()->timezone(OperationalTime::tz())->toDateString(),
                'to' => $to?->copy()->timezone(OperationalTime::tz())->toDateString(),
            ],
            'columns' => $this->columns(),
        ];
    }

    /**
     * @param  array<string, mixed>  $filters
     */
    public function downloadXlsx(array $filters = []): StreamedResponse
    {
        $payload = $this->report($filters);
        $rows = $payload['data'];
        $columns = $payload['columns'];

        $spreadsheet = new Spreadsheet;
        $sheet = $spreadsheet->getActiveSheet();
        $sheet->setTitle('Reporte General');

        foreach ($columns as $col => $column) {
            $sheet->setCellValue([$col + 1, 1], $column['label']);
        }

        $lastCol = count($columns);
        $headerRange = 'A1:'.$sheet->getCell([$lastCol, 1])->getColumn().'1';
        $headerStyle = $sheet->getStyle($headerRange);
        $headerStyle->getFont()->setBold(true)->getColor()->setRGB('FFFFFF');
        $headerStyle->getFill()->setFillType(Fill::FILL_SOLID)->getStartColor()->setRGB('1E3A8A');
        $headerStyle->getAlignment()->setHorizontal(Alignment::HORIZONTAL_CENTER)->setVertical(Alignment::VERTICAL_CENTER);

        foreach ($rows as $i => $row) {
            $r = $i + 2;
            foreach ($columns as $col => $column) {
                $key = $column['key'];
                $value = $row[$key] ?? '';
                $sheet->setCellValueExplicit([$col + 1, $r], (string) ($value ?? ''), DataType::TYPE_STRING);
            }
            if (empty($row['activa'])) {
                $sheet->getStyle('A'.$r.':'.$sheet->getCell([$lastCol, $r])->getColumn().$r)
                    ->getFill()->setFillType(Fill::FILL_SOLID)->getStartColor()->setRGB('ECFDF5');
            }
        }

        $lastRow = max(1, count($rows) + 1);
        $sheet->getStyle('A1:'.$sheet->getCell([$lastCol, 1])->getColumn().$lastRow)
            ->getBorders()->getAllBorders()->setBorderStyle(Border::BORDER_THIN)->getColor()->setRGB('CBD5E1');
        $sheet->freezePane('A2');
        $sheet->setAutoFilter('A1:'.$sheet->getCell([$lastCol, 1])->getColumn().$lastRow);

        $widths = [8, 12, 28, 14, 14, 12, 16, 16, 14, 18, 12, 24, 28, 12, 14, 14, 14];
        foreach ($widths as $i => $w) {
            if ($i < $lastCol) {
                $sheet->getColumnDimensionByColumn($i + 1)->setWidth($w);
            }
        }

        $filename = 'reporte_general_'.now()->format('Ymd_His').'.xlsx';

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
            ['key' => 'n', 'label' => 'N°'],
            ['key' => 'cid', 'label' => 'CID'],
            ['key' => 'local_educativo', 'label' => 'LOCAL EDUCATIVO'],
            ['key' => 'provincia', 'label' => 'PROVINCIA'],
            ['key' => 'distrito', 'label' => 'DISTRITO'],
            ['key' => 'tecnologia', 'label' => 'TECNOLOGIA'],
            ['key' => 'caida', 'label' => 'CAIDA'],
            ['key' => 'recuperacion', 'label' => 'RECUPERACION'],
            ['key' => 'estado', 'label' => 'ESTADO'],
            ['key' => 'seguimiento', 'label' => 'SEGUIMIENTO'],
            ['key' => 'clasificacion', 'label' => 'CLASIFICACION'],
            ['key' => 'tipo', 'label' => 'TIPO'],
            ['key' => 'causa', 'label' => 'CAUSA'],
            ['key' => 'detalle', 'label' => 'DETALLE'],
            ['key' => 'pext_pint', 'label' => 'PEXT/PINT'],
            ['key' => 'ticket', 'label' => 'TICKET'],
            ['key' => 'tracking_status', 'label' => 'TRACKING'],
            ['key' => 'codigo_local', 'label' => 'CODIGO LOCAL'],
        ];
    }

    /**
     * @param  array<string, mixed>  $filters
     * @return array{0: ?Carbon, 1: ?Carbon, 2: string}
     */
    private function resolvePeriod(array $filters): array
    {
        $period = strtolower(trim((string) ($filters['period'] ?? 'today')));

        return match ($period) {
            'all' => [null, null, 'Todo el historial'],
            'yesterday' => [
                OperationalTime::dayStart(OperationalTime::now()->subDay()->toDateString()),
                OperationalTime::dayEnd(OperationalTime::now()->subDay()->toDateString()),
                'Ayer',
            ],
            'day' => $this->singleDayBounds((string) ($filters['day'] ?? ''), 'Día específico'),
            'range' => $this->rangeBounds(
                (string) ($filters['from'] ?? ''),
                (string) ($filters['to'] ?? ''),
            ),
            default => [
                OperationalTime::dayStart(),
                OperationalTime::dayEnd(),
                'Hoy',
            ],
        };
    }

    /**
     * @return array{0: Carbon, 1: Carbon, 2: string}
     */
    private function singleDayBounds(string $day, string $label): array
    {
        $day = trim($day);
        if ($day === '' || ! preg_match('/^\d{4}-\d{2}-\d{2}$/', $day)) {
            $day = OperationalTime::now()->toDateString();
        }

        return [
            OperationalTime::dayStart($day),
            OperationalTime::dayEnd($day),
            $label.' ('.$day.')',
        ];
    }

    /**
     * @return array{0: Carbon, 1: Carbon, 2: string}
     */
    private function rangeBounds(string $from, string $to): array
    {
        $from = trim($from);
        $to = trim($to);
        if ($from === '' || ! preg_match('/^\d{4}-\d{2}-\d{2}$/', $from)) {
            $from = OperationalTime::now()->toDateString();
        }
        if ($to === '' || ! preg_match('/^\d{4}-\d{2}-\d{2}$/', $to)) {
            $to = $from;
        }
        if ($to < $from) {
            [$from, $to] = [$to, $from];
        }

        return [
            OperationalTime::dayStart($from),
            OperationalTime::dayEnd($to),
            'Rango '.$from.' → '.$to,
        ];
    }

    /**
     * @param  array<string, mixed>  $filters
     */
    private function baseQuery(array $filters, ?Carbon $from, ?Carbon $to): Builder
    {
        $query = Incident::query()
            ->with([
                'school:id,local_educativo,codigo_local,current_sequence,provincia,distrito',
                'networkAssignment:id,cid,tecnologia_acceso,prtg_province,prtg_district,prtg_device_name',
                'trackingRecords' => fn ($q) => $q->orderByDesc('id'),
            ])
            ->orderBy('started_at')
            ->orderBy('id');

        // Incluye activos y recuperados: filtramos por fecha de caída (started_at).
        if ($from && $to) {
            $query->whereBetween('started_at', [$from, $to]);
        }

        if (! empty($filters['provincia']) || ! empty($filters['distrito'])) {
            PrtgOperationalLocation::constrainByAssignment(
                $query,
                isset($filters['provincia']) ? (string) $filters['provincia'] : null,
                isset($filters['distrito']) ? (string) $filters['distrito'] : null,
            );
        }

        if (! empty($filters['search'])) {
            $term = '%'.mb_strtolower(trim((string) $filters['search'])).'%';
            $query->where(function (Builder $q) use ($term) {
                $q->whereHas('school', function (Builder $s) use ($term) {
                    $s->whereRaw('LOWER(local_educativo) like ?', [$term])
                        ->orWhereRaw('LOWER(codigo_local) like ?', [$term]);
                })->orWhereHas('networkAssignment', function (Builder $a) use ($term) {
                    $a->whereRaw('LOWER(cid) like ?', [$term])
                        ->orWhereRaw('LOWER(COALESCE(prtg_device_name, \'\')) like ?', [$term]);
                });
            });
        }

        return $query;
    }

    /**
     * @return array<string, mixed>
     */
    private function mapRow(Incident $incident, int $ordinal): array
    {
        $school = $incident->school;
        $assignment = $incident->networkAssignment;
        $loc = PrtgOperationalLocation::apiFields($assignment, $school);
        $tracking = $this->resolveTracking($incident);

        $classification = $incident->management_classification instanceof ManagementClassification
            ? $incident->management_classification
            : ManagementClassification::tryFrom((string) ($incident->management_classification ?? ''));

        $followup = $incident->followup_status instanceof FollowupStatus
            ? $incident->followup_status
            : FollowupStatus::tryFrom((string) ($incident->followup_status ?? ''));

        $activa = $incident->recovered_at === null;

        return [
            'n' => $ordinal,
            'incident_id' => $incident->id,
            'cid' => $assignment?->cid,
            'local_educativo' => $school?->local_educativo,
            'provincia' => $loc['provincia'],
            'distrito' => $loc['distrito'],
            'tecnologia' => $assignment?->tecnologia_acceso,
            'caida' => OperationalTime::format($incident->started_at, 'd/m/Y H:i'),
            'recuperacion' => OperationalTime::format($incident->recovered_at, 'd/m/Y H:i'),
            'estado' => $activa ? 'ACTIVO' : 'RECUPERADO',
            'seguimiento' => $followup?->label() ?? (string) ($incident->followup_status ?? '—'),
            'clasificacion' => $classification?->label() ?? '—',
            'tipo' => $tracking?->codigo ?: '—',
            'causa' => $tracking?->causa ?: '—',
            'detalle' => $incident->detail_text ?: '—',
            'pext_pint' => $incident->management_scope?->value ?? '—',
            'ticket' => $tracking?->report_ticket ?? $tracking?->ticket ?? '—',
            'tracking_status' => $this->trackingStatusLabel($tracking),
            'codigo_local' => $school?->codigo_local,
            'activa' => $activa,
            'tracking_id' => $tracking?->id,
        ];
    }

    private function trackingStatusLabel(?TrackingRecord $tracking): string
    {
        if ($tracking === null) {
            return 'Sin tracking';
        }

        $status = $tracking->status instanceof TrackingStatus
            ? $tracking->status
            : TrackingStatus::tryFrom((string) $tracking->status);

        return $status?->label() ?? (string) $tracking->status;
    }

    private function resolveTracking(Incident $incident): ?TrackingRecord
    {
        $records = $incident->trackingRecords;
        if ($records->isEmpty()) {
            return null;
        }

        $open = $records->first(fn (TrackingRecord $t) => $t->isOpen());

        return $open ?? $records->first();
    }
}
