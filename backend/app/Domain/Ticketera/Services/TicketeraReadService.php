<?php

namespace App\Domain\Ticketera\Services;

use Carbon\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use RuntimeException;

/**
 * Lee la hoja pública TICKETERA. No escribe en Google Sheets
 * ni toca incidencias, PRTG ni Supabase.
 */
class TicketeraReadService
{
    public function forget(): void
    {
        Cache::forget($this->cacheKey());
    }

    /**
     * @return array<string, mixed>
     */
    public function dashboard(): array
    {
        $seconds = max(10, (int) config('ticketera.cache_seconds', 20));

        return Cache::remember($this->cacheKey(), $seconds, function () {
            return $this->read();
        });
    }

    /**
     * @return array<string, mixed>
     */
    private function read(): array
    {
        $id = trim((string) config('ticketera.spreadsheet_id'));
        $sheet = trim((string) config('ticketera.sheet', 'TICKETERA'));
        $zone = (string) config('ticketera.timezone', 'America/Lima');

        if ($id === '') {
            throw new RuntimeException('Falta el ID de la hoja de Ticketera.');
        }

        $table = $this->csvRows($this->fetchCsv($id, $sheet));
        $headerIndex = $this->headerIndex($table);

        if ($headerIndex === null) {
            throw new RuntimeException('No se encontraron los encabezados de TICKETERA.');
        }

        $index = $this->columnIndex($table[$headerIndex]);
        $names = $this->schoolNames($id);
        $now = Carbon::now($zone);
        $nowMs = (int) round(microtime(true) * 1000);

        $rows = [];
        $audit = [
            'read_rows' => 0,
            'affected_rows' => 0,
            'missing_minedu' => 0,
            'invalid_open' => 0,
            'invalid_close' => 0,
            'inverted_dates' => 0,
            'duplicate_tickets' => 0,
        ];

        foreach (array_slice($table, $headerIndex + 1) as $offset => $cells) {
            $get = function (string $field) use ($cells, $index): string {
                $column = $index[$field] ?? null;

                return $column === null ? '' : trim((string) ($cells[$column] ?? ''));
            };

            $openText = $get('open');
            $cid = $get('cid');

            if ($cid === '' && $openText === '') {
                continue;
            }

            $problems = [];
            $closeText = $get('close');
            $open = $this->timestamp($openText, $zone);
            $close = $closeText === '' ? null : $this->timestamp($closeText, $zone);
            $minedu = $get('minedu');
            $code = strtoupper($get('codigo'));

            if ($open === null) {
                $audit['invalid_open']++;
                $problems[] = 'Apertura vacía o inválida';
            }

            if ($closeText !== '' && $close === null) {
                $audit['invalid_close']++;
                $problems[] = 'Cierre inválido';
            }

            if ($open !== null && $close !== null && $close < $open) {
                $audit['inverted_dates']++;
                $problems[] = 'Cierre anterior a la apertura';
            }

            if ($minedu === '' || $this->fold($minedu) === 'NINGUNO' || $this->isCellError($minedu)) {
                $audit['missing_minedu']++;
                $problems[] = 'MINEDU sin clasificación';
            }

            $valid = $open !== null
                && ($closeText === '' || $close !== null)
                && ($close === null || $close >= $open);

            $status = ! $valid ? 'REVISAR' : ($close !== null ? 'CERRADO' : 'ABIERTO');
            $tss = $get('tss');

            $rows[] = [
                'row' => $headerIndex + 2 + $offset,
                'ticket' => $get('ticket'),
                'cid' => $cid,
                'tss' => $tss,
                'nombre' => $names[$tss] ?? '',
                'provincia' => $get('provincia'),
                'distrito' => $get('distrito'),
                'energia' => $get('energia'),
                'codigo' => $code,
                'grupo' => $get('grupo'),
                'atencion' => $get('atencion'),
                'area' => $get('area'),
                'minedu' => $minedu,
                'causa' => $get('causa'),
                'detalle' => $get('detalle'),
                'open' => $open === null ? null : Carbon::createFromTimestampMs($open, $zone)->utc()->toIso8601String(),
                'close' => $close === null ? null : Carbon::createFromTimestampMs($close, $zone)->utc()->toIso8601String(),
                'open_text' => $openText,
                'close_text' => $closeText,
                'status' => $status,
                'source_status' => $get('source_status'),
                'sla_seconds' => $this->slaSeconds($get('sla')),
                'problems' => $problems,
            ];
        }

        $byTicket = [];

        foreach ($rows as $record) {
            $key = $this->fold($record['ticket']);

            if ($key === '' || $this->isCellError($record['ticket'])) {
                continue;
            }

            $byTicket[$key][] = $record['row'];
        }

        foreach ($rows as &$record) {
            $key = $this->fold($record['ticket']);
            $lines = $byTicket[$key] ?? [];

            if (count($lines) > 1) {
                $record['problems'][] = 'Ticket repetido en filas '.implode(', ', $lines);
            }

            if ($record['problems'] !== []) {
                $audit['affected_rows']++;
            }
        }
        unset($record);

        foreach ($byTicket as $lines) {
            if (count($lines) > 1) {
                $audit['duplicate_tickets']++;
            }
        }

        $audit['read_rows'] = count($rows);

        $warnings = [];

        foreach ($rows as $record) {
            foreach ($record['problems'] as $problem) {
                $warnings[] = [
                    'row' => $record['row'],
                    'ticket' => $record['ticket'],
                    'message' => $problem,
                ];
            }
        }

        return [
            'now' => Carbon::createFromTimestampMs($nowMs, $zone)->utc()->toIso8601String(),
            'today' => $now->toDateString(),
            'refresh_seconds' => 30,
            'source' => [
                'spreadsheet_id' => $id,
                'sheet' => $sheet,
                'row_count' => count($rows),
                'fetched_at' => Carbon::now($zone)->utc()->toIso8601String(),
            ],
            'audit' => $audit,
            'warnings' => array_slice($warnings, 0, 400),
            'warning_count' => count($warnings),
            'rows' => $rows,
        ];
    }

