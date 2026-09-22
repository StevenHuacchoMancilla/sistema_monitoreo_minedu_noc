<?php

namespace Database\Seeders;

use App\Enums\UserRole;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class AdminUserSeeder extends Seeder
{
    public function run(): void
    {
        $email = (string) env('ADMIN_EMAIL', 'admin@noc.loreto.local');
        $password = (string) env('ADMIN_PASSWORD', 'NocLoreto2026!');
        $name = (string) env('ADMIN_NAME', 'Administrador NOC');

        User::query()->updateOrCreate(
            ['email' => $email],
            [
                'name' => $name,
                'password' => Hash::make($password),
                'role' => UserRole::Admin,
                'active' => true,
                'email_verified_at' => now(),
            ]
        );

        // Operadores de ejemplo para entorno local (mismas contraseñas solo en local).
        if (app()->environment('local')) {
            foreach ([
                ['name' => 'Elias', 'email' => 'elias@noc.loreto.local', 'role' => UserRole::NocOperator],
                ['name' => 'Luis', 'email' => 'luis@noc.loreto.local', 'role' => UserRole::NocOperator],
                ['name' => 'Judith', 'email' => 'judith@noc.loreto.local', 'role' => UserRole::NocOperator],
                ['name' => 'Alvaro', 'email' => 'alvaro@noc.loreto.local', 'role' => UserRole::NocOperator],
                ['name' => 'Viewer', 'email' => 'viewer@noc.loreto.local', 'role' => UserRole::Viewer],
            ] as $row) {
                User::query()->updateOrCreate(
                    ['email' => $row['email']],
                    [
                        'name' => $row['name'],
                        'password' => Hash::make($password),
                        'role' => $row['role'],
                        'active' => true,
                        'email_verified_at' => now(),
                    ]
                );
            }
        }
    }
}
