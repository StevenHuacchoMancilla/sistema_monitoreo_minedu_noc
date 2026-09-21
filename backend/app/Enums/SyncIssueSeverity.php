<?php

namespace App\Enums;

enum SyncIssueSeverity: string
{
    case Info = 'INFO';
    case Warning = 'WARNING';
    case Error = 'ERROR';
}
