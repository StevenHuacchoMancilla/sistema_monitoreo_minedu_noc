<?php

namespace App\Services;

use App\Enums\CidStatus;
use App\Enums\ContactMatchStatus;
use App\Enums\RecordSource;
use App\Enums\SyncIssueSeverity;
use App\Enums\SyncRunStatus;
use App\Models\NetworkAssignment;
use App\Models\School;
use App\Models\SchoolContact;
use App\Models\SyncIssue;
use App\Models\SyncRun;
use App\Services\Import\ExcelWorkbookReader;
use App\Services\Import\SchoolIdentityMatcher;
use App\Support\Normalization\CidClassifier;
use App\Support\Normalization\IdentifierNormalizer;
use Throwable;

class ExcelImportService
{
    public function __construct(
        private readonly ExcelWorkbookReader $reader,
        private readonly SchoolIdentityMatcher $matcher,
        private readonly AuditLogger $auditLogger,
    ) {}

    /**
     * @return array<string, mixed>
     */
    public function import(string $resourcesPath, string $contactsPath): array
    {
        ini_set('memory_limit', '512M');
        $run = SyncRun::query()->create([
            'source' => 'EXCEL_LLEE',
            'started_at' => now(),
            'status' => SyncRunStatus::Success,
        ]);

        try {
            $summary = $this->runImport($run, $resourcesPath, $contactsPath);
        } catch (Throwable $exception) {
            $run->update([
                'status' => SyncRunStatus::Failed,
                'finished_at' => now(),
                'error_count' => $run->error_count + 1,
                'metadata' => [
                    'error' => 'import_failed',
                    'message' => $exception->getMessage(),
                ],
            ]);
            $this->issue($run, SyncIssueSeverity::Error, 'IMPORT_FAILED', null, null, null, $exception->getMessage(), []);

            throw $exception;
        }

        $status = ($run->fresh()->error_count > 0 || $run->fresh()->warning_count > 0)
            ? SyncRunStatus::SuccessWithWarnings
            : SyncRunStatus::Success;

        $reportDir = storage_path('app/private/import');
        if (! is_dir($reportDir)) {
            mkdir($reportDir, 0755, true);
        }
        $reportPath = $reportDir.'/last-matching-report.json';
        file_put_contents($reportPath, json_encode($summary['matching_report'], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
        $metadata = $summary;
        $metadata['matching_report_path'] = $reportPath;
        $metadata['reassignment_count'] = count($summary['reassignments']);
        unset($metadata['matching_report']);

        $run->update([
            'status' => $status,
            'finished_at' => now(),
            'received_count' => $summary['received_count'],
            'processed_count' => $summary['processed_count'],
            'created_count' => $summary['schools_created'],
            'updated_count' => $summary['schools_updated'],
            'ignored_count' => $summary['schools_unchanged'],
            'metadata' => $metadata,
        ]);

        return array_merge($summary, [
            'sync_run_id' => $run->id,
            'status' => $status->value,
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function runImport(SyncRun $run, string $resourcesPath, string $contactsPath): array
    {
        $resourceRows = $this->reader->loadRows($resourcesPath, 'Asignacion de Recursos CPE-V2.1');
        $contactRows = array_map(function (array $row): array {
            $row['_name_n'] = IdentifierNormalizer::normalizeName($row['local_educativo'] ?? null);
            $row['_dist_n'] = IdentifierNormalizer::normalizeName($row['distrito'] ?? null);

            return $row;
        }, $this->reader->loadRows($contactsPath, 'LLEE'));

        $contactsByCid = [];
        foreach ($contactRows as $contactRow) {
            $legacyCid = CidClassifier::numericCid(isset($contactRow['cid']) ? (string) $contactRow['cid'] : null);
            if ($legacyCid !== null) {
                $contactsByCid[$legacyCid][] = $contactRow;
            }
        }

        $summary = [
            'received_count' => count($resourceRows),
            'processed_count' => 0,
            'schools_created' => 0,
            'schools_updated' => 0,
            'schools_unchanged' => 0,
            'assignments_created' => 0,
            'assignments_updated' => 0,
            'assignments_closed' => 0,
            'cids_valid' => 0,
            'cids_empty' => 0,
            'cids_invalid' => 0,
            'cids_baja' => 0,
            'contacts_associated' => 0,
            'contacts_pending' => 0,
            'contacts_ambiguous' => 0,
            'contact_rows_imported' => 0,
            'reassignments' => [],
            'matching_report' => [],
        ];

        $existingByKey = [];
        foreach (School::query()->get() as $candidate) {
            $data = $candidate->toArray();
            $data['_name_n'] = IdentifierNormalizer::normalizeName($candidate->local_educativo);
            $data['_dist_n'] = IdentifierNormalizer::normalizeName($candidate->distrito);
            $existingByKey[] = $data;
        }

        foreach ($resourceRows as $row) {
            try {
                $this->importResourceRow($run, $row, $contactRows, $contactsByCid, $existingByKey, $summary);
                $summary['processed_count']++;
            } catch (Throwable $exception) {
                $this->issue(
                    $run,
                    SyncIssueSeverity::Error,
                    'ROW_FAILED',
                    $row['__row'] ?? null,
                    isset($row['cid']) ? (string) $row['cid'] : null,
                    isset($row['codigo_local']) ? (string) $row['codigo_local'] : null,
                    $exception->getMessage(),
                    ['nro' => $row['nro'] ?? null]
                );
            }
        }

        return $summary;
    }

    /**
     * @param  array<string, mixed>  $row
     * @param  array<int, array<string, mixed>>  $contactRows
     * @param  array<string, array<int, array<string, mixed>>>  $contactsByCid
     * @param  array<int, array<string, mixed>>  $existingSchools
     * @param  array<string, mixed>  $summary
     */
    private function importResourceRow(SyncRun $run, array $row, array $contactRows, array $contactsByCid, array &$existingSchools, array &$summary): void
    {
        $sequence = IdentifierNormalizer::sequence(isset($row['nro']) ? (string) $row['nro'] : null);
        $cidRaw = IdentifierNormalizer::text(isset($row['cid']) ? (string) $row['cid'] : null);
        $cidStatus = CidClassifier::classify($cidRaw);
        $cidNumeric = CidClassifier::numericCid($cidRaw);

        match ($cidStatus) {
            CidStatus::Valid => $summary['cids_valid']++,
            CidStatus::Empty => $summary['cids_empty']++,
            CidStatus::BajaImpe => $summary['cids_baja']++,
            CidStatus::Invalid => $summary['cids_invalid']++,
        };

        if ($cidStatus === CidStatus::Empty) {
            $this->issue($run, SyncIssueSeverity::Warning, 'CID_EMPTY', $row['__row'], $cidRaw, $row['codigo_local'] ?? null, 'CID vacío; el local se conserva sin sincronización PRTG.', []);
        } elseif ($cidStatus === CidStatus::BajaImpe) {
            $this->issue($run, SyncIssueSeverity::Warning, 'CID_BAJA_IMPE', $row['__row'], $cidRaw, $row['codigo_local'] ?? null, 'CID no numérico (baja IMPE); el local se conserva.', []);
        } elseif ($cidStatus === CidStatus::Invalid) {
            $this->issue($run, SyncIssueSeverity::Warning, 'CID_INVALID', $row['__row'], $cidRaw, $row['codigo_local'] ?? null, 'CID no numérico.', []);
        }

        $schoolPayload = [
            'current_sequence' => $sequence['current_sequence'],
            'legacy_reference' => $sequence['legacy_reference'],
            'codigo_local' => (string) ($row['codigo_local'] ?? ''),
            'codigo_modular' => $row['codigo_modular'] ?? null,
            'local_educativo' => (string) ($row['local_educativo'] ?? ''),
            'departamento' => $row['departamento'] ?? null,
            'provincia' => $row['provincia'] ?? null,
            'distrito' => $row['distrito'] ?? null,
            'centro_poblado' => $row['centro_poblado'] ?? null,
            'latitud' => isset($row['latitud']) ? IdentifierNormalizer::text((string) $row['latitud']) : null,
            'longitud' => isset($row['longitud']) ? IdentifierNormalizer::text((string) $row['longitud']) : null,
            'clasificacion' => $row['clasificacion'] ?? null,
            'nivel_iiee' => $row['nivel_iiee'] ?? null,
            'active' => true,
            'source' => RecordSource::Import,
            'source_file' => 'Recurso de Red MINEDU 2.xlsx',
            'source_row' => $row['__row'] ?? null,
            '_name_n' => IdentifierNormalizer::normalizeName($row['local_educativo'] ?? null),
            '_dist_n' => IdentifierNormalizer::normalizeName($row['distrito'] ?? null),
        ];

        if ($schoolPayload['codigo_local'] === '' && $schoolPayload['local_educativo'] === '') {
            $run->increment('ignored_count');
            $this->issue($run, SyncIssueSeverity::Warning, 'ROW_EMPTY_IDENTITY', $row['__row'], $cidRaw, null, 'Fila sin código de local ni nombre.', []);

            return;
        }

        $schoolMatch = $this->matcher->match($schoolPayload, $existingSchools);

        $school = null;
        if ($schoolMatch['status'] === ContactMatchStatus::Matched) {
            $school = School::query()->find($schoolMatch['matches'][0]['id']);
        }

        $created = false;
        if ($school === null) {
            $school = School::query()->create(collect($schoolPayload)->except(['_name_n', '_dist_n'])->all());
            $created = true;
            $summary['schools_created']++;
            $existingSchools[] = array_merge($school->toArray(), [
                '_name_n' => $schoolPayload['_name_n'],
                '_dist_n' => $schoolPayload['_dist_n'],
            ]);
            $this->auditLogger->record($school, 'created', null, $school->toArray(), RecordSource::Import->value);
        } else {
            $before = $school->toArray();
            $school->fill(collect($schoolPayload)->except(['_name_n', '_dist_n'])->all());
            if ($school->isDirty()) {
                $school->save();
                $summary['schools_updated']++;
                $this->auditLogger->record($school, 'updated', $before, $school->fresh()->toArray(), RecordSource::Import->value);
            } else {
                $summary['schools_unchanged']++;
            }
        }

        $assignmentResult = $this->upsertAssignment($school, $row, $cidRaw, $cidStatus, $cidNumeric, $created);
        $summary['assignments_created'] += $assignmentResult['created'];
        $summary['assignments_updated'] += $assignmentResult['updated'];
        $summary['assignments_closed'] += $assignmentResult['closed'];

        if ($assignmentResult['reassignment'] !== null) {
            $summary['reassignments'][] = $assignmentResult['reassignment'];
            $this->issue(
                $run,
                SyncIssueSeverity::Warning,
                'CID_REASSIGNED',
                $row['__row'],
                $cidNumeric,
                $school->codigo_local,
                'Se cerró una asignación previa y se creó una nueva por cambio de CID.',
                $assignmentResult['reassignment']
            );
        }

        $contactMatch = $this->matcher->match($schoolPayload, $contactRows);
        $school->contact_match_status = $contactMatch['status'];
        $school->contact_match_priority = $contactMatch['priority'];
        $school->contact_source_row = $contactMatch['matches'][0]['__row'] ?? null;
        $school->save();

        $importedContacts = 0;
        if ($contactMatch['status'] === ContactMatchStatus::Matched) {
            $importedContacts = $this->syncContacts($school, $contactMatch['matches'][0]);
            $summary['contacts_associated']++;
            $summary['contact_rows_imported'] += $importedContacts;
        } elseif ($contactMatch['status'] === ContactMatchStatus::Ambiguous) {
            $summary['contacts_ambiguous']++;
            $this->issue(
                $run,
                SyncIssueSeverity::Warning,
                'CONTACT_AMBIGUOUS',
                $row['__row'],
                $cidRaw,
                $school->codigo_local,
                'Múltiples candidatos LLEE; no se importaron contactos.',
                [
                    'candidates' => array_map(fn (array $candidate) => [
                        'row' => $candidate['__row'] ?? null,
                        'codigo_local' => $candidate['codigo_local'] ?? null,
                        'codigo_modular' => $candidate['codigo_modular'] ?? null,
                        'local_educativo' => $candidate['local_educativo'] ?? null,
                        'distrito' => $candidate['distrito'] ?? null,
                    ], $contactMatch['matches']),
                ]
            );
        } else {
            $summary['contacts_pending']++;
            $this->issue(
                $run,
                SyncIssueSeverity::Warning,
                'CONTACT_PENDING',
                $row['__row'],
                $cidRaw,
                $school->codigo_local,
                'Sin coincidencia segura de contactos.',
                ['local_educativo' => $school->local_educativo]
            );
        }

        if ($cidNumeric !== null) {
            foreach ($contactsByCid[$cidNumeric] ?? [] as $legacy) {
                $legacyCid = CidClassifier::numericCid(isset($legacy['cid']) ? (string) $legacy['cid'] : null);
                if ($legacyCid !== $cidNumeric) {
                    continue;
                }
                $sameIdentity = $this->matcher->match($schoolPayload, [$legacy])['status'] === ContactMatchStatus::Matched;
                if (! $sameIdentity) {
                    $summary['reassignments'][] = [
                        'cid' => $cidNumeric,
                        'current_school' => $school->local_educativo,
                        'current_codigo_local' => $school->codigo_local,
                        'legacy_school' => $legacy['local_educativo'] ?? null,
                        'legacy_codigo_local' => $legacy['codigo_local'] ?? null,
                        'legacy_row' => $legacy['__row'] ?? null,
                    ];
                }
            }
        }

        $this->maybePreserveLegacyAssignment($school, $contactMatch);

        $summary['matching_report'][] = [
            'cid_actual' => $cidNumeric ?? $cidRaw,
            'cid_status' => $cidStatus->value,
            'codigo_local' => $school->codigo_local,
            'local_educativo' => $school->local_educativo,
            'current_sequence' => $school->current_sequence,
            'legacy_reference' => $school->legacy_reference,
            'contact_match' => $contactMatch['status']->value,
            'contact_priority' => $contactMatch['priority'],
            'llee_source_row' => $school->contact_source_row,
            'contacts_imported' => $importedContacts,
        ];
    }

    /**
     * @param  array<string, mixed>  $row
     * @return array{created: int, updated: int, closed: int, reassignment: ?array<string, mixed>}
     */
    private function upsertAssignment(
        School $school,
        array $row,
        ?string $cidRaw,
        CidStatus $cidStatus,
        ?string $cidNumeric,
        bool $schoolCreated
    ): array {
        $payload = $this->assignmentPayload($row, $cidRaw, $cidStatus, $cidNumeric);
        $active = $school->activeAssignment()->first();
        $result = ['created' => 0, 'updated' => 0, 'closed' => 0, 'reassignment' => null];

        if ($cidStatus === CidStatus::Valid && $cidNumeric !== null) {
            $foreignActive = NetworkAssignment::query()
                ->where('cid', $cidNumeric)
                ->where('cid_status', CidStatus::Valid)
                ->where('is_active', true)
                ->where('school_id', '!=', $school->id)
                ->first();

            if ($foreignActive) {
                $foreignActive->update([
                    'is_active' => false,
                    'valid_to' => now(),
                ]);
                $result['closed']++;
                $result['reassignment'] = [
                    'cid' => $cidNumeric,
                    'closed_school_id' => $foreignActive->school_id,
                    'opened_school_id' => $school->id,
                ];
            }
        }

        if ($active === null) {
            $assignment = NetworkAssignment::query()->create(array_merge($payload, [
                'school_id' => $school->id,
                'is_active' => true,
                'valid_from' => now(),
                'source' => RecordSource::Import,
            ]));
            $result['created']++;
            $this->auditLogger->record($assignment, 'created', null, $assignment->toArray(), RecordSource::Import->value);

            return $result;
        }

        $cidChanged = $active->cid !== $payload['cid'] || $active->cid_status !== $cidStatus;
        if ($cidChanged && ($active->cid_status === CidStatus::Valid || $cidStatus === CidStatus::Valid)) {
            $before = $active->toArray();
            $active->update([
                'is_active' => false,
                'valid_to' => now(),
            ]);
            $result['closed']++;
            $this->auditLogger->record($active, 'closed', $before, $active->fresh()->toArray(), RecordSource::Import->value);

            $assignment = NetworkAssignment::query()->create(array_merge($payload, [
                'school_id' => $school->id,
                'is_active' => true,
                'valid_from' => now(),
                'source' => RecordSource::Import,
            ]));
            $result['created']++;
            $result['reassignment'] = $result['reassignment'] ?? [
                'cid' => $payload['cid'],
                'previous_cid' => $before['cid'],
                'school_id' => $school->id,
            ];
            $this->auditLogger->record($assignment, 'created', null, $assignment->toArray(), RecordSource::Import->value);

            return $result;
        }

        $before = $active->toArray();
        $active->fill($payload);
        if ($active->isDirty()) {
            $active->save();
            $result['updated']++;
            $this->auditLogger->record($active, 'updated', $before, $active->fresh()->toArray(), RecordSource::Import->value);
        } elseif ($schoolCreated) {
            $result['created']++;
        }

        return $result;
    }

    /**
     * @param  array<string, mixed>  $row
     * @return array<string, mixed>
     */
    private function assignmentPayload(array $row, ?string $cidRaw, CidStatus $cidStatus, ?string $cidNumeric): array
    {
        return [
            'cid' => $cidNumeric ?? $cidRaw,
            'cid_status' => $cidStatus,
            'monitoring_eligible' => $cidStatus === CidStatus::Valid,
            'prtg_device_name' => $row['prtg_device_name'] ?? null,
            'sysname_router' => $row['sysname_router'] ?? null,
            'capacidad_mbps' => isset($row['capacidad_mbps']) ? IdentifierNormalizer::identifier($row['capacidad_mbps']) : null,
            'tecnologia_acceso' => $row['tecnologia_acceso'] ?? null,
            'nodo_pop' => $row['nodo_pop'] ?? null,
            'ip_publica' => $row['ip_publica'] ?? null,
            'ip_loopback' => $row['ip_loopback'] ?? null,
            'nodo_acceso_a' => $row['nodo_acceso_a'] ?? null,
            'gateway_wan' => $row['gateway_wan'] ?? null,
            'ip_wan_principal' => $row['ip_wan_principal'] ?? null,
            'netmask_wan_principal' => $row['netmask_wan_principal'] ?? null,
            'puerto_switch_a' => $row['puerto_switch_a'] ?? null,
            'modulo_optico_a' => $row['modulo_optico_a'] ?? null,
            'nodo_acceso_b' => $row['nodo_acceso_b'] ?? null,
            'ip_wan_secundaria' => $row['ip_wan_secundaria'] ?? null,
            'netmask_wan_secundaria' => $row['netmask_wan_secundaria'] ?? null,
            'puerto_switch_b' => $row['puerto_switch_b'] ?? null,
            'modulo_optico_b' => $row['modulo_optico_b'] ?? null,
            'vlan_uplink' => $row['vlan_uplink'] ?? null,
            'vlan_internet' => isset($row['vlan_internet']) ? IdentifierNormalizer::identifier($row['vlan_internet']) : null,
            'ip_lan' => $row['ip_lan'] ?? null,
            'puerto_nodo_a' => $row['puerto_nodo_a'] ?? null,
            'puerto_nodo_b' => $row['puerto_nodo_b'] ?? null,
            'vlan_mgmt_ap' => isset($row['vlan_mgmt_ap']) ? IdentifierNormalizer::identifier($row['vlan_mgmt_ap']) : null,
            'ip_mgmt_ap' => $row['ip_mgmt_ap'] ?? null,
            'ssid_ap' => $row['ssid_ap'] ?? null,
            'estado_router_fuente' => $row['estado_router_fuente'] ?? null,
            'estado_ap_fuente' => $row['estado_ap_fuente'] ?? null,
            'enlaces' => $row['enlaces'] ?? null,
            'config_prtg' => $row['config_prtg'] ?? null,
            'serie_router' => $row['serie_router'] ?? null,
            'serie_ap' => $row['serie_ap'] ?? null,
            'serie_ont' => $row['serie_ont'] ?? null,
            'olt' => $row['olt'] ?? null,
            'puerto_olt' => $row['puerto_olt'] ?? null,
            'observaciones' => $row['observaciones'] ?? null,
            'fecha_activacion' => $row['fecha_activacion'] ?? null,
            'source_file' => 'Recurso de Red MINEDU 2.xlsx',
            'source_row' => $row['__row'] ?? null,
        ];
    }

    /**
     * @param  array<string, mixed>  $legacy
     */
    private function syncContacts(School $school, array $legacy): int
    {
        $imported = 0;
        $validation = IdentifierNormalizer::text($legacy['validacion_contacto'] ?? null);

        foreach ([1, 2, 3] as $position) {
            $name = IdentifierNormalizer::text($legacy['contacto_'.$position] ?? null);
            $role = IdentifierNormalizer::text($legacy['cargo_'.$position] ?? null);
            $phone = IdentifierNormalizer::phone($legacy['telefono_'.$position] ?? null);

            if ($name === null && $role === null && $phone === null) {
                continue;
            }

            $contact = SchoolContact::query()->updateOrCreate(
                [
                    'school_id' => $school->id,
                    'position' => $position,
                ],
                [
                    'name' => $name,
                    'role' => $role,
                    'phone' => $phone,
                    'validation_status' => $validation,
                    'source' => RecordSource::Import,
                    'source_file' => 'LLEE - BASE DE DATOS.xlsx',
                    'source_row' => $legacy['__row'] ?? null,
                ]
            );
            $imported++;
            unset($contact);
        }

        return $imported;
    }

    /**
     * @param  array{status: ContactMatchStatus, priority: int|null, matches: array<int, array<string, mixed>>}  $contactMatch
     */
    private function maybePreserveLegacyAssignment(School $school, array $contactMatch): void
    {
        if ($contactMatch['status'] !== ContactMatchStatus::Matched) {
            return;
        }

        $legacy = $contactMatch['matches'][0];
        $legacyCid = CidClassifier::numericCid(isset($legacy['cid']) ? (string) $legacy['cid'] : null);
        if ($legacyCid === null) {
            return;
        }

        $active = $school->activeAssignment()->first();
        if ($active && $active->cid === $legacyCid && $active->cid_status === CidStatus::Valid) {
            return;
        }

        $exists = NetworkAssignment::query()
            ->where('school_id', $school->id)
            ->where('cid', $legacyCid)
            ->exists();

        if ($exists) {
            return;
        }

        $takenActive = NetworkAssignment::query()
            ->where('cid', $legacyCid)
            ->where('cid_status', CidStatus::Valid)
            ->where('is_active', true)
            ->exists();

        NetworkAssignment::query()->create([
            'school_id' => $school->id,
            'cid' => $legacyCid,
            'cid_status' => CidStatus::Valid,
            'monitoring_eligible' => false,
            'is_active' => false,
            'valid_from' => null,
            'valid_to' => $takenActive ? now() : null,
            'source' => RecordSource::Import,
            'source_file' => 'LLEE - BASE DE DATOS.xlsx',
            'source_row' => $legacy['__row'] ?? null,
            'observaciones' => 'Asignación histórica conservada desde LLEE; CID posterior reasignado o dado de baja.',
        ]);
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    private function issue(
        SyncRun $run,
        SyncIssueSeverity $severity,
        string $code,
        ?int $sourceRow,
        ?string $cid,
        mixed $codigoLocal,
        string $message,
        array $payload
    ): void {
        if ($severity === SyncIssueSeverity::Warning) {
            $run->increment('warning_count');
        }
        if ($severity === SyncIssueSeverity::Error) {
            $run->increment('error_count');
        }

        SyncIssue::query()->create([
            'sync_run_id' => $run->id,
            'severity' => $severity,
            'code' => $code,
            'source_row' => $sourceRow,
            'cid' => $cid,
            'codigo_local' => $codigoLocal !== null ? (string) $codigoLocal : null,
            'message' => $message,
            'payload' => $payload,
            'created_at' => now(),
        ]);
    }
}
