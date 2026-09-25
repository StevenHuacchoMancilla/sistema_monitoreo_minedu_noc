export type GeneralReportColumn = {
  key: string
  label: string
}

export type GeneralReportRow = {
  n: number
  incident_id: number
  cid: string | null
  local_educativo: string | null
  provincia: string | null
  distrito: string | null
  tecnologia: string | null
  caida: string | null
  recuperacion: string | null
  estado: string
  seguimiento: string
  clasificacion: string
  tipo: string
  causa: string
  detalle: string
  pext_pint: string
  ticket: string
  tracking_status: string
  codigo_local: string | null
  activa: boolean
  tracking_id: number | null
}

export type GeneralReportResponse = {
  data: GeneralReportRow[]
  meta: {
    total: number
    returned: number
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
