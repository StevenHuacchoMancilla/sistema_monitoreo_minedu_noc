<?php

namespace App\Domain\Ticketera\Services;

use App\Models\NetworkAssignment;
use App\Models\School;
use App\Models\ServiceTicket;
use App\Support\OperationalTime;
use Carbon\Carbon;
use InvalidArgumentException;
use XMLReader;

/**
 * Carga la hoja TICKETERA del Excel operativo. No crea incidencias de PRTG.
 */
class TicketeraWorkbookImporter
{
    /**
     * @return array{imported: int, skipped: int, linked: int, unmatched: int}
     */
    public function import(string $path): array
    {
        if (! is_file($path)) {
            throw new InvalidArgumentException('No se encontró el Excel de ticketera.');
        }

        $byCid = $this->assignmentsByCid();
        $byTss = School::query()
            ->whereNotNull('current_sequence')
            ->get()
            ->keyBy(fn (School $school) => (string) $school->current_sequence);

        $counts = ['imported' => 0, 'skipped' => 0, 'linked' => 0, 'unmatched' => 0];
        $known = ServiceTicket::query()->pluck('ticket_code')->flip();

        foreach ($this->rows($path) as $row) {
            $code = trim((string) ($row['ticket'] ?? ''));
            $cid = preg_replace('/\D+/', '', (string) ($row['cid'] ?? '')) ?? '';
            if ($code === '' || $cid === '') {
                continue;
            }

            if ($known->has($code)) {
                $counts['skipped']++;

                continue;
            }

            $assignment = $byCid[$cid] ?? null;
            $school = $assignment?->school;
            if ($school === null) {
                $school = $byTss[(string) ($row['tss'] ?? '')] ?? null;
            }
            if ($school === null) {
                $counts['unmatched']++;
            }

            $opened = $this->excelDate($row['open'] ?? '');
            $closed = $this->excelDate($row['close'] ?? '');
            $statusText = $this->fold((string) ($row['status'] ?? ''));
            $closedStatus = $statusText === 'CERRADO' || $closed !== null;
            $event = trim((string) ($row['event'] ?? ''));

            ServiceTicket::query()->create([
                'incident_id' => null,
                'school_id' => $school?->id,
                'ticket_code' => $code,
                'kind' => ServiceTicket::KIND_CORRECTIVE,
                'status' => $closedStatus ? ServiceTicket::STATUS_CLOSED : ServiceTicket::STATUS_OPEN,
                'cid' => $cid,
                'tss' => trim((string) ($row['tss'] ?? '')) ?: ($school?->current_sequence !== null ? (string) $school->current_sequence : null),
                'school_name' => $school?->local_educativo,
                'province' => trim((string) ($row['province'] ?? '')) ?: $school?->provincia,
                'district' => trim((string) ($row['district'] ?? '')) ?: $school?->distrito,
                'energy' => trim((string) ($row['energy'] ?? '')) ?: null,
                'area' => trim((string) ($row['area'] ?? '')) ?: $school?->clasificacion,
                'opened_by_name' => trim((string) ($row['opened_by'] ?? '')) ?: null,
                'closed_by_name' => trim((string) ($row['closed_by'] ?? '')) ?: null,
                'minedu' => trim((string) ($row['minedu'] ?? '')) ?: null,
                'cause_code' => strtoupper(trim((string) ($row['code'] ?? ''))) ?: null,
                'segment' => trim((string) ($row['segment'] ?? '')) ?: null,
                'attention' => trim((string) ($row['attention'] ?? '')) ?: null,
                'cause' => trim((string) ($row['cause'] ?? '')) ?: null,
                'detail' => trim((string) ($row['detail'] ?? '')) ?: null,
                'opened_at' => $opened ? OperationalTime::toStorage($opened) : null,
                'closed_at' => $closed ? OperationalTime::toStorage($closed) : null,
                'activities' => $event !== '' ? $event : null,
                'source' => ServiceTicket::SOURCE_IMPORT,
                'source_row' => $row['row'] ?? null,
            ]);
            $known[$code] = true;
            $counts['imported']++;
        }

        $counts['linked'] = $this->linkOpenIncidents();

        return $counts;
    }