    private function http(): \Illuminate\Http\Client\PendingRequest
    {
        $pending = Http::accept('text/csv');
        $bundle = (string) config('ticketera.ca_bundle');

        if ($bundle !== '' && is_file($bundle)) {
            $pending = $pending->withOptions(['verify' => $bundle]);
        }

        return $pending;
    }

    private function cacheKey(): string
    {
        return 'ticketera.dashboard.'.(string) config('ticketera.spreadsheet_id');
    }

    private function fetchCsv(string $id, string $sheet): string
    {
        $url = 'https://docs.google.com/spreadsheets/d/'.$id.'/gviz/tq?tqx=out:csv&sheet='.rawurlencode($sheet);

        $response = $this->http()
            ->timeout(40)
            ->accept('text/csv')
            ->withHeaders(['User-Agent' => 'NOC-Ticketera'])
            ->get($url);

        if (! $response->successful()) {
            throw new RuntimeException('Google Sheets no respondió la hoja '.$sheet.' ('.$response->status().').');
        }

        $body = $response->body();

        if ($body === '' || str_contains(strtolower(substr($body, 0, 200)), '<html')) {
            throw new RuntimeException('La hoja '.$sheet.' no está publicada para lectura.');
        }

        return $body;
    }

    /**
     * @return array<string, string>
     */
    private function schoolNames(string $id): array
    {
        $sheet = trim((string) config('ticketera.names_sheet', 'IMPLEMENTACION'));

        if ($sheet === '') {
            return [];
        }

        try {
            $url = 'https://docs.google.com/spreadsheets/d/'.$id.'/gviz/tq?tqx=out:csv&sheet='.rawurlencode($sheet);
            $response = $this->http()->timeout(20)->accept('text/csv')->get($url);

            if (! $response->successful()) {
                return [];
            }

            $body = $response->body();

            if ($body === '' || str_contains(strtolower(substr($body, 0, 200)), '<html')) {
                return [];
            }

            $table = $this->csvRows($body);
            $headerIndex = null;

            foreach (array_slice($table, 0, 30) as $i => $row) {
                $folded = array_map(fn ($cell) => $this->fold((string) $cell), $row);

                if (in_array('NOMBRELOCALEDUCATIVO', $folded, true)) {
                    $headerIndex = $i;
                    break;
                }
            }

            if ($headerIndex === null) {
                return [];
            }

            $folded = array_map(fn ($cell) => $this->fold((string) $cell), $table[$headerIndex]);
            $idColumn = array_search('N', $folded, true);
            $nameColumn = array_search('NOMBRELOCALEDUCATIVO', $folded, true);

            if ($idColumn === false || $nameColumn === false) {
                return [];
            }

            $names = [];

            foreach (array_slice($table, $headerIndex + 1) as $row) {
                $key = trim((string) ($row[$idColumn] ?? ''));
                $name = trim((string) ($row[$nameColumn] ?? ''));

                if ($key !== '' && $name !== '') {
                    $names[$key] = $name;
                }
            }

            return $names;
        } catch (\Throwable) {
            return [];
        }
    }

