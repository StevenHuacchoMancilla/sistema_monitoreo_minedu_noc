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

export type SchoolHistoryIncidentRow = {
  id: number
  started_at?: string | null
  recovered_at?: string | null
  duration_seconds?: number | null
  duration?: string | null
  same_day?: boolean
  followup_status?: string | null
  followup_label?: string | null
  management_classification?: string | null
  management_classification_label?: string | null
  management_scope?: string | null
  current_status?: string | null
  prtg_status?: string | null
  reincidencia?: {
    numero: number | null
    total: number
    label: string | null
  }
}

export type SchoolHistoryIncidentsResponse = {
  data: SchoolHistoryIncidentRow[]
  meta: PaginatedMeta
}
