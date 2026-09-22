import { Badge } from '../ui/Badge'
import { CLASSIFICATION_BADGE_CLASS } from '../../features/reports/types/operationalReport'

export function PrtgStatusBadge({ status }: { status?: string | null }) {
  return <Badge value={status} />
}

export function CloudnetStatusBadge({ status }: { status?: string | null }) {
  return <Badge value={status ?? 'UNKNOWN'} />
}

export function FollowupBadge({ status }: { status?: string | null }) {
  return <Badge value={status} />
}

export function ReincidenteBadge({ count }: { count?: number | null }) {
  if (!count || count <= 1) return null
  return <Badge value="REINCIDENTE" label={`Reincidente x${count}`} />
}

const CLASSIFICATION_LABELS: Record<string, string> = {
  NEW_OUTAGE: 'Nueva caída',
  CONTACT_CONFIRMED: 'Contacto confirmado',
  NO_RESPONSE: 'Sin respuesta',
  COMPLAINT: 'Queja / reclamo',
  UNCLASSIFIED: 'Sin clasificar',
}

export function ClassificationBadge({
  classification,
  label,
  colorKey,
}: {
  classification?: string | null
  label?: string | null
  colorKey?: string | null
}) {
  if (!classification) return null
  const key = colorKey ?? (
    classification === 'NEW_OUTAGE' ? 'yellow'
      : classification === 'CONTACT_CONFIRMED' ? 'red'
        : classification === 'NO_RESPONSE' ? 'orange'
          : classification === 'COMPLAINT' ? 'blue'
            : 'slate'
  )
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${CLASSIFICATION_BADGE_CLASS[key] ?? CLASSIFICATION_BADGE_CLASS.slate}`}>
      {label ?? CLASSIFICATION_LABELS[classification] ?? classification}
    </span>
  )
}
