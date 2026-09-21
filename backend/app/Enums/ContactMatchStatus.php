<?php

namespace App\Enums;

enum ContactMatchStatus: string
{
    case Matched = 'CONTACT_MATCHED';
    case Pending = 'CONTACT_PENDING';
    case Ambiguous = 'CONTACT_AMBIGUOUS';
}
