export type GeneralReportColumn = {
  key: string
  label: string
}

export type GeneralReportRow = {
  n: number
  incident_id: number
  ticket: string
  cid: string
  tss: string
  local_educativo: string
  provincia: string
  distrito: string
  energia: string
  noc_apertura: string
  minedu: string
  codigo: string
  segmento: string
  atencion: string
  apertura_ticket: string
  cierre_ticket: string
  noc_cierre: string
  duracion: string
  parada_reloj: string
  duracion_sla: string
  area: string
  estado_ticket: string
  causa: string
  detalle: string
  detalle_evento: string
  cuando_usarlo: string
  zona: string
  tecnologia: string
  caida: string
  recuperacion: string
  estado: string
  seguimiento: string
  clasificacion: string
  codigo_local: string
  activa: boolean
  tracking_id?: number | null
  tracking_status?: string
  tipo?: string
  pext_pint?: string
  [key: string]: string | number | boolean | null | undefined
}

export type GeneralReportResponse = {
  data: GeneralReportRow[]
  meta: {
    total: number
    returned: number
    page: number
    per_page: number
    last_page: number
    truncated: boolean
    limit: number
    period: string
    period_label: string
    from: string | null
    to: string | null
  }
  columns: GeneralReportColumn[]
}

export type GeneralReportPeriod = 'today' | 'yesterday' | 'day' | 'range' | 'all'

export type GeneralReportEstado = '' | 'ACTIVO' | 'RECUPERADO'

export type GeneralReportMinedu =
  | 'CAIDA_ENLACE'
  | 'QUEJA'
  | 'REQUERIMIENTO'
  | 'SIN_RAZON'

export const GENERAL_MINEDU_OPTIONS: Array<{ value: GeneralReportMinedu; label: string }> = [
  { value: 'CAIDA_ENLACE', label: 'Caída de enlace' },
  { value: 'QUEJA', label: 'Queja' },
  { value: 'REQUERIMIENTO', label: 'Requerimiento' },
  { value: 'SIN_RAZON', label: 'Sin razón MINEDU' },
]
