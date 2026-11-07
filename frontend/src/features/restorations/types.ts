export type LiveEventKind = 'outage' | 'restoration'

export type LiveEventRow = {
  id: string
  kind: LiveEventKind
  incident_id: number
  school_id: number
  cid: string | null
  tss: number | null
  local_educativo: string | null
  codigo_local: string | null
  provincia: string | null
  distrito: string | null
  tecnologia: string | null
  nodo_pop: string | null
  started_at: string | null
  recovered_at: string | null
  duration_seconds: number | null
  duration: string | null
  same_day?: boolean
  is_recent: boolean
  estado_prtg?: string | null
  followup_status: string | null
  followup_label: string | null
  pendiente_cierre?: boolean
  href: string
}

/** @deprecated use LiveEventRow with kind=restoration */
export type RestorationRow = LiveEventRow

export type RestorationsResponse = {
  data: LiveEventRow[]
  meta: {
    total: number
    recent: number
    window_minutes: number
  }
}

export type LiveEventsResponse = {
  outages: LiveEventRow[]
  restorations: LiveEventRow[]
  meta: {
    window_minutes: number
    outages: number
    outages_recent: number
    restorations: number
    restorations_recent: number
  }
}
