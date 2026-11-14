import { apiGet } from '../../../api/clienteHttp'
import type { OperationalAlertsResponse } from '../types/alertas'

export function fetchOperationalAlerts(limit = 25) {
  return apiGet<OperationalAlertsResponse>(`/notifications/operational?limit=${limit}`)
}
