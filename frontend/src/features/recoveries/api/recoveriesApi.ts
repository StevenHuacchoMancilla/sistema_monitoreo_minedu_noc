import { apiGet } from '../../../api/client'
import type { RecoveredListResponse, RecoveredSummaryResponse } from '../types/recoveries'

function toQuery(params: Record<string, string | number | boolean | undefined | null>): string {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v == null || v === '' || v === false) continue
    q.set(k, String(v))
  }
  const s = q.toString()
  return s ? `?${s}` : ''
}

export function fetchRecoveredIncidents(params: Record<string, string | number | boolean | undefined | null> = {}) {
  return apiGet<RecoveredListResponse>(`/incidents/recovered${toQuery(params)}`)
}

export function fetchRecoveredSummary(params: Record<string, string | number | boolean | undefined | null> = {}) {
  return apiGet<RecoveredSummaryResponse>(`/incidents/recovered/summary${toQuery(params)}`)
}
