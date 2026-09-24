import type { CaseStatus } from '../../../components/monitoring/StatusBadges'
import type { FieldDispatch } from '../../../types/api'

export type { CaseStatus }

export type TrackingSummary = {
  id: number
  public_id: string | null
  incident_number: number | null
  ticket: string | null
  case_code: string | null
  description: string | null
  status: string | null
  status_label: string | null
  technical_status: string | null
  technical_status_label: string | null
  opened_at: string | null
  opened_by_name: string | null
  closed_at: string | null
  closed_by_name: string | null
  closing_note: string | null
  technical_recovered_at: string | null
}

export type PaginatedMeta = {
  current_page: number
  last_page: number
  per_page: number
  total: number
}

export type SchoolHistorySummaryRow = {
  school_id: number
  cid: string | null
  local_educativo: string | null
  codigo_local: string | null
  provincia: string | null
  distrito?: string | null
  tecnologia?: string | null
  caidas: number
  recuperaciones: number
  activas?: number
  estado_actual: string | null
  ultima_caida: string | null
  ultima_recuperacion: string | null
  tiempo_total_caido?: string | null
  tiempo_total_caido_segundos?: number
}

export type SchoolHistoryIndexResponse = {
  data: SchoolHistorySummaryRow[]
  meta: PaginatedMeta
  filters: {
    provincias: string[]
    distritos: string[]
    tecnologias: string[]
    classifications?: Array<{ value: string; label: string }>
    scopes?: Array<{ value: string; label: string }>
  }
  stats: {
    colegios_con_historial: number
    incidencias_historicas: number
    recuperadas: number
    activas: number
  }
}

export type SchoolHistoryOverview = {
  school: {
    id: number
    local_educativo: string | null
    codigo_local: string | null
    codigo_modular?: string | null
    provincia: string | null
    distrito: string | null
    admin_provincia?: string | null
    admin_distrito?: string | null
    location_source?: 'prtg' | 'admin' | 'none'
    location_mismatch?: boolean
    centro_poblado?: string | null
  }
  network: {
    cid: string | null
    tecnologia_acceso: string | null
    capacidad_mbps?: string | null
    nodo_pop?: string | null
    prtg_device_name?: string | null
    prtg_province?: string | null
    prtg_district?: string | null
  }
  monitoring: {
    estado_actual: string | null
    estado_texto?: string | null
    last_check?: string | null
    device_name?: string | null
  }
  statistics: {
    total_caidas: number
    recuperaciones: number
    caidas_activas: number
    ultima_caida: string | null
    ultima_recuperacion: string | null
    tiempo_total_caido_segundos: number
    tiempo_total_caido: string | null
    duracion_promedio_segundos: number | null
    duracion_promedio: string | null
    mayor_caida_segundos: number | null
    mayor_caida: string | null
    ultimos_30_dias: {
      caidas: number
      duracion_total_segundos: number
      duracion_total: string | null
      promedio_segundos: number | null
      promedio: string | null
    }
  }
}

export type Reincidencia = {
  numero: number | null
  total: number
  label: string | null
}

export type SchoolHistoryIncidentRow = {
  id: number
  started_at: string | null
  recovered_at: string | null
  duration_seconds: number | null
  duration: string | null
  same_day: boolean
  followup_status: string | null
  followup_label: string | null
  management_scope: string | null
  cause: string | null
  case_status: CaseStatus
  managements_count: number
  field_dispatches_count: number
  tracking: {
    id: number
    status: string | null
    status_label: string | null
    ticket: string | null
    case_code: string | null
    opened_at: string | null
    opened_by_name: string | null
    closed_at: string | null
    closed_by_name: string | null
    closing_note: string | null
    last_update: { at: string | null; actor: string; body: string } | null
  } | null
  reincidencia: Reincidencia
}

export type CaseTimelineGroup = 'GESTION' | 'TRACKING' | 'CAMPO' | 'REVISION' | 'SISTEMA'

export type CaseTimelineEvent = {
  id: string
  source: 'management' | 'update' | 'tracking'
  at: string | null
  kind: string
  icon: string
  actor: string | null
  title: string
  detail: string | null
  status_before: string | null
  status_after: string | null
  contact: { name: string | null; role: string | null; phone: string | null } | null
  scope: string | null
  classification: string | null
  group: CaseTimelineGroup
  role: string
}

export type IncidentCaseFile = {
  incident: {
    id: number
    started_at: string | null
    recovered_at: string | null
    is_active: boolean
    duration_seconds: number | null
    duration: string | null
    same_day: boolean
    followup_status: string | null
    followup_label: string | null
    case_status: CaseStatus
    reincidencia: Reincidencia
  }
  gestion: {
    classification: string | null
    classification_label: string | null
    scope: string | null
    outage_text: string | null
    detail_text: string | null
    diagnosis: string | null
    cause: string | null
    responsible_area: string | null
    glpi_ticket: string | null
    contact_result: string | null
    evidence_observations: string | null
    last_contact_at: string | null
    managements_count: number
  }
  recovery: {
    recovered_while_managing: boolean
    review_status: string | null
    review_label: string | null
    reviewed_at: string | null
    requires_review: boolean
    had_field_tech: boolean
    has_active_dispatch: boolean
    recovery_note: string | null
  }
  school: {
    id: number | null
    local_educativo: string | null
    codigo_local: string | null
    codigo_modular: string | null
    centro_poblado: string | null
    cid: string | null
    tecnologia: string | null
    nodo_pop: string | null
    capacidad_mbps: string | number | null
    prtg_device_name: string | null
    provincia: string | null
    distrito: string | null
    location_mismatch?: boolean
  }
  prtg: {
    estado: string | null
    estado_texto: string | null
    sensor_name: string | null
    device_name: string | null
    sensor_objid: string | number | null
    last_check: string | null
  }
  tracking: (TrackingSummary & { updates_count: number }) | null
  field_dispatch: FieldDispatch | null
  field_dispatches: Array<FieldDispatch & { created_by_name: string | null }>
  participants: Array<{
    name: string
    roles: string[]
    events: number
    first_at: string | null
    last_at: string | null
  }>
  timeline: CaseTimelineEvent[]
}

export type SchoolHistoryIncidentsResponse = {
  data: SchoolHistoryIncidentRow[]
  meta: PaginatedMeta
}
