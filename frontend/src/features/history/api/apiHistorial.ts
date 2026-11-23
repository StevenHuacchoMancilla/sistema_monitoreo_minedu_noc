import { apiGet, apiPut } from '../../../api/clienteHttp'
import type {
  IncidentCaseFile,
  SchoolHistoryCategory,
  SchoolHistoryIndexResponse,
  SchoolHistoryIncidentsResponse,
  SchoolHistoryOverview,
  SchoolSlaMonthlyResponse,
} from '../types/historial'

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

export function fetchSchoolSlaMonthly(schoolId: number, month?: string) {
  return apiGet<SchoolSlaMonthlyResponse>(
    `/history/schools/${schoolId}/sla-monthly${toQuery({ month: month || undefined })}`,
  )
}

export function fetchIncidentCaseFile(incidentId: number) {
  return apiGet<IncidentCaseFile>(`/history/incidents/${incidentId}`)
}

export function updateHistoryIncidentCategory(
  incidentId: number,
  body: {
    category: SchoolHistoryCategory
    root_cause_group_code?: string | null
    root_cause_code?: string | null
    detail?: string | null
  },
) {
  return apiPut<{
    data: {
      incident_id: number
      category: SchoolHistoryCategory
      category_label: string
      root_cause_group_code?: string | null
      root_cause_code?: string | null
      detail_text?: string | null
      unchanged?: boolean
    }
  }>(`/history/incidents/${incidentId}/category`, body)
}

/** Ruta de la página de expediente completo de una incidencia. */
export const incidentCaseFilePath = (incidentId: number) => `/history/incidents/${incidentId}`
