import { apiGet } from '../../../api/client'
import type {
  SchoolHistoryIndexResponse,
  SchoolHistoryIncidentsResponse,
  SchoolHistoryOverview,
} from '../types/history'

function toQuery(params: Record<string, string | number | undefined | null>): string {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== '') q.set(k, String(v))
  }
  const s = q.toString()
  return s ? `?${s}` : ''
}

export function fetchSchoolHistoryIndex(params: Record<string, string | number | undefined | null> = {}) {
  return apiGet<SchoolHistoryIndexResponse>(`/history/schools${toQuery(params)}`)
}

export function fetchSchoolHistoryOverview(schoolId: number) {
  return apiGet<SchoolHistoryOverview>(`/history/schools/${schoolId}`)
}

export function fetchSchoolHistoryIncidents(
  schoolId: number,
  params: Record<string, string | number | undefined | null> = {},
) {
  return apiGet<SchoolHistoryIncidentsResponse>(`/history/schools/${schoolId}/incidents${toQuery(params)}`)
}
