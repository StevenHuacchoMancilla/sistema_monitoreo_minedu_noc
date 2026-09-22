import { MapPin } from 'lucide-react'
import { Badge } from '../../../components/ui/SoftBadge'

export type LocationMismatchInfo = {
  location_mismatch?: boolean | null
  provincia?: string | null
  distrito?: string | null
  prtg_province?: string | null
  prtg_district?: string | null
  admin_provincia?: string | null
  admin_distrito?: string | null
  location_source?: 'prtg' | 'admin' | 'none' | string | null
}

function zone(province?: string | null, district?: string | null): string {
  return [province, district].filter(Boolean).join(' > ') || '—'
}

/**
 * Badge cuando Excel/admin y jerarquía PRTG no coinciden.
 * Operativo = PRTG; admin = schools.provincia/distrito.
 */
export function LocationMismatchBadge({
  info,
  compact = false,
}: {
  info: LocationMismatchInfo | null | undefined
  compact?: boolean
}) {
  if (!info?.location_mismatch) return null

  const operational = zone(info.prtg_province ?? info.provincia, info.prtg_district ?? info.distrito)
  const admin = zone(info.admin_provincia, info.admin_distrito)
  const title = `Operativo PRTG: ${operational}\nAdmin Excel: ${admin}`

  if (compact) {
    return (
      <Badge tone="warning" className="max-w-full" title={title}>
        <MapPin className="h-3 w-3" aria-hidden />
        Admin ≠ PRTG
      </Badge>
    )
  }

  return (
    <div
      className="inline-flex max-w-full flex-col gap-1 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"
      title={title}
    >
      <span className="inline-flex items-center gap-1.5 font-semibold">
        <MapPin className="h-3.5 w-3.5" aria-hidden />
        Ubicación admin distinta de PRTG
      </span>
      <span>
        <span className="font-medium">PRTG:</span> {operational}
      </span>
      <span>
        <span className="font-medium">Admin:</span> {admin}
      </span>
    </div>
  )
}
