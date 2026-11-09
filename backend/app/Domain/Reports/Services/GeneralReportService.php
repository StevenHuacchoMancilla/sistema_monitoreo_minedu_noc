<?php

namespace App\Domain\Reports\Services;

use App\Domain\Incidents\Services\SlaClockService;
use App\Domain\Incidents\Support\OutageDuration;
use App\Domain\Incidents\Support\RootCauseLegend;
use App\Domain\Monitoring\PRTG\Support\PrtgOperationalLocation;
use App\Domain\Ticketera\Services\ServiceTicketService;
use App\Enums\FollowupStatus;
use App\Enums\ManagementClassification;
use App\Enums\MineduReason;
use App\Enums\TrackingStatus;
use App\Models\Incident;
use App\Models\ServiceTicket;
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
 * Reporte General estilo hoja TICKETERA: incidentes del período con razón MINEDU,
 * código/causa/detalle, ticket y columnas operativas. Paginado y más recientes primero.
 */
class GeneralReportService
{
    private const EXPORT_LIMIT = 10000;

    public function __construct(
        private readonly ServiceTicketService $tickets,
        private readonly SlaClockService $sla,
        private readonly OperationalReportService $operational,
    ) {}

    /**
     * @param  array<string, mixed>  $filters
     * @return array{data: list<array<string, mixed>>, meta: array<string, mixed>, columns: list<array{key: string, label: string}>}
     */
    public function report(array $filters = []): array
    {
        [$from, $to, $periodLabel] = $this->resolvePeriod($filters);

        $page = max(1, (int) ($filters['page'] ?? 1));
        $perPage = (int) ($filters['per_page'] ?? 50);
        if ($perPage < 1) {
            $perPage = 50;
        }
        if ($perPage > 200) {
            $perPage = 200;
        }

        $query = $this->baseQuery($filters, $from, $to);
        $total = (clone $query)->count();
        $lastPage = max(1, (int) ceil($total / $perPage));
        if ($page > $lastPage) {
            $page = $lastPage;
        }

        $offset = ($page - 1) * $perPage;
        $incidents = $query->offset($offset)->limit($perPage)->get();

        $data = $incidents->values()->map(
            fn (Incident $incident, int $i) => $this->mapRow($incident, $offset + $i + 1)
        )->all();

        return [
            'data' => $data,
            'meta' => [
                'total' => $total,
                'returned' => count($data),
                'page' => $page,
                'per_page' => $perPage,
                'last_page' => $lastPage,
                'truncated' => false,
                'limit' => $perPage,
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
        [$from, $to, $periodLabel] = $this->resolvePeriod($filters);
        $query = $this->baseQuery($filters, $from, $to);
        $total = (clone $query)->count();
        $incidents = $query->limit(self::EXPORT_LIMIT)->get();

        $rows = $incidents->values()->map(
            fn (Incident $incident, int $i) => $this->mapRow($incident, $i + 1)
        )->all();
        $columns = $this->columns();

        $spreadsheet = new Spreadsheet;
        $sheet = $spreadsheet->getActiveSheet();
        $sheet->setTitle('TICKETERA');

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

        foreach (range(1, $lastCol) as $i) {
            $sheet->getColumnDimensionByColumn($i)->setWidth($i <= 4 ? 12 : 16);
        }

        $filename = 'reporte_general_ticketera_'.now()->format('Ymd_His').'.xlsx';
        unset($periodLabel, $total);

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
        // Exactamente la hoja TICKETERA del Excel operativo.
        return [
            ['key' => 'ticket', 'label' => 'Ticket'],
            ['key' => 'cid', 'label' => 'CID'],
            ['key' => 'tss', 'label' => 'TSS'],
            ['key' => 'provincia', 'label' => 'Provincia PRTG'],
            ['key' => 'distrito', 'label' => 'Distrito PRTG'],
            ['key' => 'energia', 'label' => 'TIPO DE ENERGÍA'],
            ['key' => 'noc_apertura', 'label' => 'NOC DE APERTURA'],
            ['key' => 'minedu', 'label' => 'RAZÓN (MINEDU)'],
            ['key' => 'codigo', 'label' => 'CÓDIGO'],
            ['key' => 'segmento', 'label' => 'SEGMENTO'],
            ['key' => 'atencion', 'label' => 'ATENCIÓN'],
            ['key' => 'apertura_ticket', 'label' => 'APERTURA DE TICKET'],
            ['key' => 'cierre_ticket', 'label' => 'CIERRE DE TICKET'],
            ['key' => 'noc_cierre', 'label' => 'NOC DE CIERRE'],
            ['key' => 'duracion', 'label' => 'Duración'],
            ['key' => 'parada_reloj', 'label' => 'PARADA DE RELOJ'],
            ['key' => 'duracion_sla', 'label' => 'DURACIÓN SLA'],
            ['key' => 'area', 'label' => 'ÁREA'],
            ['key' => 'estado_ticket', 'label' => 'ESTADO TICKET'],
            ['key' => 'causa', 'label' => 'Causa raíz'],
            ['key' => 'detalle', 'label' => 'Detalle'],
            ['key' => 'detalle_evento', 'label' => 'Detalle de Evento'],
            ['key' => 'cuando_usarlo', 'label' => 'Cuándo usarlo'],
            ['key' => 'zona', 'label' => 'ZONA'],
            ['key' => 'tecnologia', 'label' => 'TECNOLOGIA'],
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
            'all' => [null, null, 'Desde arranque'],
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
                'school:id,local_educativo,codigo_local,current_sequence,provincia,distrito,clasificacion,ambito,energy_type,implementation_zone,implementation_span,installation_type',
                'networkAssignment:id,cid,tecnologia_acceso,prtg_province,prtg_district,prtg_device_name,nodo_pop',
                'serviceTicket',
                'managements' => fn ($q) => $q->orderBy('id'),
                'trackingRecords' => fn ($q) => $q->orderByDesc('id'),
            ])
            ->orderByDesc('started_at')
            ->orderByDesc('id');

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

        $mineduList = $filters['minedu'] ?? [];
        if (is_string($mineduList)) {
            $mineduList = $mineduList !== '' ? [strtoupper(trim($mineduList))] : [];
        }
        if (is_array($mineduList) && $mineduList !== []) {
            $mineduList = array_values(array_unique(array_map(
                fn ($v) => strtoupper(trim((string) $v)),
                $mineduList
            )));
            $withSinRazon = in_array('SIN_RAZON', $mineduList, true);
            $reasons = array_values(array_filter($mineduList, fn ($v) => $v !== 'SIN_RAZON'));

            $query->where(function (Builder $q) use ($withSinRazon, $reasons) {
                if ($reasons !== []) {
                    $q->whereIn('minedu_reason', $reasons);
                }
                if ($withSinRazon) {
                    $method = $reasons !== [] ? 'orWhere' : 'where';
                    $q->{$method}(function (Builder $inner) {
                        $inner->whereNull('minedu_reason')->orWhere('minedu_reason', '');
                    });
                }
            });
        }

        if (! empty($filters['estado'])) {
            $estado = strtoupper(trim((string) $filters['estado']));
            if ($estado === 'ACTIVO' || $estado === 'ABIERTOS') {
                // Abiertos = solo tickets TGS abiertos (excluye SIN TICKET).
                $query->whereHas('serviceTicket', function (Builder $t) {
                    $t->where('status', ServiceTicket::STATUS_OPEN);
                });
            } elseif ($estado === 'RECUPERADO' || $estado === 'CERRADOS') {
                // Cerrados = ticket TGS cerrado.
                $query->whereHas('serviceTicket', function (Builder $t) {
                    $t->where('status', ServiceTicket::STATUS_CLOSED);
                });
            } elseif ($estado === 'CON_MINEDU') {
                $query->whereNotNull('minedu_reason')->where('minedu_reason', '!=', '');
            }
        }

        if (! empty($filters['seguimiento'])) {
            $query->where('followup_status', (string) $filters['seguimiento']);
        }

        if (! empty($filters['tecnologia'])) {
            $tech = trim((string) $filters['tecnologia']);
            $query->whereHas('networkAssignment', function (Builder $q) use ($tech) {
                $q->whereRaw('UPPER(TRIM(COALESCE(tecnologia_acceso, \'\'))) = ?', [mb_strtoupper($tech)]);
            });
        }

        if (! empty($filters['search'])) {
            $term = '%'.mb_strtolower(trim((string) $filters['search'])).'%';
            $query->where(function (Builder $q) use ($term) {
                $q->whereHas('school', function (Builder $s) use ($term) {
                    $s->whereRaw('LOWER(local_educativo) like ?', [$term])
                        ->orWhereRaw('LOWER(codigo_local) like ?', [$term])
                        ->orWhereRaw('CAST(current_sequence AS TEXT) like ?', [$term]);
                })->orWhereHas('networkAssignment', function (Builder $a) use ($term) {
                    $a->whereRaw('LOWER(cid) like ?', [$term])
                        ->orWhereRaw('LOWER(COALESCE(prtg_device_name, \'\')) like ?', [$term]);
                })->orWhereHas('serviceTicket', function (Builder $t) use ($term) {
                    $t->whereRaw('LOWER(ticket_code) like ?', [$term])
                        ->orWhereRaw('LOWER(COALESCE(tss, \'\')) like ?', [$term])
                        ->orWhereRaw('LOWER(COALESCE(cid, \'\')) like ?', [$term]);
                })->orWhereRaw('LOWER(COALESCE(root_cause_code, \'\')) like ?', [$term]);
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
        $ticket = $incident->serviceTicket;
        $loc = PrtgOperationalLocation::apiFields($assignment, $school);
        $tracking = $this->resolveTracking($incident);

        $classification = $incident->management_classification instanceof ManagementClassification
            ? $incident->management_classification
            : ManagementClassification::tryFrom((string) ($incident->management_classification ?? ''));

        $followup = $incident->followup_status instanceof FollowupStatus
            ? $incident->followup_status
            : FollowupStatus::tryFrom((string) ($incident->followup_status ?? ''));

        $minedu = $incident->minedu_reason instanceof MineduReason
            ? $incident->minedu_reason
            : MineduReason::tryFrom((string) ($incident->minedu_reason ?? ''));

        $code = strtoupper(trim((string) (
            $ticket?->cause_code
            ?: $incident->root_cause_code
            ?: ''
        )));
        $legend = $code !== '' ? RootCauseLegend::findByCode($code) : null;

        $cause = trim((string) (
            $ticket?->cause
            ?: $incident->cause
            ?: ($legend['cause'] ?? '')
        ));
        // Igual que Vista de reporte: comentarios del operador con fecha/hora (no editable aquí).
        $detalle = trim((string) (
            $incident->lista_detalle
            ?: $this->operational->operatorDetailOnly($incident)
            ?: $ticket?->detail
            ?: ''
        ));

        $activa = $incident->recovered_at === null;

        $openAt = $ticket?->opened_at;
        $closeAt = $ticket?->closed_at;
        $durationSeconds = $ticket
            ? OutageDuration::seconds($openAt, $closeAt)
            : null;
        $pauseSeconds = $this->sla->pauseSeconds($incident);
        $slaSeconds = $ticket ? $this->sla->effectiveSeconds($incident) : 0;

        $tss = $ticket?->tss
            ?? ($school?->current_sequence !== null ? (string) $school->current_sequence : null);

        $cid = $ticket?->cid ?: $assignment?->cid;

        return [
            'incident_id' => $incident->id,
            'ticket' => $ticket?->ticket_code ?: 'SIN TICKET',
            'cid' => $cid ?: '—',
            'tss' => $tss ?: '—',
            'provincia' => $loc['provincia'] ?: ($ticket?->province ?: '—'),
            'distrito' => $loc['distrito'] ?: ($ticket?->district ?: '—'),
            'energia' => $ticket?->energy ?: ($school?->energy_type ?: '—'),
            'noc_apertura' => $ticket?->opened_by_name ?: '—',
            'minedu' => $minedu?->label()
                ?: (filled($ticket?->minedu) ? (string) $ticket->minedu : '—'),
            'codigo' => $code !== '' ? $code : '—',
            'segmento' => $ticket?->segment ?: ($legend['segment'] ?? '—'),
            'atencion' => $ticket?->attention
                ?: ($legend['attention'] ?? null)
                ?: ($incident->management_scope?->value ?? '—'),
            'apertura_ticket' => OperationalTime::format($openAt, 'd/m/Y H:i') ?? '—',
            'cierre_ticket' => OperationalTime::format($closeAt, 'd/m/Y H:i') ?? '—',
            'noc_cierre' => $ticket?->closed_by_name ?: '—',
            'duracion' => OutageDuration::human($durationSeconds) ?? '—',
            'parada_reloj' => OutageDuration::human($pauseSeconds > 0 ? $pauseSeconds : null) ?? ($pauseSeconds === 0 ? '0' : '—'),
            'duracion_sla' => $ticket
                ? (OutageDuration::human($slaSeconds > 0 ? $slaSeconds : null) ?? ($slaSeconds === 0 ? '0' : '—'))
                : '—',
            'area' => $school?->ambito
                ?: ($ticket?->area ?: '—'),
            'estado_ticket' => $this->ticketStatusLabel($ticket),
            'causa' => $cause !== '' ? $cause : '—',
            'detalle' => $detalle !== '' ? $detalle : '—',
            'detalle_evento' => $ticket ? ($this->tickets->eventText($ticket) ?: '—') : '—',
            'cuando_usarlo' => $legend['when'] ?? '—',
            'zona' => $school?->implementation_zone ?: '—',
            'tecnologia' => $assignment?->tecnologia_acceso ?: '—',
            // meta UI (no columnas Excel)
            'local_educativo' => $ticket?->school_name ?: ($school?->local_educativo ?: '—'),
            'activa' => $activa,
            'seguimiento' => $followup?->label() ?? (string) ($incident->followup_status ?? '—'),
            'clasificacion' => $classification?->label() ?? '—',
            'tracking_id' => $tracking?->id,
        ];
    }

    private function ticketStatusLabel(?ServiceTicket $ticket): string
    {
        if ($ticket === null) {
            return 'SIN TICKET';
        }

        return $ticket->status === ServiceTicket::STATUS_CLOSED ? 'CERRADO' : 'ABIERTO';
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
