import { Badge } from '../ui/Badge'
import { Badge as SoftBadge } from '../ui/SoftBadge'
import { statusTone, type StatusTone } from '../../lib/uiTokens'
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

const CLASSIFICATION_LABELS: Record<string, string> = {
  NEW_OUTAGE: 'Nueva caída',
  CONTACT_CONFIRMED: 'Contacto confirmado',
  NO_RESPONSE: 'En espera',
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
    <span className={`inline-flex max-w-full min-w-0 truncate rounded-full px-2 py-0.5 text-[10px] font-semibold ${CLASSIFICATION_BADGE_CLASS[key] ?? CLASSIFICATION_BADGE_CLASS.slate}`}>
      {label ?? CLASSIFICATION_LABELS[classification] ?? classification}
    </span>
  )
}

/** Clasificaciones que solo describen el origen automático (no el resultado de una gestión humana). */
const AUTOMATIC_CLASSIFICATIONS = new Set(['NEW_OUTAGE', 'UNCLASSIFIED'])

/** Resultado de contacto; oculta "Nueva caída"/"Sin clasificar" porque no aportan tras la gestión. */
export function ContactOutcomeBadge({
  classification,
  label,
}: {
  classification?: string | null
  label?: string | null
}) {
  if (!classification || AUTOMATIC_CLASSIFICATIONS.has(classification)) return null
  return <ClassificationBadge classification={classification} label={label} />
}

export type CaseStatus = { code: string; label: string; tone: StatusTone }

/**
 * Estado del caso: si el label trae segmentos " · ", se apilan chips cortos
 * para no romper columnas table-fixed.
 */
export function CaseStatusBadge({ status }: { status?: CaseStatus | null }) {
  if (!status) return <span className="text-slate-400">—</span>
  const parts = status.label
    .split('·')
    .map((p) => p.trim())
    .filter(Boolean)
  const tone = status.tone in statusTone ? status.tone : 'neutral'

  if (parts.length <= 1) {
    return (
      <SoftBadge tone={tone} title={status.label} className="max-w-full">
        {status.label}
      </SoftBadge>
    )
  }

  return (
    <span className="flex min-w-0 max-w-full flex-col items-start gap-0.5" title={status.label}>
      {parts.map((part, i) => (
        <SoftBadge
          key={`${status.code}-${part}`}
          tone={i === 0 ? tone : i === parts.length - 1 ? 'warning' : 'info'}
          className="max-w-full !text-[10px]"
        >
          {part}
        </SoftBadge>
      ))}
    </span>
  )
}
