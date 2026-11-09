<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use PhpOffice\PhpSpreadsheet\IOFactory;
use RuntimeException;

/**
 * Actualiza resources/data/root_cause_legend.json desde LEYENDA DE CAUSA RAÍZ.xlsx
 * (hoja LEYENDA). La copia del frontend se sincroniza aparte o con el mismo comando.
 */
class ImportRootCauseLegendCommand extends Command
{
    protected $signature = 'legend:import-root-cause
        {path : Ruta al Excel LEYENDA DE CAUSA RAÍZ}
        {--frontend : También escribe frontend/src/features/incidents/data/rootCauseLegend.json}';

    protected $description = 'Importa la leyenda de causa raíz (grupo, código, segmento, atención, agente)';

    public function handle(): int
    {
        $path = (string) $this->argument('path');
        if (! is_file($path)) {
            $this->error('No se encontró el Excel.');

            return self::FAILURE;
        }

        $rows = $this->readRows($path);
        if ($rows === []) {
            $this->error('La hoja LEYENDA no tiene códigos.');

            return self::FAILURE;
        }

        $json = json_encode($rows, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT)."\n";
        $backend = resource_path('data/root_cause_legend.json');
        if (file_put_contents($backend, $json) === false) {
            throw new RuntimeException('No se pudo escribir '.$backend);
        }
        $this->info('Backend: '.$backend.' ('.count($rows).' códigos)');

        if ($this->option('frontend')) {
            $frontend = base_path('../frontend/src/features/incidents/data/rootCauseLegend.json');
            if (! is_dir(dirname($frontend))) {
                $this->warn('No se encontró la carpeta del frontend: '.$frontend);
            } else {
                file_put_contents($frontend, $json);
                $this->info('Frontend: '.$frontend);
            }
        }

        return self::SUCCESS;
    }

    /**
     * @return list<array{group_code: string, group_name: string, code: string, segment: string, cause: string, when: string, attention: string, agent: string}>
     */
    private function readRows(string $path): array
    {
        // Lectura liviana vía Zip/XML evita cargar todo el libro en memoria.
        $zip = new \ZipArchive;
        if ($zip->open($path) !== true) {
            throw new RuntimeException('No se pudo abrir el Excel.');
        }

        // Preferir PhpSpreadsheet solo de la hoja LEYENDA si el archivo es chico.
        $zip->close();
        $reader = IOFactory::createReader('Xlsx');
        $reader->setReadDataOnly(true);
        $reader->setLoadSheetsOnly(['LEYENDA']);
        $spreadsheet = $reader->load($path);
        $sheet = $spreadsheet->getActiveSheet();

        $header = null;
        $map = [];
        $out = [];

        foreach ($sheet->getRowIterator() as $row) {
            $cells = [];
            foreach ($row->getCellIterator() as $cell) {
                $cells[] = trim((string) $cell->getCalculatedValue());
            }
            while ($cells !== [] && end($cells) === '') {
                array_pop($cells);
            }
            if ($cells === []) {
                continue;
            }

            if ($header === null) {
                $folded = array_map(fn (string $v) => $this->fold($v), $cells);
                if (in_array('CODGRUPO', $folded, true) || in_array('CODIGO', $folded, true) && in_array('GRUPO', $folded, true)) {
                    $header = $folded;
                    foreach ($folded as $i => $name) {
                        $map[$name] = $i;
                    }
                }

                continue;
            }

            $get = function (string ...$names) use ($map, $cells): string {
                foreach ($names as $name) {
                    if (isset($map[$name])) {
                        return trim((string) ($cells[$map[$name]] ?? ''));
                    }
                }

                return '';
            };

            $groupCode = $get('CODGRUPO', 'CODIGODEGRUPO', 'GROUPCODE');
            $code = $get('CODIGO', 'CODE');
            if ($groupCode === '' || $code === '') {
                continue;
            }

            $attention = $get('ATENCION', 'ATTENTION');
            if (in_array(mb_strtoupper($attention), ['PEXT', 'PINT'], true)) {
                $attention = mb_strtoupper($attention);
            }

            $out[] = [
                'group_code' => $groupCode,
                'group_name' => $get('GRUPO', 'GROUPNAME'),
                'code' => $code,
                'segment' => $get('SEGMENTO', 'SEGMENTOCAUSARAIZ', 'SEGMENT'),
                'cause' => $get('CAUSARAIZ', 'CAUSE'),
                'when' => $get('CUANDOUSARLO', 'WHEN'),
                'attention' => $attention,
                'agent' => $get('AGENTE', 'AGENT'),
            ];
        }

        $spreadsheet->disconnectWorksheets();

        return $out;
    }

    private function fold(string $value): string
    {
        $value = mb_strtoupper($value);
        $value = strtr($value, [
            'Á' => 'A', 'É' => 'E', 'Í' => 'I', 'Ó' => 'O', 'Ú' => 'U', 'Ñ' => 'N',
        ]);

        return preg_replace('/[^A-Z0-9]+/', '', $value) ?? '';
    }
}
