<?php

namespace App\Domain\ExcelGoogle\Services;

use App\Domain\Dashboard\Services\DashboardService;
use App\Enums\MonitoringStatus;
use App\Models\Incident;
use App\Models\NetworkAssignment;
use Carbon\Carbon;
use Illuminate\Support\Facades\Http;
use RuntimeException;

/**
 * Cruza las caídas totales de PRTG con la hoja pública TICKETERA.
 * No escribe en Google Sheets.
 */
class ExcelGoogleComparacionService
{
    /** @var array<string, string> */
    private const RAZONES = [
        'CAIDADEENLACE' => 'Caída de Enlace',
        'REQUERIMIENTO' => 'Requerimiento',
        'QUEJA' => 'Queja',
    ];

    public function __construct(private readonly DashboardService $dashboard) {}

    /**
     * @return array{0: Carbon, 1: Carbon|null}
     */
    public function resolverVentana(string $modo, ?Carbon $desde, ?Carbon $hasta): array
    {
        $zone = 'America/Lima';
        $ahora = Carbon::now($zone);

        if ($modo === 'hoy') {
            return [$ahora->copy()->startOfDay(), $ahora->copy()->endOfDay()];
        }

        if ($modo === 'desde') {
            if ($desde === null) {
                throw new RuntimeException('Indica desde qué fecha y hora comparar.');
            }

            return [$desde->timezone($zone), null];
        }

        if ($modo === 'rango') {
            if ($desde === null || $hasta === null) {
                throw new RuntimeException('Indica el inicio y el fin del rango.');
            }

            $desde = $desde->timezone($zone);
            $hasta = $hasta->timezone($zone);

            if ($hasta->lt($desde)) {
                throw new RuntimeException('La hora final tiene que ser igual o posterior a la inicial.');
            }

            return [$desde, $hasta];
        }

        throw new RuntimeException('El horario tiene que ser hoy, desde una hora, o un rango.');
    }

    /**
     * @param  list<array<string, mixed>>  $caidas
     * @return list<array<string, mixed>>
     */
    public function filtrarPorHorario(array $caidas, Carbon $desde, ?Carbon $hasta): array
    {
        $zone = 'America/Lima';
        $out = [];

        foreach ($caidas as $row) {
            $marca = $this->text($row['caido_en'] ?? null);

            if ($marca === '') {
                continue;
            }

            try {
                $momento = Carbon::parse($marca)->timezone($zone);
            } catch (\Throwable) {
                continue;
            }

            if ($momento->lt($desde)) {
                continue;
            }

            if ($hasta !== null && $momento->gt($hasta)) {
                continue;
            }

            $out[] = $row;
        }

        return $out;
    }

    /**
     * @return array<string, mixed>
     */
    public function comparar(int $desdeFila, string $modo = 'hoy', ?Carbon $desde = null, ?Carbon $hasta = null): array
    {
        if ($desdeFila < 1) {
            throw new RuntimeException('La fila inicial tiene que ser 1 o mayor.');
        }

        $csv = $this->fetchCsv();
        $sheet = $this->parse($csv);
        $todas = $this->caidasPrtg();

        if ($modo === 'hoy') {
            $caidas = $todas;
            $desdeTxt = 'Siguen caídas hoy';
            $hastaTxt = null;
        } else {
            [$desde, $hasta] = $this->resolverVentana($modo, $desde, $hasta);
            $caidas = $this->filtrarPorHorario($todas, $desde, $hasta);
            $desdeTxt = $desde->timezone('America/Lima')->format('d/m/Y H:i');
            $hastaTxt = $hasta?->timezone('America/Lima')->format('d/m/Y H:i');
        }

        $result = $this->analizar($sheet, $desdeFila, $caidas, $todas);
        $result['abiertos_sin_caida'] = $this->aplicarFechasRecuperacion(
            $result['abiertos_sin_caida'],
            $this->fechasPorCid(array_column($result['abiertos_sin_caida'], 'cid')),
        );
        $result['periodo'] = $modo;
        $result['periodo_desde'] = $desdeTxt;
        $result['periodo_hasta'] = $hastaTxt;

        return $result;
    }

