<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class HealthEndpointTest extends TestCase
{
    use RefreshDatabase;

    public function test_health_endpoint_reports_database_connection(): void
    {
        $response = $this->getJson('/api/health');

        $response->assertOk()
            ->assertJsonPath('status', 'ok')
            ->assertJsonPath('database.connected', true)
            ->assertJsonMissingPath('database.password');
    }
}
