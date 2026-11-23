<?php

namespace App\Domain\Ticketera\Services;

use App\Domain\Reports\Services\OperationalReportService;
use App\Models\Incident;
use App\Models\ServiceTicket;
use App\Support\OperationalTime;
use Carbon\Carbon;

/**
 * Ticketera armada con los tickets del sistema, con las mismas columnas de la hoja.
 */
class LocalTicketeraService
{
    public function __construct(
        private readonly ServiceTicketService $tickets,
        private readonly OperationalReportService $operational,
    ) {}

    /**
     * @return array<string, mixed>
     */
    public function dashboard(): array
    {
        $now = OperationalTime::now();
        $rows = ServiceTicket::query()
            ->with([
                'incident:id,lista_detalle,detail_text,root_cause_code,cause',
                'incident.managements' => fn ($q) => $q->orderBy('id'),
            ])
            ->orderByDesc('opened_at')
            ->orderByDesc('id')
            ->get()
            ->map(fn (ServiceTicket $ticket) => $this->row($ticket))
            ->values()
            ->all();

        // utc() muta el Carbon: calcular "today" en Lima ANTES de convertir a UTC.
        $today = $now->toDateString();
        $nowUtc = $now->copy()->utc()->toIso8601String();

        return [
            'now' => $nowUtc,
            'today' => $today,
            'refresh_seconds' => 30,
            'source' => [
                'spreadsheet_id' => '',
                'sheet' => 'Sistema',
                'mode' => 'sistema',
                'row_count' => count($rows),
                'fetched_at' => $nowUtc,
            ],
            'audit' => [
                'read_rows' => count($rows),
                'affected_rows' => 0,
                'missing_minedu' => 0,
                'invalid_open' => 0,
                'invalid_close' => 0,
                'inverted_dates' => 0,
                'duplicate_tickets' => 0,
            ],
            'warnings' => [],
            'warning_count' => 0,
            'rows' => $rows,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function row(ServiceTicket $ticket): array
    {
        $open = $ticket->opened_at;
        $close = $ticket->closed_at;
        $status = $ticket->status === ServiceTicket::STATUS_CLOSED ? 'CERRADO' : 'ABIERTO';

        return [
            'row' => $ticket->source_row ?: $ticket->id,
            'incident_id' => $ticket->incident_id,
            'ticket' => $ticket->ticket_code,
            'kind' => $ticket->kind,
            'kind_label' => \App\Models\ServiceTicket::kindLabel($ticket->kind),
            'cid' => (string) ($ticket->cid ?? ''),
            'tss' => (string) ($ticket->tss ?? ''),
            'nombre' => (string) ($ticket->school_name ?? ''),
            'provincia' => (string) ($ticket->province ?? ''),
            'distrito' => (string) ($ticket->district ?? ''),
            'energia' => (string) ($ticket->energy ?? ''),
            'codigo' => (string) ($ticket->cause_code ?? ''),
            'grupo' => (string) ($ticket->segment ?? ''),
            'atencion' => (string) ($ticket->attention ?? ''),
            'area' => (string) ($ticket->area ?? ''),
            'minedu' => (string) ($ticket->minedu ?? ''),
            'causa' => (string) ($ticket->cause ?? ''),
            'detalle' => $this->detailText($ticket),
            'event_detail' => $this->tickets->eventText($ticket),
            'open' => $open?->copy()->utc()->toIso8601String(),
            'close' => $close?->copy()->utc()->toIso8601String(),
            'restored' => $ticket->restored_at?->copy()->utc()->toIso8601String(),
            'open_text' => $this->text($open),
            'close_text' => $this->text($close),
            'restored_text' => $this->text($ticket->restored_at),
            'status' => $status,
            'source_status' => $status,
            'sla_seconds' => null,
            'problems' => [],
        ];
    }

    /**
     * Hilo completo de comentarios NOC/admin (no solo el último del ticket).
     */
    private function detailText(ServiceTicket $ticket): string
    {
        $incident = $ticket->incident;
        if ($incident instanceof Incident) {
            // Preferir gestiones: cada comentario con fecha/hora (como Seguimiento).
            $fromMgmt = $this->operational->operatorDetailOnly($incident);
            if (is_string($fromMgmt) && trim($fromMgmt) !== '') {
                return trim($fromMgmt);
            }
            $lista = trim((string) ($incident->lista_detalle ?? ''));
            if ($lista !== '') {
                return $lista;
            }
            $fallback = trim((string) ($incident->detail_text ?? ''));
            if ($fallback !== '') {
                return $fallback;
            }
        }

        return trim((string) ($ticket->detail ?? ''));
    }

    private function text(?Carbon $at): string
    {
        return OperationalTime::format($at, 'd/m/Y H:i') ?? '';
    }
}
