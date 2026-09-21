<?php

namespace App\Services\Import;

use App\Support\Normalization\IdentifierNormalizer;
use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Shared\Date as ExcelDate;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Worksheet\Worksheet;

class ExcelWorkbookReader
{
    public function open(string $path, ?string $sheetName = null): Spreadsheet
    {
        $reader = IOFactory::createReaderForFile($path);
        $reader->setReadDataOnly(true);
        if (method_exists($reader, 'setReadEmptyCells')) {
            $reader->setReadEmptyCells(false);
        }
        if ($sheetName && method_exists($reader, 'setLoadSheetsOnly')) {
            $reader->setLoadSheetsOnly([$sheetName]);
        }

        return $reader->load($path);
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    public function loadRows(string $path, string $sheetName, int $headerRow = 1): array
    {
        $spreadsheet = $this->open($path, $sheetName);
        $rows = $this->rowsByHeader($this->sheet($spreadsheet, $sheetName), $headerRow);
        $spreadsheet->disconnectWorksheets();
        unset($spreadsheet);

        return $rows;
    }

    public function sheet(Spreadsheet $spreadsheet, string $name): Worksheet
    {
        return $spreadsheet->getSheetByName($name)
            ?? throw new \RuntimeException("No se encontró la hoja [{$name}]");
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    public function rowsByHeader(Worksheet $sheet, int $headerRow = 1): array
    {
        $highestColumn = $sheet->getHighestDataColumn();
        $highestRow = (int) $sheet->getHighestDataRow();
        $matrix = $sheet->rangeToArray(
            'A'.$headerRow.':'.$highestColumn.$highestRow,
            null,
            true,
            false,
            false
        );

        $headerCells = array_shift($matrix) ?: [];
        $headers = [];
        foreach ($headerCells as $index => $raw) {
            $headers[$index] = $this->normalizeHeader((string) ($raw ?? ''), $index + 1);
        }

        $rows = [];
        $excelRow = $headerRow;
        foreach ($matrix as $cells) {
            $excelRow++;
            $record = ['__row' => $excelRow];
            $hasData = false;
            foreach ($headers as $index => $key) {
                if ($key === null) {
                    continue;
                }
                $value = $this->normalizeValue($cells[$index] ?? null, $key);
                $record[$key] = $value;
                if ($value !== null && $value !== '') {
                    $hasData = true;
                }
            }
            if ($hasData) {
                $rows[] = $record;
            }
        }

        return $rows;
    }

    private function normalizeHeader(string $header, int $columnIndex): ?string
    {
        $normalized = IdentifierNormalizer::normalizeName($header);

        return match (true) {
            $normalized === 'NRO' || $normalized === 'N' => 'nro',
            $normalized === 'CID' => 'cid',
            $normalized === 'CODIGO DE LOCAL' => 'codigo_local',
            $normalized === 'CODIGO MODULAR' => 'codigo_modular',
            $normalized === 'LOCAL EDUCATIVO' => 'local_educativo',
            $normalized === 'PRESENTACION NOMBRE PRTG' => 'prtg_device_name',
            $normalized === 'SYSNAME ROUTER' => 'sysname_router',
            $normalized === 'DEPARTAMENTO' => 'departamento',
            $normalized === 'PROVINCIA' => 'provincia',
            $normalized === 'DISTRITO' => 'distrito',
            $normalized === 'CENTRO POBLADO' => 'centro_poblado',
            $normalized === 'LATITUD' => 'latitud',
            $normalized === 'LONGITUD' => 'longitud',
            $normalized === 'CLASIFICACION' => 'clasificacion',
            $normalized === 'CAPACIDAD' => 'capacidad_mbps',
            $normalized === 'NIVEL IIEE' => 'nivel_iiee',
            $normalized === 'TECNOLOGIA DE ACCESO' => 'tecnologia_acceso',
            $normalized === 'NODO O POP' => 'nodo_pop',
            $normalized === 'ASIGNACION IP PUBLICA 32' => 'asignacion_ip_publica',
            $normalized === 'IP PUBLICA' => 'ip_publica',
            $normalized === 'ASIGNACION IP LOOPBACK 32' => 'ip_loopback',
            $normalized === 'NODO ACCESO A' => 'nodo_acceso_a',
            $normalized === 'GATEWAY WAN' => 'gateway_wan',
            $normalized === 'IP WAN PRINCIPAL NA1' => 'ip_wan_principal',
            $normalized === 'NETMASK' && $columnIndex === 25 => 'netmask_wan_principal',
            $normalized === 'NETMASK' && $columnIndex === 31 => 'netmask_wan_secundaria',
            $normalized === 'PTO SWITCH' && $columnIndex <= 27 => 'puerto_switch_a',
            $normalized === 'PTO SWITCH' => 'puerto_switch_b',
            $normalized === 'MODULO OPTICO' && $columnIndex <= 28 => 'modulo_optico_a',
            $normalized === 'MODULO OPTICO' => 'modulo_optico_b',
            $normalized === 'NODO ACCESO B' => 'nodo_acceso_b',
            $normalized === 'IP WAN SECUNDARIO NA2 30' => 'ip_wan_secundaria',
            $normalized === 'VLAN UPLINK MIKROTIK TO HUAWEI' => 'vlan_uplink',
            $normalized === 'VLAN INTERNET LAN' => 'vlan_internet',
            $normalized === 'IP LAN 10 100 0 0 15' => 'ip_lan',
            $normalized === 'PUERTO NODO A' => 'puerto_nodo_a',
            $normalized === 'PUERTO NODO B' => 'puerto_nodo_b',
            $normalized === 'MNG AP LAN' => 'vlan_mgmt_ap',
            $normalized === 'IP MGNT AP 30' => 'ip_mgmt_ap',
            $normalized === 'SSID AP' => 'ssid_ap',
            $normalized === 'PASSWORD AP' => null,
            $normalized === 'ESTADO ROUTER' => 'estado_router_fuente',
            $normalized === 'ESTADO AP' => 'estado_ap_fuente',
            $normalized === 'ENLACES' => 'enlaces',
            $normalized === 'CONFIG PRTG' => 'config_prtg',
            $normalized === 'SERIE ROUTER' => 'serie_router',
            $normalized === 'SERIE AP' => 'serie_ap',
            $normalized === 'SERIE ONT' => 'serie_ont',
            $normalized === 'OLT' => 'olt',
            $normalized === 'PUERTO OLT' => 'puerto_olt',
            $normalized === 'OBSERVACIONES' => 'observaciones',
            $normalized === 'FECHA DE ACTIVACION' => 'fecha_activacion',
            $normalized === 'CONTACTO 1' => 'contacto_1',
            $normalized === 'CARGO 1' => 'cargo_1',
            $normalized === 'TELEFONO 1' => 'telefono_1',
            $normalized === 'CONTACTO 2' => 'contacto_2',
            $normalized === 'CARGO 2' => 'cargo_2',
            $normalized === 'TELEFONO 2' => 'telefono_2',
            $normalized === 'CONTACTO 3' => 'contacto_3',
            $normalized === 'CARGO 3' => 'cargo_3',
            $normalized === 'TELEFONO 3' => 'telefono_3',
            $normalized === 'VALIDACION CONTACTO' => 'validacion_contacto',
            $normalized === '' && $columnIndex === 22 => 'nodo_acceso_a',
            default => null,
        };
    }

    private function normalizeValue(mixed $raw, string $key): mixed
    {
        if (is_object($raw) && method_exists($raw, 'getPlainText')) {
            $raw = $raw->getPlainText();
        }

        if ($raw === null || $raw === '') {
            return null;
        }

        if ($key === 'fecha_activacion' && is_numeric($raw)) {
            try {
                return ExcelDate::excelToDateTimeObject((float) $raw)->format('Y-m-d');
            } catch (\Throwable) {
                return IdentifierNormalizer::text((string) $raw);
            }
        }

        if (in_array($key, ['latitud', 'longitud'], true)) {
            return is_numeric($raw) ? (string) $raw : IdentifierNormalizer::text((string) $raw);
        }

        if (in_array($key, ['telefono_1', 'telefono_2', 'telefono_3'], true)) {
            return IdentifierNormalizer::phone($raw);
        }

        if (in_array($key, ['cid', 'codigo_local', 'codigo_modular', 'nro'], true)) {
            return IdentifierNormalizer::identifier($raw);
        }

        return IdentifierNormalizer::text(is_scalar($raw) ? (string) $raw : null);
    }
}