    /**
     * Caídas totales (Ping CAÍDO). Las intermitencias / parciales no entran.
     *
     * @return list<array<string, mixed>>
     */
    public function caidasPrtg(): array
    {
        $out = [];

        foreach ($this->dashboard->activeOutages() as $row) {
            if (! is_array($row) || ! $this->esCaidaTotal($row)) {
                continue;
            }

            $cid = $this->cidKey((string) ($row['cid'] ?? ''));

            if ($cid === '') {
                continue;
            }

            $marca = is_string($row['current_down_started_at'] ?? null)
                ? $row['current_down_started_at']
                : (is_string($row['started_at'] ?? null) ? $row['started_at'] : null);

            $out[] = [
                'cid' => $cid,
                'tss' => $row['tss'] ?? null,
                'local_educativo' => $this->text($row['local_educativo'] ?? null),
                'provincia' => $this->text($row['provincia'] ?? null),
                'distrito' => $this->text($row['distrito'] ?? null),
                'tecnologia' => $this->text($row['tecnologia'] ?? null),
                'energy_type' => $this->text($row['energy_type'] ?? null),
                'caido_en' => $marca ?? '',
                'caido_desde' => $this->formatoCaida($marca),
                'incident_id' => $row['incident_id'] ?? null,
            ];
        }

        return $out;
    }

    /**
     * @param  array<string, mixed>  $row
     */
    public function esCaidaTotal(array $row): bool
    {
        if (($row['estado_prtg'] ?? '') !== MonitoringStatus::Caido->value) {
            return false;
        }

        return empty($row['is_link_outage']);
    }

    /**
     * @return array{header_row: int, last_row: int, rows: list<array<string, mixed>>}
     */
    public function parse(string $csv): array
    {
        $table = $this->csvRows($csv);
        $headerIndex = $this->headerIndex($table);

        if ($headerIndex === null) {
            throw new RuntimeException('No encontré las columnas CID, RAZÓN (MINEDU) y ESTADO TICKET en TICKETERA.');
        }

        $index = $this->columnIndex($table[$headerIndex]);
        $rows = [];

        foreach ($table as $offset => $cells) {
            $sheetRow = $offset + 1;

            if ($sheetRow <= $headerIndex + 1) {
                continue;
            }

            $cid = $this->cidKey($this->at($cells, $index['cid']));

            if ($cid === '') {
                continue;
            }

            $razonRaw = $this->at($cells, $index['razon']);
            $estadoRaw = $this->at($cells, $index['estado']);

            $rows[] = [
                'fila' => $sheetRow,
                'cid' => $cid,
                'ticket' => $this->at($cells, $index['ticket']),
                'tss' => $this->at($cells, $index['tss']),
                'provincia' => $this->at($cells, $index['provincia']),
                'distrito' => $this->at($cells, $index['distrito']),
                'estado_ticket' => $estadoRaw,
                'estado_key' => $this->fold($estadoRaw),
                'razon' => $razonRaw,
                'razon_key' => $this->fold($razonRaw),
            ];
        }

        $last = 0;

        foreach ($table as $offset => $cells) {
            $last = $offset + 1;
        }

        return [
            'header_row' => $headerIndex + 1,
            'last_row' => $last,
            'rows' => $rows,
        ];
    }

