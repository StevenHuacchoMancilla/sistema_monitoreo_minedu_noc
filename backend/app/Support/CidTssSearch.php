<?php

namespace App\Support;

use Illuminate\Database\Eloquent\Builder;

/**
 * Búsqueda operativa por CID o TSS (current_sequence).
 * Esos dos son los criterios principales en filtros "Buscar".
 */
final class CidTssSearch
{
    /**
     * @return array{needle: string, digits: string, like: string, tss: ?int}
     */
    public static function parse(?string $raw): array
    {
        $needle = trim((string) $raw);
        $digits = preg_replace('/\D+/', '', $needle) ?? '';

        return [
            'needle' => $needle,
            'digits' => $digits,
            'like' => '%'.mb_strtolower($needle).'%',
            'tss' => ($digits !== '' && ctype_digit($digits)) ? (int) $digits : null,
        ];
    }

    /** Incidentes con relaciones school + networkAssignment. */
    public static function constrainIncident(Builder $query, ?string $raw): void
    {
        $p = self::parse($raw);
        if ($p['needle'] === '') {
            return;
        }

        $query->where(function (Builder $q) use ($p) {
            $q->whereHas('networkAssignment', function (Builder $na) use ($p) {
                $na->where(function (Builder $cid) use ($p) {
                    $cid->whereRaw('LOWER(COALESCE(cid, \'\')) like ?', [$p['like']]);
                    if ($p['digits'] !== '') {
                        $cid->orWhere('cid', $p['digits']);
                    }
                });
            })->orWhereHas('school', function (Builder $s) use ($p) {
                $s->where(function (Builder $tss) use ($p) {
                    $tss->whereRaw('CAST(current_sequence AS TEXT) like ?', [$p['like']]);
                    if ($p['tss'] !== null) {
                        $tss->orWhere('current_sequence', $p['tss']);
                    }
                });
            });
        });
    }

    /** Colegios con activeAssignment (CID) + current_sequence (TSS). */
    public static function constrainSchool(Builder $query, ?string $raw): void
    {
        $p = self::parse($raw);
        if ($p['needle'] === '') {
            return;
        }

        $query->where(function (Builder $q) use ($p) {
            $q->whereHas('activeAssignment', function (Builder $a) use ($p) {
                $a->where(function (Builder $cid) use ($p) {
                    $cid->whereRaw('LOWER(COALESCE(cid, \'\')) like ?', [$p['like']]);
                    if ($p['digits'] !== '') {
                        $cid->orWhere('cid', $p['digits']);
                    }
                });
            })->orWhere(function (Builder $tss) use ($p) {
                $tss->whereRaw('CAST(current_sequence AS TEXT) like ?', [$p['like']]);
                if ($p['tss'] !== null) {
                    $tss->orWhere('current_sequence', $p['tss']);
                }
            });
        });
    }

    /** NetworkAssignment con school. */
    public static function constrainAssignment(Builder $query, ?string $raw): void
    {
        $p = self::parse($raw);
        if ($p['needle'] === '') {
            return;
        }

        $query->where(function (Builder $q) use ($p) {
            $q->where(function (Builder $cid) use ($p) {
                $cid->whereRaw('LOWER(COALESCE(cid, \'\')) like ?', [$p['like']]);
                if ($p['digits'] !== '') {
                    $cid->orWhere('cid', $p['digits']);
                }
            })->orWhereHas('school', function (Builder $s) use ($p) {
                $s->where(function (Builder $tss) use ($p) {
                    $tss->whereRaw('CAST(current_sequence AS TEXT) like ?', [$p['like']]);
                    if ($p['tss'] !== null) {
                        $tss->orWhere('current_sequence', $p['tss']);
                    }
                });
            });
        });
    }

    /** Tickets / filas con columnas propias cid + tss (mantenimientos, snapshots). */
    public static function constrainTicketCidTss(Builder $query, ?string $raw, string $cidColumn = 'cid', string $tssColumn = 'tss'): void
    {
        $p = self::parse($raw);
        if ($p['needle'] === '') {
            return;
        }

        $query->where(function (Builder $q) use ($p, $cidColumn, $tssColumn) {
            $q->where(function (Builder $cid) use ($p, $cidColumn) {
                $cid->whereRaw('LOWER(COALESCE('.$cidColumn.', \'\')) like ?', [$p['like']]);
                if ($p['digits'] !== '') {
                    $cid->orWhere($cidColumn, $p['digits']);
                }
            })->orWhere(function (Builder $tss) use ($p, $tssColumn) {
                $tss->whereRaw('LOWER(COALESCE(CAST('.$tssColumn.' AS TEXT), \'\')) like ?', [$p['like']]);
                if ($p['tss'] !== null) {
                    $tss->orWhere($tssColumn, (string) $p['tss'])
                        ->orWhere($tssColumn, $p['tss']);
                }
            });
        });
    }

    /** Filas ya mapeadas (Lista LLEE / reportes en memoria). */
    public static function matchesRowCidTss(array $row, ?string $raw): bool
    {
        $p = self::parse($raw);
        if ($p['needle'] === '') {
            return true;
        }

        $cid = mb_strtolower((string) ($row['cid'] ?? ''));
        $needle = mb_strtolower($p['needle']);
        if ($cid !== '' && (str_contains($cid, $needle) || ($p['digits'] !== '' && str_contains($cid, $p['digits'])))) {
            return true;
        }

        $tss = $row['tss'] ?? $row['n'] ?? $row['current_sequence'] ?? null;
        if ($tss === null || $tss === '') {
            return false;
        }
        $tssStr = (string) $tss;
        if ($p['tss'] !== null && (int) $tss === $p['tss']) {
            return true;
        }

        return str_contains(mb_strtolower($tssStr), $needle)
            || ($p['digits'] !== '' && str_contains($tssStr, $p['digits']));
    }
}
