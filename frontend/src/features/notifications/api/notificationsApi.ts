import { apiGet } from '../../../api/client'
import type { OperationalAlertsResponse } from '../types/alerts'

export function fetchOperationalAlerts(limit = 25) {
  return apiGet<OperationalAlertsResponse>(`/notifications/operational?limit=${limit}`)
}
