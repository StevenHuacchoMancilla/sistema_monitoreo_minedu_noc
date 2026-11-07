import { apiGet } from '../../../api/client'
import type { LiveEventsResponse, RestorationsResponse } from '../types'

export function fetchRecentRestorations(minutes = 60, limit = 40) {
  return apiGet<RestorationsResponse>(
    `/notifications/restorations?minutes=${minutes}&limit=${limit}`,
  )
}

export function fetchLiveEvents(minutes = 60, limit = 40) {
  return apiGet<LiveEventsResponse>(
    `/notifications/live?minutes=${minutes}&limit=${limit}`,
  )
}
