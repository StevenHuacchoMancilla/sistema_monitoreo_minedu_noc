<?php

namespace App\Enums;

enum SyncRunStatus: string
{
    case Success = 'SUCCESS';
    case SuccessWithWarnings = 'SUCCESS_WITH_WARNINGS';
    case Failed = 'FAILED';
}