    /**
     * @param  array{header_row: int, last_row: int, rows: list<array<string, mixed>>}  $sheet
     * @param  list<array<string, mixed>>  $caidas
     * @param  list<array<string, mixed>>  $caidasTodas
     * @return array<string, mixed>
     */
    public function analizar(array $sheet, int $desdeFila, array $caidas, array $caidasTodas = []): array
    {
        /** @var array<string, array<string, mixed>> $elegida */
        $elegida = [];
        /** @var list<array<string, mixed>> $clasificadas */
        $clasificadas = [];

        foreach ($sheet['rows'] as $row) {
            if ((int) $row['fila'] < $desdeFila || (string) $row['estado_key'] !== 'ABIERTO') {
                continue;
            }

            $cid = (string) $row['cid'];
            $tieneRazon = $this->esRazon((string) $row['razon_key']);
            $previa = $elegida[$cid] ?? null;

            if ($previa === null || $tieneRazon || ! $this->esRazon((string) $previa['razon_key'])) {
                $elegida[$cid] = $row;
            }

            if ($tieneRazon && (string) $row['estado_key'] === 'ABIERTO') {
                $clasificadas[] = $row;
            }
        }

        /** @var array<string, array<string, mixed>> $porCid */
        $porCid = [];

        foreach ($caidasTodas as $caida) {
            $cid = (string) ($caida['cid'] ?? '');

            if ($cid !== '') {
                $porCid[$cid] = $caida;
            }
        }

        $ya = [];
        $faltan = [];
        $sinCaida = [];
        $filasVistas = [];
        $enHorario = [];

        foreach ($caidas as $caida) {
            $cid = (string) ($caida['cid'] ?? '');

            if ($cid !== '') {
                $enHorario[$cid] = true;
            }
        }

        foreach ($caidas as $caida) {
            $cid = (string) ($caida['cid'] ?? '');

            if ($cid === '') {
                continue;
            }

            $item = $this->itemCaida($caida);
            $item['en_horario'] = true;

            if (isset($elegida[$cid])) {
                $this->aplicarExcel($item, $elegida[$cid]);
                $filasVistas[(int) $elegida[$cid]['fila']] = true;
                $ya[] = $item;
            } else {
                $faltan[] = $item;
            }
        }

        foreach ($clasificadas as $row) {
            $fila = (int) $row['fila'];

            if (isset($filasVistas[$fila])) {
                continue;
            }

            $cid = (string) $row['cid'];

            if (isset($enHorario[$cid])) {
                continue;
            }

            $prtg = $porCid[$cid] ?? null;
            $item = $prtg !== null ? $this->itemCaida($prtg) : $this->itemExcel($row);
            $item['nota'] = $prtg !== null
                ? 'Caído desde antes del horario'
                : 'En el Excel, sin caída PRTG ahora';
            $this->aplicarExcel($item, $row);
            $filasVistas[$fila] = true;

            if ($prtg !== null) {
                $ya[] = $item;
            } else {
                $sinCaida[] = $item;
            }
        }

        $colocados = [];

        foreach (array_merge($ya, $sinCaida) as $item) {
            $colocados[(string) $item['cid']] = true;
        }

        foreach ($elegida as $cid => $row) {
            if (isset($colocados[$cid]) || isset($porCid[$cid])) {
                continue;
            }

            $item = $this->itemExcel($row);
            $item['nota'] = 'En el Excel, sin caída PRTG ahora';
            $this->aplicarExcel($item, $row);
            $sinCaida[] = $item;
        }

        usort($ya, fn (array $a, array $b): int => ((int) $a['fila']) <=> ((int) $b['fila']));
        usort($sinCaida, fn (array $a, array $b): int => ((int) $a['fila']) <=> ((int) $b['fila']));
        usort($faltan, function (array $a, array $b): int {
            $tss = ((int) ($a['tss'] ?? 0)) <=> ((int) ($b['tss'] ?? 0));

            return $tss !== 0 ? $tss : strcmp((string) $a['cid'], (string) $b['cid']);
        });

        return [
            'desde_fila' => $desdeFila,
            'header_row' => $sheet['header_row'],
            'ultima_fila' => $sheet['last_row'],
            'filas_con_cid' => count($sheet['rows']),
            'cids_desde_fila' => count($elegida),
            'caidas_prtg' => count($caidas),
            'ya_en_excel' => $ya,
            'faltan' => $faltan,
            'abiertos_sin_caida' => $sinCaida,
            'texto_cid' => $this->columna($faltan, 'cid'),
            'texto_tss' => $this->columna($faltan, 'tss'),
            'leido_en' => Carbon::now('America/Lima')->toIso8601String(),
            'hoja' => (string) config('excel_google.sheet', 'TICKETERA'),
        ];
    }

