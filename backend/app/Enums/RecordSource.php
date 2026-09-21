<?php

namespace App\Enums;

enum RecordSource: string
{
    case Import = 'IMPORT';
    case Manual = 'MANUAL';
}
