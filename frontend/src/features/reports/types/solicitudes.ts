export type SolicitudCaida = {
  id: number | string
  inicio: string
  fin: string | null
  duracion_segundos: number
  abierta: boolean
  estado: string | null
}

export type SolicitudColegio = {
  assignment_id: number
  school_id: number | null
  cid: string | null
  codigo_local: string | null
  local_educativo: string | null
  provincia: string | null
  distrito: string | null
  nodo_primario: string | null
  nodo_secundario: string | null
  prtg_sensor_id?: number | null
  prtg_error?: string | null
  fecha_activacion: string | null
  sin_caidas?: boolean
  activo_desde: string | null
  activo_segundos: number | null
  estado: string
  estado_label: string
  en_linea_desde: string | null
  en_linea_segundos: number | null
  caido_desde: string | null
  caido_segundos: number | null
  caidas_modo: 'semana' | 'mes' | 'ultima' | 'ninguna'
  caidas: SolicitudCaida[]
}

export type SolicitudesEnlaceResponse = {
  generated_at: string
  window_days: number
  total: number
  groups: Array<{
    key: string
    label: string
    hint: string
    total: number
    schools: SolicitudColegio[]
  }>
}
