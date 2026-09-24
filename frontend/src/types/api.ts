export type ApiHealth = {
  status: 'ok' | 'degraded'
  app: string
  database: {
    connected: boolean
    driver: string
    host: string | null
    port: string | null
    name: string | null
    error: string | null
  }
  time: string
}

export type DashboardKpis = {
  total_locales: number
  con_cid_valido: number
  sin_cid: number
  operativos: number
  caidos: number
  parciales: number
  pausados: number
  sin_datos_prtg: number
  incidencias_activas: number
  pendientes_contacto: number
  en_gestion: number
  recuperados_hoy: number
  recuperados_total?: number
  concentraciones?: number
  cloudnet_sites: number
  cloudnet_online_devices: number
  cloudnet_offline_devices: number
  sites_sin_asociacion: number
  contactos_pendientes_match?: number
}

export type SyncRunSnapshot = {
  status: string | null
  finished_at: string | null
  warning_count: number
  error_count: number
  processed_count: number
} | null

export type DashboardSummary = {
  health: {
    api: string
    database: string
    driver: string
    name: string | null
  }
  kpis: DashboardKpis
  nav?: {
    caidas_activas: number
    pendientes_contacto: number
    en_gestion: number
    concentraciones: number
    recuperados: number
    pending_reviews?: number
  }
  active_incidents_preview: OutageRow[]
  oldest_incidents_preview?: OutageRow[]
  cloudnet: {
    sites: number
    matched: number
    pending: number
    last_synced_at: string | null
    devices?: number
    preview?: Array<{
      shop_id: string | number
      site_name: string | null
      address: string | null
      match_status: string | null
      school_id: number | null
    }>
  }
  concentrations: Concentration[]
  recent_recoveries: Array<{
    incident_id: number
    school_id: number
    cid: string | null
    local_educativo: string | null
    codigo_local: string | null
    recovered_at: string | null
    started_at?: string | null
    duracion?: string | null
    followup_status: string | null
    reincidente_count?: number
  }>
  sync: {
    prtg: SyncRunSnapshot
    cloudnet: SyncRunSnapshot
  }
}

export type OutageRow = {
  incident_id: number
  school_id?: number | null
  assignment_id?: number | null
  cid: string | null
  local_educativo: string | null
  codigo_local: string | null
  provincia: string | null
  distrito: string | null
  location_source?: 'prtg' | 'admin' | 'none'
  location_mismatch?: boolean
  prtg_province?: string | null
  prtg_district?: string | null
  admin_provincia?: string | null
  admin_distrito?: string | null
  tecnologia: string | null
  nodo_pop: string | null
  estado_prtg: string | null
  estado_prtg_text: string | null
  duracion: string | null
  duration_seconds?: number | null
  started_at: string | null
  tracking?: {
    id: number
    status: string | null
    status_label: string | null
    ticket: string | null
  } | null
  followup_status: string | null
  management_classification?: string | null
  management_classification_label?: string | null
  color_key?: string | null
  outage_text?: string | null
  detail_text?: string | null
  management_scope?: string | null
  last_check: string | null
  contacto: string | null
  telefono: string | null
  contacto_corto?: string | null
  telefono_masked?: string | null
  cloudnet_status?: string | null
  reincidente_count?: number
  reincidente?: boolean
  glpi_ticket?: string | null
  responsible_area?: string | null
}

export type Concentration = {
  dimension: string
  label: string
  caidos: number
  nota: string
  provincia?: string | null
  distrito?: string | null
  location_source?: 'prtg' | 'admin' | 'none'
  afectados?: number
  total?: number
  monitoreados?: number
  operativos?: number
  sin_monitoreo?: number
  porcentaje_caidos?: number
  nodo_pop?: string | null
  oldest_started_at?: string | null
}

export type SchoolDetail = {
  school: {
    id: number
    local_educativo: string | null
    codigo_local: string | null
    provincia: string | null
    distrito: string | null
    centro_poblado?: string | null
    nivel_iiee?: string | null
    contacts?: Array<Record<string, unknown>>
    active_assignment?: Record<string, unknown> | null
  }
  location?: {
    provincia: string | null
    distrito: string | null
    prtg_province: string | null
    prtg_district: string | null
    admin_provincia: string | null
    admin_distrito: string | null
    location_source: 'prtg' | 'admin' | 'none'
    location_mismatch: boolean
  }
  sensors: Array<Record<string, unknown>>
  prtg_summary: {
    sensor_count: number
    ping_status: string | null
    ping_status_text?: string | null
    last_check: string | null
    device_name?: string | null
  }
  cloudnet_sites: Array<Record<string, unknown>>
  cloudnet?: {
    shop_id?: string | number
    site_name?: string | null
    address?: string | null
    match_status?: string | null
    last_synced_at?: string | null
    devices?: number
  } | null
  active_incident: {
    id: number
    started_at?: string | null
    followup_status?: string | null
  } | null
  incident_history: Array<Record<string, unknown>>
}

