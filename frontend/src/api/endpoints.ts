import { apiGet, apiPost, apiPut, API_URL } from './client'
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
import type { GeneralReportResponse } from '../features/reports/types/generalReport'
import type {
  ContactPayload,
  NetworkAssignmentPayload,
  SchoolGeneralPayload,
  SchoolListResponse,
} from '../features/schools/types/school'

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
  fieldDispatch: (
    id: number,
    body: {
      action: 'PLAN' | 'DISPATCH' | 'ARRIVE' | 'CANCEL' | 'COMPLETE'
      technician_name?: string
      observation?: string
    },
  ) => apiPost<IncidentDetail>(`/incidents/${id}/field-dispatches`, body),
  recoveryReview: (
    id: number,
    body: {
      action:
        | 'ACKNOWLEDGE'
        | 'CONTINUE_MONITORING'
        | 'CONTINUE_ONSITE'
        | 'CANCEL_DISPATCH'
        | 'ADD_NOTE'
      observation?: string
    },
  ) => apiPost<IncidentDetail>(`/incidents/${id}/recovery-review`, body),
  operationalReport: (params: Record<string, string | undefined | null> = {}) =>
    apiGet<OperationalReportResponse>(`/reports/operational${toQuery(params)}`),
  generalReport: (params: Record<string, string | undefined | null> = {}) =>
    apiGet<GeneralReportResponse>(`/reports/general${toQuery(params)}`),
  closingPreview: () => apiGet<ClosingPreviewResponse>('/reports/closing-preview'),
  closingXlsxUrl: () => `${API_URL}/reports/closing.xlsx`,
  generalReportXlsxUrl: (params: Record<string, string | undefined | null> = {}) =>
    `${API_URL}/reports/general.xlsx${toQuery(params)}`,
  syncPrtg: () => apiPost<Record<string, unknown>>('/sync/prtg', undefined, { timeoutMs: 120_000 }),
  syncCloudnet: () => apiPost<Record<string, unknown>>('/sync/cloudnet', undefined, { timeoutMs: 120_000 }),
  prtgProvinces: () =>
    apiGet<{
      data: Array<{ name: string; district_count: number; assignment_count: number }>
      meta: { source: string; count: number }
    }>('/prtg/locations/provinces'),
  prtgDistricts: (province?: string) =>
    apiGet<{
      data: Array<{ name: string; province: string; assignment_count: number }>
      meta: { source: string; province: string | null; count: number }
    }>(`/prtg/locations/districts${toQuery({ province })}`),
  prtgLocationTree: () =>
    apiGet<{
      data: Array<{
        province: string
        districts: Array<{ name: string; assignment_count: number }>
        assignment_count: number
      }>
      meta: { source: string; provinces: number; districts: number }
    }>('/prtg/locations/tree'),
}
