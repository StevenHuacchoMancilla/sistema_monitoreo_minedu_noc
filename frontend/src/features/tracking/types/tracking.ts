export type TrackingStatus = 'OPEN' | 'IN_PROGRESS' | 'TECHNICALLY_RECOVERED' | 'CLOSED'

export type TrackingUpdate = {
  id: number
  tracking_record_id: number
  event_type: string | null
  event_type_label: string | null
  is_system: boolean
  body: string
  created_by_user_id: number | null
  legacy_actor_name: string | null
  actor_name: string
  occurred_on: string | null
  occurred_at: string | null
  created_at: string | null
  updated_at: string | null
}

export type TrackingActivityItem = {
  kind: string
  at: string | null
  display: string | null
  actor: string | null
  label: string
  body?: string | null
  is_system?: boolean
}

export type TrackingDetail = {
  id: number
  public_id?: string | null
  incident_number: number | null
  incident_id: number | null
  school_id: number
  ticket: string | null
  case_code?: string | null
  report_ticket?: string | null
  tss_snapshot: string | null
  cid_snapshot: string | null
  description: string | null
  codigo?: string | null
  codigo_letters?: string[]
  causa?: string | null
  status: TrackingStatus | null
  status_label: string | null
  technical_status: string | null
  technical_status_label: string | null
  opened_at: string | null
  opened_at_display: string | null
  opened_by_name: string | null
  closed_at: string | null
  closed_at_display: string | null
  closed_by_name: string | null
  closing_note: string | null
  lock_version: number
  duration_seconds: number | null
  can_add_update: boolean
  can_close: boolean
  can_reopen: boolean
  can_acknowledge_recovery: boolean
  school: {
    id: number
    local_educativo: string | null
    codigo_local: string | null
    current_sequence: number | null
    provincia?: string | null
    distrito?: string | null
  } | null
  network_assignment: {
    id: number
    cid: string | null
    tecnologia_acceso: string | null
    prtg_province: string | null
    prtg_district: string | null
    prtg_device_name: string | null
  } | null
  incident: {
    id: number
    started_at: string | null
    recovered_at: string | null
    current_status: string | null
    followup_status: string | null
  } | null
  prtg: {
    normalized_status: string | null
    status_label: string | null
    last_synced_at: string | null
    technical_status: string | null
  }
  updates: TrackingUpdate[]
  activity: TrackingActivityItem[]
}

export type TrackingListRow = {
  id: number
  public_id?: string | null
  incident_number: number | null
  ticket: string | null
  case_code?: string | null
  report_ticket?: string | null
  tss_snapshot: string | null
  cid_snapshot: string | null
  description: string | null
  codigo?: string | null
  codigo_letters?: string[]
  causa?: string | null
  status: TrackingStatus | null
  status_label: string | null
  school_name?: string | null
  codigo_local?: string | null
  prtg_province?: string | null
  prtg_district?: string | null
  opened_at: string | null
  opened_at_display: string | null
  opened_by_name: string | null
  closed_at: string | null
  closed_at_display: string | null
  closed_by_name: string | null
  last_update_preview: string | null
  lock_version: number
}

export type TrackingListResponse = {
  data: TrackingListRow[]
  meta: {
    current_page: number
    last_page: number
    per_page: number
    total: number
  }
  filters: {
    statuses: Array<{ value: string; label: string }>
    opened_by: Array<{ value: string; label: string }>
    closed_by: Array<{ value: string; label: string }>
  }
  kpis: {
    abiertos: number
    en_seguimiento: number
    tecnicamente_recuperados: number
    cerrados_hoy: number
    total_periodo: number
  }
}