    /**
     * Completa la caída y el restablecimiento con el último ticket recuperado del sistema.
     * PRTG manda; si no hay marca PRTG, se usa la hora que guardó el monitoreo.
     *
     * @param  list<array<string, mixed>>  $items
     * @param  array<string, array{caido_desde: string, restablecido_en: string}>  $porCid
     * @return list<array<string, mixed>>
     */
    public function aplicarFechasRecuperacion(array $items, array $porCid): array
    {
        foreach ($items as $index => $item) {
            $cid = (string) ($item['cid'] ?? '');
            $fechas = $porCid[$cid] ?? null;
            $item['restablecido_en'] = '';

            if (is_array($fechas)) {
                if ($this->text($item['caido_desde'] ?? null) === '' && $this->text($fechas['caido_desde'] ?? null) !== '') {
                    $item['caido_desde'] = $fechas['caido_desde'];
                }

                $item['restablecido_en'] = $this->text($fechas['restablecido_en'] ?? null);
            }

            $items[$index] = $item;
        }

        return $items;
    }

    /**
     * @param  list<mixed>  $cids
     * @return array<string, array{caido_desde: string, restablecido_en: string}>
     */
    private function fechasPorCid(array $cids): array
    {
        $cids = array_values(array_unique(array_filter(array_map(
            fn (mixed $cid): string => $this->cidKey((string) $cid),
            $cids,
        ))));

        if ($cids === []) {
            return [];
        }

        $asignaciones = NetworkAssignment::query()
            ->whereIn('cid', $cids)
            ->get(['id', 'cid']);

        if ($asignaciones->isEmpty()) {
            return [];
        }

        /** @var array<int, string> $cidPorAsignacion */
        $cidPorAsignacion = [];

        foreach ($asignaciones as $asignacion) {
            $cid = $this->cidKey((string) $asignacion->cid);

            if ($cid !== '') {
                $cidPorAsignacion[(int) $asignacion->id] = $cid;
            }
        }

        $ultimas = Incident::query()
            ->falls()
            ->whereIn('network_assignment_id', array_keys($cidPorAsignacion))
            ->whereNotNull('recovered_at')
            ->where(function ($query) {
                $query->whereNull('detection_source')
                    ->orWhere('detection_source', '!=', Incident::DETECTION_MANUAL_PARTIAL);
            })
            ->groupBy('network_assignment_id')
            ->selectRaw('network_assignment_id, MAX(id) as incident_id');

        $rows = Incident::query()
            ->joinSub($ultimas, 'ultimas', 'ultimas.incident_id', '=', 'incidents.id')
            ->get([
                'incidents.id',
                'incidents.network_assignment_id',
                'incidents.prtg_down_started_at',
                'incidents.started_at',
                'incidents.prtg_up_at',
                'incidents.recovered_at',
            ]);

        $map = [];
        $visto = [];

        foreach ($rows as $row) {
            $cid = $cidPorAsignacion[(int) $row->getAttribute('network_assignment_id')] ?? '';
            $incidentId = (int) $row->getAttribute('id');

            if ($cid === '' || $incidentId < ($visto[$cid] ?? 0)) {
                continue;
            }

            $visto[$cid] = $incidentId;
            $map[$cid] = $this->marcasRecuperacion(
                $this->marcaIso($row->getAttribute('prtg_down_started_at')),
                $this->marcaIso($row->getAttribute('prtg_up_at')),
                $this->marcaIso($row->getAttribute('started_at')),
                $this->marcaIso($row->getAttribute('recovered_at')),
            );
        }

        return $map;
    }

    /**
     * PRTG manda cuando la subida es posterior a la caída.
     * Si esa marca quedó invertida, se usa la hora con la que el sistema abrió y cerró el ticket.
     *
     * @return array{caido_desde: string, restablecido_en: string}
     */
    public function marcasRecuperacion(?string $prtgDown, ?string $prtgUp, ?string $started, ?string $recovered): array
    {
        if ($this->ordenValido($prtgDown, $prtgUp)) {
            $down = $prtgDown;
            $up = $prtgUp;
        } elseif ($this->ordenValido($started, $recovered)) {
            $down = $started;
            $up = $recovered;
        } else {
            $down = $prtgDown ?? $started;
            $up = $prtgUp ?? $recovered;
        }

        return [
            'caido_desde' => $this->formatoCaida($down),
            'restablecido_en' => $this->formatoCaida($up),
        ];
    }

