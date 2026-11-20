export type ExcelGooglePeriodo = 'hoy' | 'desde' | 'rango'

export type ExcelGoogleFila = {
  cid: string
  tss: number | string | null
  local_educativo: string
  provincia: string
  distrito: string
  tecnologia: string
  energy_type: string
  caido_desde: string
  restablecido_en?: string
  incident_id: number | null
  fila?: number
  ticket?: string
  estado_ticket?: string
  razon_minedu?: string | null
  en_horario?: boolean
  nota?: string | null
}

export type ExcelGoogleComparacion = {
  desde_fila: number
  header_row: number
  ultima_fila: number
  filas_con_cid: number
  cids_desde_fila: number
  caidas_prtg: number
  ya_en_excel: ExcelGoogleFila[]
  faltan: ExcelGoogleFila[]
  abiertos_sin_caida: ExcelGoogleFila[]
  texto_cid: string
  texto_tss: string
  periodo: ExcelGooglePeriodo
  periodo_desde: string
  periodo_hasta: string | null
  leido_en: string
  hoja: string
}
