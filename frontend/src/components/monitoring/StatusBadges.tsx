import { Badge } from '../ui/Badge'

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