    /**
     * @return list<list<string>>
     */
    private function csvRows(string $csv): array
    {
        $csv = preg_replace('/^\xEF\xBB\xBF/', '', $csv) ?? $csv;
        $handle = fopen('php://temp', 'r+');

        if ($handle === false) {
            throw new RuntimeException('No se pudo leer el CSV de Ticketera.');
        }

        fwrite($handle, $csv);
        rewind($handle);

        $rows = [];

        while (($row = fgetcsv($handle, null, ',', '"', '')) !== false) {
            $rows[] = array_map(fn ($cell) => (string) $cell, $row);
        }

        fclose($handle);

        return $rows;
    }

    /**
     * @param  list<list<string>>  $table
     */
    private function headerIndex(array $table): ?int
    {
        foreach (array_slice($table, 0, 30) as $i => $row) {
            $folded = array_map(fn ($cell) => $this->fold($cell), $row);

            if (
                in_array('TICKET', $folded, true)
                && in_array('CID', $folded, true)
                && in_array('APERTURADETICKET', $folded, true)
            ) {
                return $i;
            }
        }

        return null;
    }

    /**
     * @param  list<string>  $headers
     * @return array<string, int>
     */
    private function columnIndex(array $headers): array
    {
        $folded = [];

        foreach ($headers as $position => $header) {
            $key = $this->fold($header);

            if ($key !== '' && ! isset($folded[$key])) {
                $folded[$key] = $position;
            }
        }

        $wanted = [
            'ticket' => 'TICKET',
            'cid' => 'CID',
            'tss' => 'TSS',
            'provincia' => 'PROVINCIAPRTG',
            'distrito' => 'DISTRITOPRTG',
            'energia' => 'TIPODEENERGIA',
            'codigo' => 'CODIGO',
            'grupo' => 'ESTADO',
            'atencion' => 'ATENCION',
            'open' => 'APERTURADETICKET',
            'close' => 'CIERREDETICKET',
            'sla' => 'DURACIONSLA',
            'area' => 'AREA',
            'source_status' => 'ESTADOTICKET',
            'causa' => 'CAUSAGLOBAL',
            'detalle' => 'DETALLE',
            'minedu' => 'MINEDU',
        ];

        $index = [];

        foreach ($wanted as $field => $key) {
            if (isset($folded[$key])) {
                $index[$field] = $folded[$key];
            }
        }

        foreach (['ticket', 'cid', 'open'] as $required) {
            if (! isset($index[$required])) {
                throw new RuntimeException('Falta la columna '.$required.' en TICKETERA.');
            }
        }

        return $index;
    }

    private function timestamp(string $text, string $zone): ?int
    {
        $text = trim($text);

        if ($text === '' || $this->isCellError($text)) {
            return null;
        }

        foreach (['d/m/Y H:i:s', 'd/m/Y H:i', 'd/m/Y'] as $format) {
            $parsed = Carbon::createFromFormat($format, $text, $zone);
            $errors = Carbon::getLastErrors();

            if (! $parsed instanceof Carbon) {
                continue;
            }

            if (is_array($errors) && (($errors['warning_count'] ?? 0) > 0 || ($errors['error_count'] ?? 0) > 0)) {
                continue;
            }

            return (int) round($parsed->getTimestamp() * 1000);
        }

        return null;
    }

    private function slaSeconds(string $text): ?int
    {
        if (! preg_match('/^(\d+):(\d{2}):(\d{2})$/', trim($text), $match)) {
            return null;
        }

        if ((int) $match[2] >= 60 || (int) $match[3] >= 60) {
            return null;
        }

        return ((int) $match[1] * 3600) + ((int) $match[2] * 60) + (int) $match[3];
    }

    private function isCellError(string $value): bool
    {
        return (bool) preg_match('/^#(?:VALUE!|REF!|N\/A|DIV\/0!|NAME\?|NUM!|ERROR!|SPILL!|CALC!|NULL!)/i', trim($value));
    }

    private function fold(string $value): string
    {
        $value = trim($value);
        $value = strtr($value, [
            'Á' => 'A', 'É' => 'E', 'Í' => 'I', 'Ó' => 'O', 'Ú' => 'U', 'Ü' => 'U', 'Ñ' => 'N',
            'á' => 'a', 'é' => 'e', 'í' => 'i', 'ó' => 'o', 'ú' => 'u', 'ü' => 'u', 'ñ' => 'n',
        ]);

        if (class_exists(\Normalizer::class)) {
            $normalized = \Normalizer::normalize($value, \Normalizer::FORM_D);

            if (is_string($normalized)) {
                $value = preg_replace('/\p{Mn}/u', '', $normalized) ?? $value;
            }
        }

        $value = mb_strtoupper($value, 'UTF-8');

        return preg_replace('/[^A-Z0-9]/u', '', $value) ?? '';
    }
}