    public function excelDate(string $raw): ?Carbon
    {
        $raw = trim($raw);
        if ($raw === '' || ! is_numeric($raw)) {
            return null;
        }

        $serial = (float) $raw;
        if ($serial < 20000 || $serial > 80000) {
            return null;
        }

        try {
            $seconds = (int) round($serial * 86400);
            $naive = Carbon::create(1899, 12, 30, 0, 0, 0, 'UTC')->addSeconds($seconds);
            $local = Carbon::createFromFormat('Y-m-d H:i:s', $naive->format('Y-m-d H:i:s'), OperationalTime::tz());
        } catch (\Throwable) {
            return null;
        }

        return $local instanceof Carbon ? $local : null;
    }

    private function linkOpenIncidents(): int
    {
        $linked = 0;
        $open = \App\Models\Incident::query()
            ->falls()
            ->whereNull('recovered_at')
            ->whereDoesntHave('serviceTicket')
            ->with(['school', 'networkAssignment'])
            ->orderBy('id')
            ->get();

        $service = app(ServiceTicketService::class);
        foreach ($open as $incident) {
            $before = ServiceTicket::query()->where('incident_id', $incident->id)->exists();
            $service->ensureForIncident($incident);
            if (! $before) {
                $linked++;
            }
        }

        return $linked;
    }

    /**
     * @return array<string, NetworkAssignment>
     */
    private function assignmentsByCid(): array
    {
        $map = [];
        $assignments = NetworkAssignment::query()->with('school')->whereNotNull('cid')->get();
        foreach ($assignments as $assignment) {
            $cid = preg_replace('/\D+/', '', (string) $assignment->cid) ?? '';
            if ($cid === '') {
                continue;
            }
            if (! isset($map[$cid]) || $assignment->is_active) {
                $map[$cid] = $assignment;
            }
        }

        return $map;
    }

    /**
     * @return \Generator<int, array<string, string|int>>
     */
    private function rows(string $path): \Generator
    {
        $zip = new \ZipArchive;
        if ($zip->open($path) !== true) {
            throw new InvalidArgumentException('No se pudo abrir el Excel.');
        }

        $shared = $this->sharedStrings($zip);
        $sheet = $this->sheetPath($zip, 'TICKETERA');
        $stream = $zip->getStream($sheet);
        if ($stream === false) {
            $zip->close();
            throw new InvalidArgumentException('La hoja TICKETERA no está en el Excel.');
        }

        $temp = tempnam(sys_get_temp_dir(), 'ticketera');
        if ($temp === false) {
            fclose($stream);
            $zip->close();
            throw new InvalidArgumentException('No se pudo preparar la hoja TICKETERA.');
        }
        $out = fopen($temp, 'wb');
        if ($out === false) {
            fclose($stream);
            $zip->close();
            throw new InvalidArgumentException('No se pudo preparar la hoja TICKETERA.');
        }
        stream_copy_to_stream($stream, $out);
        fclose($stream);
        fclose($out);
        $zip->close();

        $reader = new XMLReader;
        $reader->open($temp);
        $header = null;

        while ($reader->read()) {
            if ($reader->nodeType !== XMLReader::ELEMENT || $reader->localName !== 'row') {
                continue;
            }
            $rowNumber = (int) $reader->getAttribute('r');
            $xml = $reader->readOuterXml();
            $cells = $this->cells($xml, $shared);
            if ($header === null) {
                $folded = array_map(fn ($value) => $this->fold($value), $cells);
                if (in_array('TICKET', $folded, true) && in_array('CID', $folded, true) && in_array('APERTURADETICKET', $folded, true)) {
                    $header = $folded;
                }
                continue;
            }

            $get = function (string $name) use ($header, $cells): string {
                $index = array_search($name, $header, true);

                return $index === false ? '' : trim((string) ($cells[$index] ?? ''));
            };

            if ($get('TICKET') === '' && $get('CID') === '') {
                continue;
            }

            yield [
                'row' => $rowNumber,
                'ticket' => $get('TICKET'),
                'cid' => $get('CID'),
                'tss' => $get('TSS'),
                'province' => $get('PROVINCIAPRTG'),
                'district' => $get('DISTRITOPRTG'),
                'energy' => $get('TIPODEENERGIA'),
                'opened_by' => $get('NOCDEAPERTURA'),
                'minedu' => $get('RAZONMINEDU'),
                'code' => $get('CODIGO'),
                'segment' => $get('SEGMENTO'),
                'attention' => $get('ATENCION'),
                'open' => $get('APERTURADETICKET'),
                'close' => $get('CIERREDETICKET'),
                'closed_by' => $get('NOCDECIERRE'),
                'area' => $get('AREA'),
                'status' => $get('ESTADOTICKET'),
                'cause' => $get('CAUSARAIZ'),
                'detail' => $get('DETALLE'),
                'event' => $get('DETALLEDEEVENTO'),
            ];
        }

        $reader->close();
        @unlink($temp);
    }

