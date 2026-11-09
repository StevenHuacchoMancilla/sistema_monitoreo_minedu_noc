<?php

namespace App\Domain\Ticketera\Services;

use App\Models\ServiceTicket;
use App\Support\OperationalTime;
use Carbon\Carbon;

/**
 * Ticketera armada con los tickets del sistema, con las mismas columnas de la hoja.
 */
class LocalTicketeraService
{
    public function __construct(private readonly ServiceTicketService $tickets) {}

    /**
     * @return array<string, mixed>
     */
    public function dashboard(): array
    {
        $now = OperationalTime::now();
        $rows = ServiceTicket::query()
            ->orderByDesc('opened_at')
            ->orderByDesc('id')
            ->get()
            ->map(fn (ServiceTicket $ticket) => $this->row($ticket))
            ->values()
            ->all();

        return [
            'now' => $now->utc()->toIso8601String(),
            'today' => $now->toDateString(),
            'refresh_seconds' => 30,
            'source' => [
                'spreadsheet_id' => '',
                'sheet' => 'Sistema',
                'mode' => 'sistema',
                'row_count' => count($rows),
                'fetched_at' => $now->utc()->toIso8601String(),
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
            'detalle' => (string) ($ticket->detail ?? ''),
            'event_detail' => $this->tickets->eventText($ticket),
            'open' => $open?->utc()->toIso8601String(),
            'close' => $close?->utc()->toIso8601String(),
            'restored' => $ticket->restored_at?->utc()->toIso8601String(),
            'open_text' => $this->text($open),
            'close_text' => $this->text($close),
            'restored_text' => $this->text($ticket->restored_at),
            'status' => $status,
            'source_status' => $status,
            'sla_seconds' => null,
            'problems' => [],
        ];
    }

    private function text(?Carbon $at): string
    {
        return OperationalTime::format($at, 'd/m/Y H:i') ?? '';
    }
}
