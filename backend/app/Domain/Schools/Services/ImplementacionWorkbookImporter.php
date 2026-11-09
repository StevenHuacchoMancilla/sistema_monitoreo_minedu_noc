<?php

namespace App\Domain\Schools\Services;

use App\Models\NetworkAssignment;
use App\Models\School;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;
use XMLReader;

/**
 * Actualiza colegios desde la hoja IMPLEMENTACION (TSS / código local):
 * ámbito URBANA|RURAL, tipo de energía, zona, tramo, instalación y tecnología.
 */
class ImplementacionWorkbookImporter
{
    /**
     * @return array{
     *   updated: int,
     *   unmatched: int,
     *   assignments_updated: int,
     *   tickets_updated: int,
     *   total_rows: int
     * }
     */
    public function import(string $path, bool $dryRun = false): array
    {
        if (! is_file($path)) {
            throw new InvalidArgumentException('No se encontró el Excel de implementación.');
        }

        $rows = iterator_to_array($this->rows($path), false);
        $byCodigo = School::query()
            ->get(['id', 'codigo_local', 'current_sequence'])
            ->keyBy(fn (School $s) => $this->digits((string) $s->codigo_local));
        $byTss = School::query()
            ->whereNotNull('current_sequence')
            ->get(['id', 'codigo_local', 'current_sequence'])
            ->keyBy(fn (School $s) => (string) $s->current_sequence);

        $counts = [
            'updated' => 0,
            'unmatched' => 0,
            'assignments_updated' => 0,
            'tickets_updated' => 0,
            'total_rows' => count($rows),
        ];

        if ($dryRun) {
            foreach ($rows as $row) {
                $codigo = $this->digits((string) ($row['codigo_local'] ?? ''));
                $tss = (string) ($row['tss'] ?? '');
                $ok = ($codigo !== '' && $byCodigo->has($codigo))
                    || ($tss !== '' && $byTss->has($tss));
                if ($ok) {
                    $counts['updated']++;
                } else {
                    $counts['unmatched']++;
                }
            }

            return $counts;
        }

        DB::transaction(function () use ($rows, $byCodigo, $byTss, &$counts): void {
            foreach ($rows as $row) {
                $school = null;
                $codigo = $this->digits((string) ($row['codigo_local'] ?? ''));
                if ($codigo !== '' && $byCodigo->has($codigo)) {
                    $school = School::query()->find($byCodigo[$codigo]->id);
                }
                if ($school === null) {
                    $tss = (string) ($row['tss'] ?? '');
                    if ($tss !== '' && $byTss->has($tss)) {
                        $school = School::query()->find($byTss[$tss]->id);
                    }
                }
                if ($school === null) {
                    $counts['unmatched']++;

                    continue;
                }

                $school->fill([
                    'ambito' => $row['ambito'] !== '' ? $row['ambito'] : null,
                    'energy_type' => $row['energy_type'] !== '' ? $row['energy_type'] : null,
                    'implementation_zone' => $row['implementation_zone'] !== '' ? $row['implementation_zone'] : null,
                    'implementation_span' => $row['implementation_span'] !== '' ? $row['implementation_span'] : null,
                    'installation_type' => $row['installation_type'] !== '' ? $row['installation_type'] : null,
                ]);
                $school->save();
                $counts['updated']++;

                if ($row['tecnologia'] !== '') {
                    $updated = NetworkAssignment::query()
                        ->where('school_id', $school->id)
                        ->where(function ($q) use ($row) {
                            $q->whereNull('tecnologia_acceso')
                                ->orWhere('tecnologia_acceso', '')
                                ->orWhereRaw('UPPER(TRIM(tecnologia_acceso)) <> ?', [mb_strtoupper($row['tecnologia'])]);
                        })
                        ->update(['tecnologia_acceso' => $row['tecnologia']]);
                    $counts['assignments_updated'] += (int) $updated;
                }

                if ($row['energy_type'] !== '') {
                    $tickets = DB::table('service_tickets')
                        ->where('school_id', $school->id)
                        ->where(function ($q) {
                            $q->whereNull('energy')->orWhere('energy', '');
                        })
                        ->update(['energy' => $row['energy_type']]);
                    $counts['tickets_updated'] += (int) $tickets;
                }
            }
        });

        return $counts;
    }