    /**
     * @return list<string>
     */
    private function sharedStrings(\ZipArchive $zip): array
    {
        $xml = $zip->getFromName('xl/sharedStrings.xml');
        if ($xml === false) {
            return [];
        }
        $document = new \DOMDocument;
        $document->loadXML($xml);
        $xpath = new \DOMXPath($document);
        $strings = [];
        foreach ($xpath->query('//*[local-name()="si"]') ?: [] as $node) {
            $text = '';
            foreach ($xpath->query('.//*[local-name()="t"]', $node) ?: [] as $part) {
                $text .= $part->textContent;
            }
            $strings[] = $text;
        }

        return $strings;
    }

    private function sheetPath(\ZipArchive $zip, string $wanted): string
    {
        $workbook = $zip->getFromName('xl/workbook.xml');
        $rels = $zip->getFromName('xl/_rels/workbook.xml.rels');
        if ($rels === false) {
            return 'xl/worksheets/sheet1.xml';
        }
        $relDoc = new \DOMDocument;
        $relDoc->loadXML($rels);
        $targets = [];
        foreach ($relDoc->getElementsByTagName('Relationship') as $rel) {
            $targets[$rel->getAttribute('Id')] = $rel->getAttribute('Target');
        }
        if ($workbook === false) {
            return 'xl/worksheets/sheet1.xml';
        }
        $book = new \DOMDocument;
        $book->loadXML($workbook);
        foreach ($book->getElementsByTagName('sheet') as $sheet) {
            if (strcasecmp($sheet->getAttribute('name'), $wanted) !== 0) {
                continue;
            }
            $rid = $sheet->getAttribute('r:id');
            $target = $targets[$rid] ?? 'worksheets/sheet1.xml';

            return str_starts_with($target, 'xl/') ? $target : 'xl/'.ltrim($target, '/');
        }

        return 'xl/worksheets/sheet1.xml';
    }

    /**
     * @param  list<string>  $shared
     * @return array<int, string>
     */
    private function cells(string $xml, array $shared): array
    {
        $document = new \DOMDocument;
        $document->loadXML($xml);
        $xpath = new \DOMXPath($document);
        $cells = [];
        foreach ($xpath->query('//*[local-name()="c"]') ?: [] as $cell) {
            if (! $cell instanceof \DOMElement) {
                continue;
            }
            $ref = $cell->getAttribute('r');
            $index = $this->columnIndex($ref) - 1;
            $type = $cell->getAttribute('t');
            $value = '';
            $raw = $xpath->query('.//*[local-name()="v"]', $cell)?->item(0);
            if ($type === 's' && $raw) {
                $value = $shared[(int) $raw->textContent] ?? '';
            } elseif ($type === 'inlineStr') {
                $value = $cell->textContent;
            } elseif ($raw) {
                $value = $raw->textContent;
            }
            if ($index >= 0) {
                $cells[$index] = $value;
            }
        }

        return $cells;
    }

    private function columnIndex(string $ref): int
    {
        $letters = preg_replace('/\d+/', '', $ref) ?? '';
        $n = 0;
        foreach (str_split($letters) as $letter) {
            $n = $n * 26 + (ord($letter) - 64);
        }

        return $n;
    }

    private function fold(string $value): string
    {
        $value = strtr($value, [
            'Á' => 'A', 'É' => 'E', 'Í' => 'I', 'Ó' => 'O', 'Ú' => 'U', 'Ü' => 'U', 'Ñ' => 'N',
            'á' => 'A', 'é' => 'E', 'í' => 'I', 'ó' => 'O', 'ú' => 'U', 'ü' => 'U', 'ñ' => 'N',
        ]);

        return preg_replace('/[^A-Z0-9]/', '', strtoupper($value)) ?? '';
    }
}
