<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class PostgresConnectionTest extends TestCase
{
    public function test_laravel_can_connect_to_postgresql(): void
    {
        config([
            'database.connections.pgsql.url' => null,
            'database.connections.pgsql.host' => env('DB_HOST', '127.0.0.1'),
            'database.connections.pgsql.port' => env('DB_PORT', '5432'),
            'database.connections.pgsql.database' => 'monitoreo_llee',
            'database.connections.pgsql.username' => env('DB_USERNAME', 'steven'),
            'database.connections.pgsql.password' => env('DB_PASSWORD', ''),
        ]);

        $result = DB::connection('pgsql')->select('select current_database() as name');

        $this->assertSame('monitoreo_llee', $result[0]->name);
    }
}
