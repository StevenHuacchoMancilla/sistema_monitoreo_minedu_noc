<?php

namespace App\Domain\Tracking\Exceptions;

use App\Models\TrackingRecord;
use RuntimeException;

class TrackingLifecycleConflict extends RuntimeException
{
    public function __construct(
        public readonly string $errorCode,
        string $message,
        public readonly TrackingRecord $tracking,
    ) {
        parent::__construct($message);
    }
}
