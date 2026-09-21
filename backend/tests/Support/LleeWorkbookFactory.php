<?php

namespace Tests\Support;

use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;

class LleeWorkbookFactory
{
    /**
     * @param  array<int, array<string, mixed>>  $rows
     */
    public static function resources(string $path, array $rows): void
    {
        $headers = [
            'Nro', 'CID', 'CODIGO DE LOCAL', 'CODIGO MODULAR', 'LOCAL EDUCATIVO',
            'PRESENTACION NOMBRE PRTG', 'SYSNAME/ROUTER', 'DEPARTAMENTO', 'PROVINCIA', 'DISTRITO',
            'CENTRO POBLADO', 'LATITUD', 'LONGITUD', 'CLASIFICACION', 'CAPACIDAD', 'NIVEL IIEE',
            'TECNOLOGIA DE ACCESO', 'NODO o POP', 'ASIGNACION IP PUBLICA /32', 'IP Publica',
            'ASIGNACION IP LOOPBACK /32', 'NODO ACCESO A', 'GATEWAY WAN', 'IP WAN PRINCIPAL (NA1)',
            'NETMASK', 'PTO-SWITCH', 'MODULO OPTICO', '', 'NODO ACCESO B', 'IP WAN SECUNDARIO (NA2) /30',
            'NETMASK', 'PTO-SWITCH', 'Vlan uplink Mikrotik to Huawei', 'MODULO OPTICO', '',
            'VLAN INTERNET LAN', 'IP LAN 10.100.0.0/15', 'PUERTO NODO A', 'PUERTO NODO B',
            'MNG AP LAN', 'IP MGNT AP /30', 'SSID AP', 'PASSWORD AP', 'ESTADO ROUTER', 'ESTADO AP',
            'ENLACES', 'CONFIG. PRTG', 'SERIE ROUTER', 'SERIE AP', 'SERIE ONT', 'OLT', 'PUERTO OLT',
            'OBSERVACIONES', 'FECHA DE ACTIVACIÓN',
        ];

        $spreadsheet = new Spreadsheet;
        $sheet = $spreadsheet->getActiveSheet();
        $sheet->setTitle('Asignacion de Recursos CPE-V2.1');
        foreach ($headers as $index => $header) {
            $sheet->setCellValue([$index + 1, 1], $header);
        }

        $rowNumber = 2;
        foreach ($rows as $row) {
            $values = [
                $row['nro'] ?? null,
                $row['cid'] ?? null,
                $row['codigo_local'] ?? null,
                $row['codigo_modular'] ?? null,
                $row['local_educativo'] ?? null,
                $row['prtg_device_name'] ?? null,
                $row['sysname_router'] ?? null,
                $row['departamento'] ?? 'LORETO',
                $row['provincia'] ?? 'MAYNAS',
                $row['distrito'] ?? null,
                $row['centro_poblado'] ?? null,
                $row['latitud'] ?? null,
                $row['longitud'] ?? null,
                $row['clasificacion'] ?? 'TIPO I',
                $row['capacidad'] ?? '100',
                null,
                $row['tecnologia'] ?? 'P2P',
                $row['nodo_pop'] ?? 'POP-IQUITOS',
                null,
                $row['ip_publica'] ?? '148.222.116.10',
                $row['ip_loopback'] ?? '10.139.50.10/32',
                $row['nodo_acceso_a'] ?? 'Nodo A',
                'N/A',
                $row['ip_wan_principal'] ?? '10.50.33.0',
                '255.255.255.252',
                '1/0/1',
                'SFP',
                null,
                'N/A',
                'N/A',
                'N/A',
                'N/A',
                null,
                'N/A',
                null,
                '10',
                $row['ip_lan'] ?? '10.100.1.0/24',
                null,
                null,
                '20',
                '10.100.0.0',
                'SSID',
                'secret-should-not-persist',
                'Activo',
                'Activo',
                'Solo RA',
                'SI',
                null, null, null, null, null, 'Sin observaciones', null,
            ];
            foreach ($values as $index => $value) {
                $sheet->setCellValue([$index + 1, $rowNumber], $value);
            }
            $rowNumber++;
        }

        $writer = new Xlsx($spreadsheet);
        $writer->save($path);
        $spreadsheet->disconnectWorksheets();
    }

