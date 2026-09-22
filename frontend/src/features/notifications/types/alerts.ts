export type OperationalAlert = {
  id: string
  type: 'RECOVERY_PENDING_REVIEW' | 'RECOVERY_WITH_DISPATCH' | string
  severity: 'warning' | 'danger' | string
  title: string
  body: string
  incident_id: number
  school_id: number
  cid: string | null
  local_educativo: string | null
  codigo_local: string | null
  provincia: string | null
  recovered_at: string | null
  active_field_dispatch: boolean
  field_dispatch_status: string | null
  href: string
}

export type OperationalAlertsResponse = {
  data: OperationalAlert[]
  meta: {
    total: number
    with_dispatch: number
    pending_review: number
  }
}
