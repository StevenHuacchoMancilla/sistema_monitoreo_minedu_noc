export type TicketeraStatus = 'ABIERTO' | 'CERRADO' | 'REVISAR'

export type TicketeraRow = {
  row: number
  ticket: string
  cid: string
  tss: string
  nombre: string
  provincia: string
  distrito: string
  energia: string
  codigo: string
  grupo: string
  atencion: string
  area: string
  minedu: string
  causa: string
  detalle: string
  open: string | null
  close: string | null
  open_text: string
  close_text: string
  status: TicketeraStatus
  source_status: string
  sla_seconds: number | null
  problems: string[]
}

export type TicketeraPayload = {
  now: string
  today: string
  refresh_seconds: number
  source: {
    spreadsheet_id: string
    sheet: string
    row_count: number
    fetched_at: string
  }
  audit: {
    read_rows: number
    affected_rows: number
    missing_minedu: number
    invalid_open: number
    invalid_close: number
    inverted_dates: number
    duplicate_tickets: number
  }
  warnings: Array<{ row: number; ticket: string; message: string }>
  warning_count: number
  rows: TicketeraRow[]
}

export type TicketeraPrtgOutage = {
  start: string
  end: string | null
  seconds: number
}

export type TicketeraTimeline = {
  source: 'prtg' | 'sheet'
  cid: string
  sensor: string | null
  sensor_name: string | null
  ignored_under_minute: number
  outages: TicketeraPrtgOutage[]
  message: string | null
}

export type TicketeraView = 'summary' | 'tickets' | 'quality'

export type TicketeraFilters = {
  from: string
  to: string
  mode: '24' | '8'
  criterion: 'opening' | 'overlap'
  provincia: string
  distrito: string
  energia: string
  grupo: string
  codigo: string
  minedu: string
  status: string
  area: string
  atencion: string
  search: string
}
