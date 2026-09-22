import type { StatusTone } from '../../../lib/uiTokens'
import type { TrackingStatus } from '../types/tracking'

export function trackingStatusTone(status: TrackingStatus | string | null | undefined): StatusTone {
  switch (status) {
    case 'OPEN':
      return 'warning'
    case 'IN_PROGRESS':
      return 'info'
    case 'TECHNICALLY_RECOVERED':
      return 'success'
    case 'CLOSED':
      return 'neutral'
    default:
      return 'neutral'
  }
}
