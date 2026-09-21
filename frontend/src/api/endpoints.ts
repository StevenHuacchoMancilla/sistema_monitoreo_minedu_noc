import { apiGet, apiPost, apiPut } from './client'
import type {
  Concentration,
  DashboardSummary,
  IncidentDetail,
  IncidentGestionPayload,
  OutageRow,
  SchoolDetail,
} from '../types/api'

export const endpoints = {
  dashboardSummary: () => apiGet<DashboardSummary>('/dashboard/summary'),
  outages: (q = '') =>
    apiGet<{ data: OutageRow[] }>(`/dashboard/outages${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  concentrations: () => apiGet<{ data: Concentration[] }>('/dashboard/concentrations'),
  schoolDetail: (id: number) => apiGet<SchoolDetail>(`/schools/${id}`),
  incidentDetail: (id: number) => apiGet<IncidentDetail>(`/incidents/${id}`),
  updateIncident: (id: number, body: IncidentGestionPayload) =>
    apiPut<IncidentDetail>(`/incidents/${id}`, body),
  syncPrtg: () => apiPost<Record<string, unknown>>('/sync/prtg', undefined, { timeoutMs: 120_000 }),
  syncCloudnet: () => apiPost<Record<string, unknown>>('/sync/cloudnet', undefined, { timeoutMs: 120_000 }),
}