    /**
     * @param  array<int, array<string, mixed>>  $rows
     */
    public static function contacts(string $path, array $rows): void
    {
        $headers = [
            'N°', 'CID', 'CODIGO DE LOCAL', 'CODIGO MODULAR', 'LOCAL EDUCATIVO',
            'PRESENTACION NOMBRE PRTG', 'SYSNAME/ROUTER', 'DEPARTAMENTO', 'PROVINCIA', 'DISTRITO',
            'CENTRO POBLADO', 'LATITUD', 'LONGITUD', 'CLASIFICACION', 'CAPACIDAD', 'NIVEL IIEE',
            'TECNOLOGIA DE ACCESO', 'NODO o POP', 'ASIGNACION IP PUBLICA /32', 'ASIGNACION IP LOOPBACK /32',
            'NODO ACCESO A', 'GATEWAY WAN', 'IP WAN PRINCIPAL (NA1)', 'NETMASK', 'PTO-SWITCH', 'MODULO OPTICO',
            '', 'NODO ACCESO B', 'IP WAN SECUNDARIO (NA2) /30', 'NETMASK', 'PTO-SWITCH', 'MODULO OPTICO', '',
            'VLAN INTERNET LAN', 'IP LAN 10.100.0.0/15', 'PUERTO NODO A', 'PUERTO NODO B', 'MNG AP LAN',
            'IP MGNT AP /30', 'SSID AP', 'PASSWORD AP', 'ESTADO ROUTER', 'ESTADO AP', 'ENLACES', 'CONFIG. PRTG',
            'SERIE ROUTER', 'SERIE AP', 'SERIE ONT', 'OLT', 'PUERTO OLT', 'OBSERVACIONES', 'FECHA DE ACTIVACIÓN',
            'Contacto 1', 'Cargo 1', 'Teléfono 1', 'Contacto 2', 'Cargo 2', 'Teléfono 2',
            'Contacto 3', 'Cargo 3', 'Teléfono 3', 'Validación contacto',
        ];

        $spreadsheet = new Spreadsheet;
        $sheet = $spreadsheet->getActiveSheet();
        $sheet->setTitle('LLEE');
        foreach ($headers as $index => $header) {
            $sheet->setCellValue([$index + 1, 1], $header);
        }

        $rowNumber = 2;
        foreach ($rows as $row) {
            $sheet->setCellValue([1, $rowNumber], $row['nro'] ?? null);
            $sheet->setCellValue([2, $rowNumber], $row['cid'] ?? null);
            $sheet->setCellValue([3, $rowNumber], $row['codigo_local'] ?? null);
            $sheet->setCellValue([4, $rowNumber], $row['codigo_modular'] ?? null);
            $sheet->setCellValue([5, $rowNumber], $row['local_educativo'] ?? null);
            $sheet->setCellValue([8, $rowNumber], $row['departamento'] ?? 'LORETO');
            $sheet->setCellValue([9, $rowNumber], $row['provincia'] ?? 'MAYNAS');
            $sheet->setCellValue([10, $rowNumber], $row['distrito'] ?? null);
            $sheet->setCellValue([53, $rowNumber], $row['contacto_1'] ?? null);
            $sheet->setCellValue([54, $rowNumber], $row['cargo_1'] ?? null);
            $sheet->setCellValueExplicit(
                [55, $rowNumber],
                $row['telefono_1'] ?? null,
                \PhpOffice\PhpSpreadsheet\Cell\DataType::TYPE_STRING
            );
            if (isset($row['telefono_1_numeric'])) {
                $sheet->setCellValue([55, $rowNumber], $row['telefono_1_numeric']);
            }
            $sheet->setCellValue([56, $rowNumber], $row['contacto_2'] ?? null);
            $sheet->setCellValue([57, $rowNumber], $row['cargo_2'] ?? null);
            $sheet->setCellValue([58, $rowNumber], $row['telefono_2'] ?? null);
            $sheet->setCellValue([62, $rowNumber], $row['validacion'] ?? 'OK');
            $rowNumber++;
        }

        $writer = new Xlsx($spreadsheet);
        $writer->save($path);
        $spreadsheet->disconnectWorksheets();
    }
}
