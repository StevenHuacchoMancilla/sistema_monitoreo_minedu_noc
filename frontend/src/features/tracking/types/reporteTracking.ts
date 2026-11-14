export type TrackingReportColumn = {
  key: string
  label: string
}

export type TrackingReportRow = {
  id: number
  status: string | null
  status_label: string | null
  is_closed: boolean
  n_incidente: number | null
  ticket: string | null
  tss: string | null
  cid: string | null
  descripcion: string | null
  apertura: string | null
  nombre_apertura: string | null
  codigo: string | null
  causa: string | null
  seguimiento: string
  cierre: string | null
  nombre_cierre: string | null
}

export type TrackingReportResponse = {
  data: TrackingReportRow[]
  meta: {
    total: number
    returned: number
    truncated: boolean
    limit: number
  }
  columns: TrackingReportColumn[]
}