    private function ordenValido(?string $down, ?string $up): bool
    {
        if ($down === null || $down === '' || $up === null || $up === '') {
            return false;
        }

        try {
            return Carbon::parse($up)->greaterThanOrEqualTo(Carbon::parse($down));
        } catch (\Throwable) {
            return false;
        }
    }

    private function marcaIso(mixed $value): ?string
    {
        if ($value instanceof \DateTimeInterface) {
            return $value->format(\DateTimeInterface::ATOM);
        }

        $text = $this->text($value);

        return $text !== '' ? $text : null;
    }

    /**
     * @param  array<string, mixed>  $caida
     * @return array<string, mixed>
     */
    private function itemCaida(array $caida): array
    {
        return [
            'cid' => (string) ($caida['cid'] ?? ''),
            'tss' => $caida['tss'] ?? null,
            'local_educativo' => $this->text($caida['local_educativo'] ?? null),
            'provincia' => $this->text($caida['provincia'] ?? null),
            'distrito' => $this->text($caida['distrito'] ?? null),
            'tecnologia' => $this->text($caida['tecnologia'] ?? null),
            'energy_type' => $this->text($caida['energy_type'] ?? null),
            'caido_desde' => $this->text($caida['caido_desde'] ?? null),
            'incident_id' => $caida['incident_id'] ?? null,
            'en_horario' => false,
            'nota' => null,
        ];
    }

    /**
     * @param  array<string, mixed>  $row
     * @return array<string, mixed>
     */
    private function itemExcel(array $row): array
    {
        return [
            'cid' => (string) $row['cid'],
            'tss' => $row['tss'] !== '' ? $row['tss'] : null,
            'local_educativo' => '',
            'provincia' => $this->text($row['provincia'] ?? null),
            'distrito' => $this->text($row['distrito'] ?? null),
            'tecnologia' => '',
            'energy_type' => '',
            'caido_desde' => '',
            'incident_id' => null,
            'en_horario' => false,
            'nota' => null,
        ];
    }

    /**
     * @param  array<string, mixed>  $item
     * @param  array<string, mixed>  $row
     */
    private function aplicarExcel(array &$item, array $row): void
    {
        if ($this->text($item['tss'] ?? null) === '' && $this->text($row['tss'] ?? null) !== '') {
            $item['tss'] = $row['tss'];
        }

        if ($this->text($item['provincia'] ?? null) === '') {
            $item['provincia'] = $this->text($row['provincia'] ?? null);
        }

        if ($this->text($item['distrito'] ?? null) === '') {
            $item['distrito'] = $this->text($row['distrito'] ?? null);
        }

        $item['fila'] = (int) $row['fila'];
        $item['ticket'] = (string) $row['ticket'];
        $item['estado_ticket'] = $this->text($row['estado_ticket'] ?? null) !== ''
            ? (string) $row['estado_ticket']
            : 'Sin estado';
        $item['razon_minedu'] = $this->esRazon((string) ($row['razon_key'] ?? ''))
            ? (self::RAZONES[(string) $row['razon_key']] ?? (string) $row['razon'])
            : ($this->text($row['razon'] ?? null) !== '' ? (string) $row['razon'] : null);
    }

    private function esRazon(string $key): bool
    {
        return isset(self::RAZONES[$key]);
    }

    /**
     * @param  list<array<string, mixed>>  $rows
     */
    private function columna(array $rows, string $key): string
    {
        $lines = [];

        foreach ($rows as $row) {
            $lines[] = $this->cell($row[$key] ?? '');
        }

        return implode("\n", $lines);
    }

    private function cell(mixed $value): string
    {
        $text = trim(str_replace(["\t", "\r", "\n"], ' ', (string) $value));

        return $text;
    }

    private function text(mixed $value): string
    {
        return trim((string) ($value ?? ''));
    }

    private function formatoCaida(?string $iso): string
    {
        if ($iso === null || trim($iso) === '') {
            return '';
        }

        try {
            return Carbon::parse($iso)->timezone('America/Lima')->format('d/m/Y H:i');
        } catch (\Throwable) {
            return '';
        }
    }

