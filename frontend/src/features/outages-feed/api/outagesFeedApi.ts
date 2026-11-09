import { apiGet } from '../../../api/client'
import type { RestorationsResponse } from '../../restorations/types'

export function fetchRecentOutages(minutes = 60, limit = 40) {
  return apiGet<RestorationsResponse>(`/notifications/outages?minutes=${minutes}&limit=${limit}`)
}
