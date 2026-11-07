import { apiGet, apiPost, apiPut, API_URL } from './client'
import type {
  Concentration,
  ConcentrationZone,
  DashboardSummary,
  IncidentDetail,
  IncidentGestionPayload,
  OutageRow,
  SchoolDetail,
} from '../types/api'
import type { PrtgDashboard } from '../features/dashboard-prtg/types/prtgDashboard'
import type {
  ClosingPreviewResponse,
  ManagementPayload,
  OperationalReportResponse,
} from '../features/reports/types/operationalReport'
import type { GeneralReportResponse } from '../features/reports/types/generalReport'
import type { TicketeraPayload, TicketeraTimeline } from '../features/ticketera/types/ticketera'
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
  outages: (q = '') =>
    apiGet<{ data: OutageRow[] }>(`/dashboard/outages${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  managing: (q = '') =>
    apiGet<{ data: OutageRow[] }>(`/dashboard/managing${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  concentrations: () => apiGet<{ data: Concentration[] }>('/dashboard/concentrations'),
  concentrationZone: (provincia: string, distrito: string) =>
    apiGet<ConcentrationZone>(
      `/dashboard/concentrations/zone${toQuery({ provincia, distrito })}`,
    ),
  massOutages: () => apiGet<{ data: Concentration[] }>('/dashboard/mass-outages'),
  massOutageNodo: (nodo: string) =>
    apiGet<ConcentrationZone>(`/dashboard/mass-outages/nodo${toQuery({ nodo })}`),
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
  clockStop: (id: number, action: 'start' | 'end') =>
    apiPost<IncidentDetail>(`/incidents/${id}/clock-stop`, { action }),
  lookupSchool: (q: string) =>
    apiGet<{ data: {
      school_id: number | null
      assignment_id: number
      cid: string | null
      tss: number | null
      local_educativo: string | null
      codigo_local: string | null
      provincia: string | null
      distrito: string | null
    } | null }>(`/incidents/lookup?q=${encodeURIComponent(q)}`),
  createManualTicket: (body: {
    q: string
    detail?: string | null
    minedu_reason?: string | null
    root_cause_group_code: string
    root_cause_code: string
  }) => apiPost<IncidentDetail>('/incidents/manual', body),
  createPreventiveTicket: (body: {
    q: string
    detail?: string | null
    opened_at?: string | null
    minedu_reason?: string | null
    root_cause_group_code: string
    root_cause_code: string
  }) => apiPost<IncidentDetail>('/incidents/preventive', body),
  saveVisit: (id: number, body: {
    opened_at?: string | null
    restored_at?: string | null
    closed_at?: string | null
    arrived_at?: string | null
    departed_at?: string | null
    technician_name?: string | null
    polygon?: string | null
    visit_reason?: string | null
    activities?: string | null
    materials?: string | null
  }) => apiPut<IncidentDetail>(`/incidents/${id}/visit`, body),
  sameHourGroups: () =>
    apiGet<{ window_minutes: number; data: Array<Record<string, unknown>> }>('/incidents/same-hour'),
  applySameHour: (body: { incident_ids: number[]; minedu_reason: string; detail?: string | null }) =>
    apiPost<{ updated: number }>('/incidents/same-hour', body),
  createManualPartial: (body: {
    school_id?: number
    network_assignment_id?: number
    cid?: string
    affected_wan_node: 'PRINCIPAL' | 'SECUNDARIO'
    classification: 'CONTACT_CONFIRMED' | 'LINK_OUTAGE' | 'NO_RESPONSE'
    detail?: string
  }) => apiPost<IncidentDetail>('/incidents/manual-partial', body),
  recoveryReview: (
    id: number,
    body: {
      action: 'ACKNOWLEDGE' | 'CONTINUE_MONITORING' | 'ADD_NOTE'
      observation?: string
    },
  ) => apiPost<IncidentDetail>(`/incidents/${id}/recovery-review`, body),
  operationalReport: (params: Record<string, string | undefined | null> = {}) =>
    apiGet<OperationalReportResponse>(`/reports/operational${toQuery(params)}`),
  generalReport: (params: Record<string, string | undefined | null> = {}) =>
    apiGet<GeneralReportResponse>(`/reports/general${toQuery(params)}`),
  closingPreview: () => apiGet<ClosingPreviewResponse>('/reports/closing-preview'),
  mineduReport: () =>
    apiGet<{
      total: number
      groups: Array<{ key: string; label: string; total: number }>
      rows: Array<Record<string, string | number | null>>
    }>('/reports/minedu'),
  usageReport: (search = '') =>
    apiGet<{ total: number; rows: Array<Record<string, string | number | null>> }>(
      `/reports/usage${search ? `?search=${encodeURIComponent(search)}` : ''}`,
    ),
  closingXlsxUrl: () => `${API_URL}/reports/closing.xlsx`,
  mineduXlsxUrl: () => `${API_URL}/reports/minedu.xlsx`,
  usageXlsxUrl: (search = '') =>
    `${API_URL}/reports/usage.xlsx${search ? `?search=${encodeURIComponent(search)}` : ''}`,
  generalReportXlsxUrl: (params: Record<string, string | undefined | null> = {}) =>
    `${API_URL}/reports/general.xlsx${toQuery(params)}`,
  ticketera: (fresh = false) => apiGet<TicketeraPayload>(`/ticketera${fresh ? '?fresh=1' : ''}`),
  ticketeraTimeline: (cid: string, from: string, to: string) =>
    apiGet<TicketeraTimeline>(`/ticketera/timeline${toQuery({ cid, from, to })}`),
  syncPrtg: () => apiPost<Record<string, unknown>>('/sync/prtg', undefined, { timeoutMs: 30_000 }),
  incidentsPendienteCierre: () =>
    apiGet<{ data: Array<Record<string, unknown>> }>('/incidents/queues/pendiente-cierre'),
  incidentsGraves: () => apiGet<{ data: Array<Record<string, unknown>> }>('/incidents/queues/graves'),
  markIncidentGrave: (id: number, observation?: string) =>
    apiPost(`/incidents/${id}/mark-grave`, { observation }),
  closeIncidentGrave: (id: number, observation?: string) =>
    apiPost(`/incidents/${id}/close-grave`, { observation }),
  closeIncidentTicket: (id: number, observation?: string) =>
    apiPost(`/incidents/${id}/close-ticket`, { observation }),
  assignmentPrtgSensors: (assignmentId: number) =>
    apiGet<{
      assignment_id: number
      cid: string | null
      data: Array<{
        id: number
        name: string
        sensor_role: string | null
        last_value: string | null
        unit: string | null
        normalized_status: string | null
        down_since: string | null
      }>
    }>(`/assignments/${assignmentId}/prtg-sensors`),
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
