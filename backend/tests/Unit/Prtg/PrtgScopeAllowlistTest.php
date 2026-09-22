<?php

namespace Tests\Unit\Prtg;

use App\Domain\Monitoring\PRTG\Services\PrtgService;
use App\Domain\Monitoring\PRTG\Services\PrtgSyncService;
use App\Enums\SyncIssueSeverity;
use App\Enums\SyncRunStatus;
use App\Models\SyncRun;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PrtgScopeAllowlistTest extends TestCase
{
    use RefreshDatabase;

    private PrtgService $prtg;

    private int $rootId = 100;

    private int $temporalId = 50;

    private int $probeId = 10;

    private int $altoAmazonasId = 200;

    private int $lagunasId = 300;

    private int $loretoClusterId = 900;

    protected function setUp(): void
    {
        parent::setUp();
        config([
            'prtg.allowed_probe' => 'Sonda local',
            'prtg.allowed_root_group' => 'Operadores Global Fiber página inicial',
            'prtg.device_cid_regex' => '^CID(\\d+)',
        ]);
        $this->prtg = new PrtgService;
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function groupTree(): array
    {
        return [
            ['objid' => $this->probeId, 'group' => 'Sonda local', 'probe' => 'Sonda local', 'parentid' => 1],
            ['objid' => $this->temporalId, 'group' => 'TEMPORAL', 'probe' => 'Sonda local', 'parentid' => $this->probeId],
            ['objid' => 51, 'group' => 'Otro grupo', 'probe' => 'Sonda local', 'parentid' => $this->probeId],
            [
                'objid' => $this->rootId,
                'group' => 'Operadores Global Fiber página inicial',
                'probe' => 'Sonda local',
                'parentid' => $this->probeId,
            ],
            [
                'objid' => $this->altoAmazonasId,
                'group' => 'ALTO AMAZONAS',
                'probe' => 'Sonda local',
                'parentid' => $this->rootId,
            ],
            [
                'objid' => $this->lagunasId,
                'group' => 'LAGUNAS',
                'probe' => 'Sonda local',
                'parentid' => $this->altoAmazonasId,
            ],
            [
                'objid' => $this->loretoClusterId,
                'group' => 'REGION LORETO',
                'probe' => 'Sonda de clúster',
                'parentid' => 2,
            ],
            [
                'objid' => 901,
                'group' => 'MAYNAS',
                'probe' => 'Sonda de clúster',
                'parentid' => $this->loretoClusterId,
            ],
        ];
    }

    public function test_case1_device_under_allowed_subtree_is_included(): void
    {
        $index = $this->prtg->indexGroupsById($this->groupTree());
        $sync = $this->makeSyncService();

        $result = $sync->discoverScopedDevices(
            [[
                'objid' => 5001,
                'device' => 'CID258509_378592_SENOR_DE_LOS_MILAGROS',
                'parentid' => $this->lagunasId,
                'probe' => 'Sonda local',
            ]],
            [[
                'objid' => 8001,
                'sensor' => 'Ping',
                'type' => 'Ping',
                'parentid' => 5001,
                'status_raw' => 3,
            ]],
            $this->rootId,
            $index,
            null
        );

        $this->assertSame(1, $result['devices_in_scope']);
        $this->assertSame(1, $result['devices_with_cid']);
        $this->assertArrayHasKey('258509', $result['devices_by_cid']);
        $this->assertSame('ALTO AMAZONAS', $result['locations_by_device']['5001']['province']);
        $this->assertSame('LAGUNAS', $result['locations_by_device']['5001']['district']);
    }

    public function test_case2_temporal_branch_is_excluded(): void
    {
        $index = $this->prtg->indexGroupsById($this->groupTree());
        $sync = $this->makeSyncService();

        $result = $sync->discoverScopedDevices(
            [[
                'objid' => 5002,
                'device' => 'CID258509_TEMP',
                'parentid' => $this->temporalId,
                'probe' => 'Sonda local',
            ]],
            [],
            $this->rootId,
            $index,
            null
        );

        $this->assertSame(0, $result['devices_in_scope']);
        $this->assertSame(1, $result['excluded_outside_scope']);
        $this->assertSame([], $result['devices_by_cid']);
    }

    public function test_case3_sibling_group_under_probe_is_excluded(): void
    {
        $index = $this->prtg->indexGroupsById($this->groupTree());
        $sync = $this->makeSyncService();

        $result = $sync->discoverScopedDevices(
            [[
                'objid' => 5003,
                'device' => 'CID258509_OTHER',
                'parentid' => 51,
                'probe' => 'Sonda local',
            ]],
            [],
            $this->rootId,
            $index,
            null
        );

        $this->assertSame(0, $result['devices_with_cid']);
        $this->assertSame(1, $result['excluded_outside_scope']);
    }

    public function test_case4_old_cluster_loreto_branch_is_excluded(): void
    {
        $index = $this->prtg->indexGroupsById($this->groupTree());
        $sync = $this->makeSyncService();

        $result = $sync->discoverScopedDevices(
            [[
                'objid' => 5004,
                'device' => 'CID258509_OLD',
                'parentid' => 901,
                'probe' => 'Sonda de clúster',
            ]],
            [],
            $this->rootId,
            $index,
            null
        );

        $this->assertSame(0, $result['devices_with_cid']);
        $this->assertSame(1, $result['excluded_outside_scope']);
    }

    public function test_case5_device_without_cid_ignored(): void
    {
        $index = $this->prtg->indexGroupsById($this->groupTree());
        $sync = $this->makeSyncService();

        $result = $sync->discoverScopedDevices(
            [[
                'objid' => 5005,
                'device' => 'ROUTER_SIN_CID',
                'parentid' => $this->lagunasId,
                'probe' => 'Sonda local',
            ]],
            [],
            $this->rootId,
            $index,
            null
        );

        $this->assertSame(1, $result['devices_in_scope']);
        $this->assertSame(0, $result['devices_with_cid']);
        $this->assertSame(1, $result['ignored_no_cid']);
    }

    public function test_case6_duplicate_cid_inside_allowed_subtree(): void
    {
        $index = $this->prtg->indexGroupsById($this->groupTree());
        $sync = $this->makeSyncService();

        $result = $sync->discoverScopedDevices(
            [
                [
                    'objid' => 5006,
                    'device' => 'CID258509_A',
                    'parentid' => $this->lagunasId,
                    'probe' => 'Sonda local',
                ],
                [
                    'objid' => 5007,
                    'device' => 'CID258509_B',
                    'parentid' => $this->lagunasId,
                    'probe' => 'Sonda local',
                ],
            ],
            [],
            $this->rootId,
            $index,
            null
        );

        $this->assertSame(1, $result['duplicate_cids']);
        $this->assertCount(2, $result['devices_by_cid']['258509']);
    }

    public function test_case7_same_cid_outside_scope_is_not_duplicate(): void
    {
        $index = $this->prtg->indexGroupsById($this->groupTree());
        $sync = $this->makeSyncService();

        $result = $sync->discoverScopedDevices(
            [
                [
                    'objid' => 5008,
                    'device' => 'CID258509_OK',
                    'parentid' => $this->lagunasId,
                    'probe' => 'Sonda local',
                ],
                [
                    'objid' => 5009,
                    'device' => 'CID258509_TEMP',
                    'parentid' => $this->temporalId,
                    'probe' => 'Sonda local',
                ],
            ],
            [],
            $this->rootId,
            $index,
            null
        );

        $this->assertSame(0, $result['duplicate_cids']);
        $this->assertCount(1, $result['devices_by_cid']['258509']);
        $this->assertSame(1, $result['excluded_outside_scope']);
    }

    public function test_case8_missing_root_throws_configuration_error(): void
    {
        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('PRTG_ALLOWED_ROOT_NOT_FOUND');

        $service = new class extends PrtgService
        {
            public function fetchTable(string $content, array $query): array
            {
                return [
                    ['objid' => 1, 'group' => 'TEMPORAL', 'probe' => 'Sonda local', 'parentid' => 0],
                    ['objid' => 2, 'group' => 'REGION LORETO', 'probe' => 'Sonda de clúster', 'parentid' => 0],
                ];
            }
        };

        $service->findAllowedRootGroup();
    }

    public function test_extract_cid_uses_configured_regex(): void
    {
        $this->assertSame('258509', $this->prtg->extractCid('CID258509_FOO'));
        $this->assertNull($this->prtg->extractCid('XCID258509'));
    }

    public function test_is_descendant_helpers(): void
    {
        $index = $this->prtg->indexGroupsById($this->groupTree());

        $this->assertTrue($this->prtg->isDescendantOfAllowedRoot($this->lagunasId, $this->rootId, $index));
        $this->assertFalse($this->prtg->isDescendantOfAllowedRoot($this->temporalId, $this->rootId, $index));
        $this->assertFalse($this->prtg->isDescendantOfAllowedRoot(901, $this->rootId, $index));
    }

    private function makeSyncService(): PrtgSyncService
    {
        $incidents = $this->createMock(\App\Domain\Incidents\Services\IncidentService::class);

        return new PrtgSyncService($this->prtg, $incidents);
    }
}
