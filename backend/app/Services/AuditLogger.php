<?php

namespace App\Services;

use App\Models\AuditLog;
use Illuminate\Database\Eloquent\Model;

class AuditLogger
{
    public function record(Model $entity, string $action, ?array $before, ?array $after, string $source): void
    {
        AuditLog::query()->create([
            'entity_type' => $entity::class,
            'entity_id' => $entity->getKey(),
            'action' => $action,
            'before_json' => $before,
            'after_json' => $after,
            'user_id' => null,
            'source' => $source,
            'created_at' => now(),
        ]);
    }
}
