import type { CaseStatus } from '../../../components/monitoring/StatusBadges'

export type RecoveredRow = {
  id: number
  school_id: number
  cid: string | null
  local_educativo: string | null
  codigo_local: string | null
  provincia: string | null
  distrito: string | null
  prtg_province?: string | null
  prtg_district?: string | null
  admin_provincia?: string | null
  admin_distrito?: string | null
  location_source?: 'prtg' | 'admin' | 'none'
  location_mismatch?: boolean
  tecnologia: string | null
  started_at: string | null
  recovered_at: string | null
  duration_seconds: number | null
  duration: string | null
  same_day: boolean
  management_classification: string | null
  management_classification_label: string | null
  management_scope: string | null
  followup_status: string | null
  followup_before_recovery: string | null
  recovered_during_management: boolean
  had_field_tech: boolean
  active_field_dispatch?: boolean
  recovery_review_status: string | null
  requires_review: boolean
  managements_count: number
  case_status: CaseStatus
  tracking: {
    id: number
    status: string | null
    status_label: string | null
    ticket: string | null
    closed_by_name: string | null
  } | null
  badges: string[]
}

export type RecoveryReviewAction =
  | 'ACKNOWLEDGE'
  | 'CONTINUE_MONITORING'
  | 'CONTINUE_ONSITE'
  | 'CANCEL_DISPATCH'
  | 'ADD_NOTE'

export type RecoveredListResponse = {
  data: RecoveredRow[]
  meta: {
    current_page: number
    last_page: number
    per_page: number
    total: number
  }
  filters: {
    date_from: string
    date_to: string
    preset: string
    provincias: string[]
    distritos: string[]
    tecnologias: string[]
    classifications: Array<{ value: string; label: string }>
    scopes: Array<{ value: string; label: string }>
  }
}

export type RecoveredSummaryResponse = {
  data: {
    date_from: string
    date_to: string
    recovered_today: number
    recovered_this_week: number
    recovered_in_period: number
    recovered_during_management: number
    recovered_with_field_tech: number
    same_day_recoveries: number
    recovered_with_contact: number
    recovered_without_contact: number
  }
}