    private function fetchCsv(): string
    {
        $id = trim((string) config('excel_google.spreadsheet_id'));
        $gid = trim((string) config('excel_google.sheet_gid'));

        if ($id === '' || $gid === '') {
            throw new RuntimeException('Falta el enlace de la hoja TICKETERA.');
        }

        $response = $this->http()
            ->timeout(90)
            ->withHeaders(['User-Agent' => 'NOC-ExcelGoogle'])
            ->get('https://docs.google.com/spreadsheets/d/'.$id.'/export?format=csv&gid='.$gid);

        if (! $response->successful()) {
            throw new RuntimeException('Google Sheets no respondió la hoja TICKETERA.');
        }

        $body = $response->body();
        $head = strtolower(substr($body, 0, 300));

        if ($body === '' || str_contains($head, '<html') || str_contains($head, '<!doctype')) {
            throw new RuntimeException('No se pudo leer TICKETERA. El enlace tiene que seguir público.');
        }

        return $body;
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

    /**
     * @return list<list<string>>
     */
    private function csvRows(string $csv): array
    {
        $csv = preg_replace('/^\xEF\xBB\xBF/', '', $csv) ?? $csv;
        $handle = fopen('php://temp', 'r+');

        if ($handle === false) {
            throw new RuntimeException('No se pudo leer el CSV de TICKETERA.');
        }

        fwrite($handle, $csv);
        rewind($handle);

        $rows = [];

        while (($row = fgetcsv($handle, null, ',', '"', '')) !== false) {
            if ($row === [null]) {
                $rows[] = [''];
                continue;
            }

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
        foreach (array_slice($table, 0, 40) as $i => $row) {
            $folded = array_map(fn ($cell) => $this->fold($cell), $row);

            if (
                in_array('CID', $folded, true)
                && in_array('ESTADOTICKET', $folded, true)
                && (in_array('RAZONMINEDU', $folded, true) || in_array('MINEDU', $folded, true))
            ) {
                return $i;
            }
        }

        return null;
    }

    /**
     * @param  list<string>  $headers
     * @return array{cid: int, ticket: int, tss: int, estado: int, razon: int, provincia: int, distrito: int}
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

        $razon = $folded['RAZONMINEDU'] ?? $folded['MINEDU'] ?? null;

        if (! isset($folded['CID'], $folded['ESTADOTICKET']) || $razon === null) {
            throw new RuntimeException('Faltan columnas CID, RAZÓN (MINEDU) o ESTADO TICKET.');
        }

        return [
            'cid' => $folded['CID'],
            'ticket' => $folded['TICKET'] ?? -1,
            'tss' => $folded['TSS'] ?? -1,
            'estado' => $folded['ESTADOTICKET'],
            'razon' => $razon,
            'provincia' => $folded['PROVINCIAPRTG'] ?? -1,
            'distrito' => $folded['DISTRITOPRTG'] ?? -1,
        ];
    }

    /**
     * @param  list<string>  $cells
     */
    private function at(array $cells, int $index): string
    {
        if ($index < 0) {
            return '';
        }

        return trim((string) ($cells[$index] ?? ''));
    }

    private function cidKey(string $raw): string
    {
        $raw = trim($raw);

        if ($raw === '') {
            return '';
        }

        if (preg_match('/^\d+(?:\.0+)?$/', $raw) === 1) {
            return (string) (int) $raw;
        }

        $digits = preg_replace('/\D+/', '', $raw) ?? '';

        return $digits !== '' && preg_match('/\d/', $raw) === 1 && ! preg_match('/[A-Za-z]/', $raw)
            ? $digits
            : '';
    }

    private function fold(string $value): string
    {
        $value = trim($value);
        $value = strtr($value, [
            'Á' => 'A', 'É' => 'E', 'Í' => 'I', 'Ó' => 'O', 'Ú' => 'U', 'Ü' => 'U', 'Ñ' => 'N',
            'á' => 'a', 'é' => 'e', 'í' => 'i', 'ó' => 'o', 'ú' => 'u', 'ü' => 'u', 'ñ' => 'n',
        ]);
        $value = mb_strtoupper($value, 'UTF-8');

        return preg_replace('/[^A-Z0-9]/u', '', $value) ?? '';
    }
}
