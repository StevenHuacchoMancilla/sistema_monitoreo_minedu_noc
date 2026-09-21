<?php

namespace App\Enums;

enum CidStatus: string
{
    case Valid = 'VALID';
    case Empty = 'EMPTY';
    case BajaImpe = 'BAJA_IMPE';
    case Invalid = 'INVALID';
}