export type IncidentDetail = {
  incident: {
    id: number
    school_id: number
    started_at?: string | null
    recovered_at?: string | null
    followup_status?: string | null
  }
  estado: {
    estado_prtg: string | null
    estado_prtg_text: string | null
    fecha_caida: string | null
    duracion: string | null
    duracion_segundos: number | null
    recovered_at: string | null
    ultima_comprobacion: string | null
    sensor_id: number | null
    prtg_sensor_objid: string | number | null
    n_incidencia: number
    followup_status: string | null
    followup_label: string | null
    activa: boolean
    same_day?: boolean
    recovered_while_managing?: boolean
    recovery_review_status?: string | null
    recovery_review_label?: string | null
    recovery_reviewed_at?: string | null
    requires_review?: boolean
    active_field_dispatch?: boolean
    had_field_tech?: boolean
    active_tracking_id?: number | null
  }
  active_tracking?: {
    id: number
    incident_number: number | null
    public_id?: string | null
    case_code?: string | null
    ticket?: string | null
    report_ticket?: string | null
    status: string | null
    status_label: string | null
    opened_at: string | null
    opened_by_name: string | null
    description: string | null
  } | null
  tracking_sync?: {
    created: boolean
    tracking_id: number
    ticket_code: string | null
    status: string
    incident_number: number | null
  } | null
  field_dispatch?: FieldDispatch | null
  field_dispatches?: FieldDispatch[]
  colegio: {
    school_id: number | null
    local_educativo: string | null
    codigo_local: string | null
    codigo_modular: string | null
    departamento: string | null
    provincia: string | null
    distrito: string | null
    prtg_province?: string | null
    prtg_district?: string | null
    admin_provincia?: string | null
    admin_distrito?: string | null
    location_source?: 'prtg' | 'admin' | 'none'
    location_mismatch?: boolean
    centro_poblado: string | null
    clasificacion: string | null
    cid: string | null
    tecnologia: string | null
    nodo_pop: string | null
    ip_loopback: string | null
    ip_publica: string | null
    capacidad_mbps: string | number | null
    nombre_prtg: string | null
    legacy_reference: string | null
    current_sequence: number | null
  }
  cloudnet?: {
    shop_id?: string | number
    site_name?: string | null
    address?: string | null
    match_status?: string | null
    last_synced_at?: string | null
    devices?: number
  } | null
  contactos: Array<{
    id: number
    nombre: string | null
    cargo: string | null
    telefono: string | null
    position: number | null
  }>
  antecedentes: {
    incidencias_registradas: number
    recuperadas: number
    activas: number
    reincidente: boolean
    reincidencia?: {
      numero: number
      total: number
      label: string
    }
  }
  historial: Array<{
    id: number
    started_at: string | null
    recovered_at: string | null
    duracion: string | null
    followup_status: string | null
    status: string
    es_actual: boolean
  }>
  gestion: {
    followup_status: string | null
    management_classification?: string | null
    management_classification_label?: string | null
    management_scope?: string | null
    outage_text?: string | null
    detail_text?: string | null
    last_managed_contact_id?: number | null
    contact_status: string | null
    contact_result: string | null
    responsible_area: string | null
    glpi_ticket: string | null
    diagnosis: string | null
    evidence_observations: string | null
    cause: string | null
    last_contact_at: string | null
  }
  managements?: Array<{
    id: number
    classification: string | null
    classification_label: string | null
    color_key: string | null
    scope: string | null
    outage_text: string | null
    detail: string | null
    observation: string | null
    contact_id: number | null
    contact_name_snapshot: string | null
    contact_phone_snapshot: string | null
    contact_role_snapshot: string | null
    contact_attempted_at: string | null
    created_by: number | null
    created_by_name?: string | null
    created_at: string | null
  }>
  updates?: Array<{
    id: number
    type: string | null
    status_before: string | null
    status_after: string | null
    observation: string | null
    user_id: number | null
    user_name?: string | null
    created_at: string | null
  }>
  timeline?: Array<{
    id: string
    source: string
    at: string | null
    kind: string
    icon: string
    actor: string
    title: string
    detail: string | null
    status_before: string | null
    status_after: string | null
    contact: { name: string | null; role: string | null; phone: string | null } | null
    scope: string | null
    classification: string | null
  }>
  snapshots?: {
    school: Record<string, unknown> | null
    network: Record<string, unknown> | null
  }
  opciones: {
    followup_statuses: Array<{ value: string; label: string }>
    management_classifications?: Array<{ value: string; label: string; color_key: string }>
    management_scopes?: Array<{ value: string; label: string }>
    contact_statuses: Array<{ value: string; label: string }>
    contact_results?: Array<{ value: string; label: string }>
  }
}

export type FieldDispatchAction = 'PLAN' | 'DISPATCH' | 'ARRIVE' | 'CANCEL' | 'COMPLETE'

export type FieldDispatch = {
  id: number
  incident_id: number
  status: string | null
  status_label: string | null
  is_active: boolean
  technician_name: string | null
  notes: string | null
  cancellation_reason: string | null
  planned_at: string | null
  dispatched_at: string | null
  on_site_at: string | null
  cancelled_at: string | null
  completed_at: string | null
  created_by: number | null
  updated_by: number | null
  created_at: string | null
  updated_at: string | null
}

export type IncidentGestionPayload = {
  followup_status?: string | null
  contact_status?: string | null
  contact_result?: string | null
  responsible_area?: string | null
  glpi_ticket?: string | null
  diagnosis?: string | null
  evidence_observations?: string | null
  cause?: string | null
}

export type RequestState<T> =
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'empty' }
  | { status: 'error'; message: string }
