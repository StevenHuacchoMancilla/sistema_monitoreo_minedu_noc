import { apiGet, apiPost, apiPut } from './client'
import type {
  Concentration,
  DashboardSummary,
  IncidentDetail,
  IncidentGestionPayload,
  OutageRow,
  SchoolDetail,
} from '../types/api'
import type { CloudnetDashboard, PrtgDashboard } from '../features/dashboard-prtg/types/prtgDashboard'
import type {
  ClosingPreviewResponse,
  ManagementPayload,
  OperationalReportResponse,
} from '../features/reports/types/operationalReport'
import type {
  ContactPayload,
  NetworkAssignmentPayload,
  SchoolGeneralPayload,
  SchoolListResponse,
} from '../features/schools/types/school'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8000/api'

function toQuery(params: Record<string, string | undefined | null>): string {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== '') q.set(k, v)
  }
  const s = q.toString()
  return s ? `?${s}` : ''
}

export const endpoints = {
  dashboardSummary: () => apiGet<DashboardSummary>('/dashboard/summary'),
  dashboardPrtg: () => apiGet<PrtgDashboard>('/dashboard/prtg'),
  dashboardCloudnet: () => apiGet<CloudnetDashboard>('/dashboard/cloudnet'),
  outages: (q = '') =>
    apiGet<{ data: OutageRow[] }>(`/dashboard/outages${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  concentrations: () => apiGet<{ data: Concentration[] }>('/dashboard/concentrations'),
  schools: (params: Record<string, string | undefined | null> = {}) =>
    apiGet<SchoolListResponse>(`/schools${toQuery(params)}`),
  schoolDetail: (id: number) => apiGet<SchoolDetail>(`/schools/${id}`),
  createSchool: (body: SchoolGeneralPayload) => apiPost<SchoolDetail>('/schools', body),
  updateSchool: (id: number, body: SchoolGeneralPayload) => apiPut<SchoolDetail>(`/schools/${id}`, body),
  deactivateSchool: (id: number) => apiPost<SchoolDetail>(`/schools/${id}/deactivate`),
  reactivateSchool: (id: number) => apiPost<SchoolDetail>(`/schools/${id}/reactivate`),
  updateAssignment: (schoolId: number, assignmentId: number, body: NetworkAssignmentPayload) =>
    apiPut<{ assignment: unknown; school: SchoolDetail }>(
      `/schools/${schoolId}/assignments/${assignmentId}`,
      body,
    ),
  reassignCid: (schoolId: number, body: NetworkAssignmentPayload & { cid: string }) =>
    apiPost<{ assignment: unknown; school: SchoolDetail }>(`/schools/${schoolId}/reassign-cid`, body),
  createContact: (schoolId: number, body: ContactPayload) =>
    apiPost(`/schools/${schoolId}/contacts`, body),
  updateContact: (schoolId: number, contactId: number, body: ContactPayload) =>
    apiPut(`/schools/${schoolId}/contacts/${contactId}`, body),
  deactivateContact: (schoolId: number, contactId: number) =>
    apiPost(`/schools/${schoolId}/contacts/${contactId}/deactivate`),
  incidentDetail: (id: number) => apiGet<IncidentDetail>(`/incidents/${id}`),
  updateIncident: (id: number, body: IncidentGestionPayload) =>
    apiPut<IncidentDetail>(`/incidents/${id}`, body),
  applyIncidentManagement: (id: number, body: ManagementPayload) =>
    apiPost<IncidentDetail>(`/incidents/${id}/managements`, body),
  operationalReport: (params: Record<string, string | undefined | null> = {}) =>
    apiGet<OperationalReportResponse>(`/reports/operational${toQuery(params)}`),
  closingPreview: () => apiGet<ClosingPreviewResponse>('/reports/closing-preview'),
  closingXlsxUrl: () => `${API_URL}/reports/closing.xlsx`,
  syncPrtg: () => apiPost<Record<string, unknown>>('/sync/prtg', undefined, { timeoutMs: 120_000 }),
  syncCloudnet: () => apiPost<Record<string, unknown>>('/sync/cloudnet', undefined, { timeoutMs: 120_000 }),
}
