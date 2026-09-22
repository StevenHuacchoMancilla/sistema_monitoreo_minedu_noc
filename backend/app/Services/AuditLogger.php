<?php

namespace App\Services;

use App\Enums\AuditModule;
use App\Enums\AuditSource;
use App\Models\AuditLog;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Str;

class AuditLogger
{
    /**
     * @param  array<string, mixed>|null  $before
     * @param  array<string, mixed>|null  $after
     */
    public function record(
        Model $entity,
        string $action,
        ?array $before,
        ?array $after,
        AuditModule $module,
        AuditSource|string|null $source = null,
        ?int $userId = null,
    ): void {
        $resolvedSource = $this->resolveSource($source);
        $request = request();

        AuditLog::query()->create([
            'entity_type' => $entity::class,
            'entity_id' => (int) $entity->getKey(),
            'action' => $action,
            'module' => $module->value,
            'before_json' => $before,
            'after_json' => $after,
            'user_id' => $userId ?? Auth::id(),
            'source' => $resolvedSource,
            'ip_address' => $request?->ip(),
            'user_agent' => $this->truncateUserAgent($request?->userAgent()),
            'created_at' => now(),
        ]);
    }

    /**
     * Eventos de autenticación (LOGIN / LOGOUT).
     *
     * @param  array<string, mixed>|null  $meta
     */
    public function recordAuth(User $user, string $action, ?array $meta = null): void
    {
        $this->record(
            entity: $user,
            action: $action,
            before: null,
            after: $meta,
            module: AuditModule::Auth,
            source: AuditSource::Api,
            userId: $user->id,
        );
    }

    private function resolveSource(AuditSource|string|null $source): string
    {
        if ($source instanceof AuditSource) {
            return $source->value;
        }

        if (is_string($source) && $source !== '') {
            return strtoupper($source);
        }

        if (app()->runningInConsole() && ! app()->runningUnitTests()) {
            return AuditSource::Cli->value;
        }

        return AuditSource::Api->value;
    }

    private function truncateUserAgent(?string $userAgent): ?string
    {
        if ($userAgent === null || $userAgent === '') {
            return null;
        }

        return Str::limit($userAgent, 512, '');
    }
}