    /**
     * @return \Generator<int, array{
     *   tss: string,
     *   codigo_local: string,
     *   ambito: string,
     *   energy_type: string,
     *   tecnologia: string,
     *   implementation_zone: string,
     *   implementation_span: string,
     *   installation_type: string
     * }>
     */
    private function rows(string $path): \Generator
    {
        $zip = new \ZipArchive;
        if ($zip->open($path) !== true) {
            throw new InvalidArgumentException('No se pudo abrir el Excel.');
        }

        $shared = $this->sharedStrings($zip);
        $sheet = $this->sheetPath($zip, 'IMPLEMENTACION');
        $stream = $zip->getStream($sheet);
        if ($stream === false) {
            $zip->close();
            throw new InvalidArgumentException('La hoja IMPLEMENTACION no está en el Excel.');
        }

        $temp = tempnam(sys_get_temp_dir(), 'implementacion');
        if ($temp === false) {
            fclose($stream);
            $zip->close();
            throw new InvalidArgumentException('No se pudo preparar la hoja IMPLEMENTACION.');
        }
        $out = fopen($temp, 'wb');
        if ($out === false) {
            fclose($stream);
            $zip->close();
            throw new InvalidArgumentException('No se pudo preparar la hoja IMPLEMENTACION.');
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
            $xml = $reader->readOuterXml();
            $cells = $this->cells($xml, $shared);
            if ($header === null) {
                $folded = array_map(fn ($value) => $this->fold((string) $value), $cells);
                if (in_array('CODIGOLOCAL', $folded, true) && in_array('AREA', $folded, true)) {
                    $header = $folded;
                }

                continue;
            }

            $get = function (string ...$names) use ($header, $cells): string {
                foreach ($names as $name) {
                    $index = array_search($name, $header, true);
                    if ($index !== false) {
                        return trim((string) ($cells[$index] ?? ''));
                    }
                }

                return '';
            };

            $tss = preg_replace('/\.0$/', '', $get('N', 'TSS')) ?? '';
            $codigo = $this->digits($get('CODIGOLOCAL'));
            if ($tss === '' && $codigo === '') {
                continue;
            }

            yield [
                'tss' => $tss,
                'codigo_local' => $codigo,
                'ambito' => $this->normalizeAmbito($get('AREA')),
                'energy_type' => $this->normalizeEnergy($get('TIPODEENERGIA')),
                'tecnologia' => $this->normalizeTech($get('GPONP2P', 'TECNOLOGIA')),
                'implementation_zone' => $get('ZONAS'),
                'implementation_span' => $get('TRAMOSIMPLEMENTACION'),
                'installation_type' => mb_strtoupper($get('TIPODEINSTALACION')),
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
        $index = $zip->locateName('xl/sharedStrings.xml');
        if ($index === false) {
            return [];
        }
        $xml = $zip->getFromIndex($index);
        if ($xml === false) {
            return [];
        }
        $sx = simplexml_load_string($xml);
        if ($sx === false) {
            return [];
        }
        $out = [];
        foreach ($sx->si as $si) {
            if (isset($si->t)) {
                $out[] = (string) $si->t;
            } else {
                $parts = [];
                foreach ($si->r as $run) {
                    $parts[] = (string) $run->t;
                }
                $out[] = implode('', $parts);
            }
        }

        return $out;
    }

    private function sheetPath(\ZipArchive $zip, string $wanted): string
    {
        $wantedFold = $this->fold($wanted);
        $workbook = $zip->getFromName('xl/workbook.xml');
        $rels = $zip->getFromName('xl/_rels/workbook.xml.rels');
        if ($workbook === false || $rels === false) {
            throw new InvalidArgumentException('Excel inválido.');
        }
        $wb = simplexml_load_string($workbook);
        $rx = simplexml_load_string($rels);
        if ($wb === false || $rx === false) {
            throw new InvalidArgumentException('Excel inválido.');
        }
        $wb->registerXPathNamespace('m', 'http://schemas.openxmlformats.org/spreadsheetml/2006/main');
        $wb->registerXPathNamespace('r', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships');
        $map = [];
        foreach ($rx->Relationship as $rel) {
            $map[(string) $rel['Id']] = (string) $rel['Target'];
        }
        foreach ($wb->sheets->sheet as $sheet) {
            $name = (string) $sheet['name'];
            if ($this->fold($name) !== $wantedFold) {
                continue;
            }
            $rid = (string) $sheet->attributes('http://schemas.openxmlformats.org/officeDocument/2006/relationships')['id'];
            $target = $map[$rid] ?? null;
            if ($target === null) {
                break;
            }
            $target = ltrim($target, '/');
            if (! str_starts_with($target, 'xl/')) {
                $target = 'xl/'.$target;
            }

            return $target;
        }

        throw new InvalidArgumentException('No está la hoja IMPLEMENTACION en el Excel.');
    }

    /**
     * @param  list<string>  $shared
     * @return array<int, string>
     */
    private function cells(string $rowXml, array $shared): array
    {
        $xml = simplexml_load_string($rowXml);
        if ($xml === false) {
            return [];
        }
        $xml->registerXPathNamespace('m', 'http://schemas.openxmlformats.org/spreadsheetml/2006/main');
        $cells = [];
        foreach ($xml->c as $c) {
            $ref = (string) $c['r'];
            if (! preg_match('/^([A-Z]+)/', $ref, $m)) {
                continue;
            }
            $col = $this->columnIndex($m[1]);
            $type = (string) $c['t'];
            $value = '';
            if ($type === 's') {
                $idx = (int) ($c->v ?? -1);
                $value = $shared[$idx] ?? '';
            } elseif ($type === 'inlineStr') {
                $value = (string) ($c->is->t ?? '');
            } else {
                $value = (string) ($c->v ?? '');
            }
            $cells[$col] = $value;
        }
        if ($cells === []) {
            return [];
        }
        $max = max(array_keys($cells));
        $out = [];
        for ($i = 0; $i <= $max; $i++) {
            $out[$i] = $cells[$i] ?? '';
        }

        return $out;
    }

    private function columnIndex(string $letters): int
    {
        $n = 0;
        $len = strlen($letters);
        for ($i = 0; $i < $len; $i++) {
            $n = $n * 26 + (ord($letters[$i]) - 64);
        }

        return $n - 1;
    }

    private function normalizeAmbito(string $value): string
    {
        $v = mb_strtoupper(trim($value));
        if (str_contains($v, 'RURAL')) {
            return 'RURAL';
        }
        if (str_contains($v, 'URBAN')) {
            return 'URBANA';
        }

        return $v;
    }

    private function normalizeEnergy(string $value): string
    {
        $v = trim($value);
        if ($v === '') {
            return '';
        }
        $upper = mb_strtoupper($v);
        if (str_contains($upper, 'PANEL')) {
            return 'PANEL SOLAR';
        }
        if (str_contains($upper, 'RED')) {
            return 'RED pública';
        }

        return $v;
    }

    private function normalizeTech(string $value): string
    {
        $v = trim($value);
        if ($v === '') {
            return '';
        }
        $upper = mb_strtoupper($v);
        if (str_contains($upper, 'GPON') && str_contains($upper, 'PULPITO')) {
            return 'GPON PULPITO';
        }
        if (str_contains($upper, 'GPON')) {
            return 'GPON';
        }
        if (str_contains($upper, 'P2P')) {
            return 'P2P';
        }

        return $v;
    }

    private function fold(string $value): string
    {
        $value = mb_strtoupper($value);
        $value = strtr($value, [
            'Á' => 'A', 'É' => 'E', 'Í' => 'I', 'Ó' => 'O', 'Ú' => 'U', 'Ñ' => 'N',
        ]);

        return preg_replace('/[^A-Z0-9]+/', '', $value) ?? '';
    }

    private function digits(string $value): string
    {
        return preg_replace('/\D+/', '', $value) ?? '';
    }
}
