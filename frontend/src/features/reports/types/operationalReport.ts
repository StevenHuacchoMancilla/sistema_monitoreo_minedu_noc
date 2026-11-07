export type ManagementClassification =
  | 'NEW_OUTAGE'
  | 'CONTACT_CONFIRMED'
  | 'LINK_OUTAGE'
  | 'NO_RESPONSE'
  | 'COMPLAINT'
  | 'UNCLASSIFIED'

export type ManagementScope = 'PEXT' | 'PINT'

export type MineduReason = 'CAIDA_ENLACE' | 'CAIDA_ENERGIA' | 'REQUERIMIENTO' | 'QUEJA'

export type ListaLleeEstado =
  | 'Averias'
  | 'Descartes en curso'
  | 'Sin respuesta'
  | 'Equipos apagados'
  | 'Energia'
  | 'Restablecido'
  | 'Requerimiento'
  | 'Enlace parcial'
  | 'Activo'

/** Fila canónica compartida por operativo, preview y XLSX (modelo LISTA DE LLEE). */
export type ReportRow = {
  n: number | null
  ordinal: number
  incident_id: number
  cid: string | null
  local_educativo: string | null
  presentacion_nombre_prtg: string | null
  estado_prtg?: '✔' | '✖' | string | null
  lista_estado?: ListaLleeEstado | string | null
  lista_estado_tone?: string | null
  lista_estado_group?: string | null
  root_cause_code?: string | null
  root_cause?: string | null
  outage_at: string | null
  caida: string | null
  caida_source?: string | null
  tipo: string | null
  technology_type?: string | null
  detalle: string | null
  pext_pint: string | null
  provincia: string | null
  distrito: string | null
  zona?: string | null
  codigo_local: string | null
  clasificacion?: string | null
  capacidad?: number | string | null
  management_classification: ManagementClassification | null
  management_classification_label: string | null
  minedu_reason?: MineduReason | string | null
  color_key: string
  followup_status: string | null
  started_at: string | null
  recovered_at: string | null
  activa: boolean
}

export type ResumenPrtgGroup = {
  estado: string
  group: string
  tone: string
  up: number
  down: number
  total: number
  cids_up: string[]
  cids_down: string[]
}

export type ResumenPrtg = {
  date: string
  title: string
  groups: ResumenPrtgGroup[]
  caidos_subtotal: { up: number; down: number; total: number }
  by_root_cause: Array<{
    code: string
    cause: string
    estado?: string
    up: number
    down: number
    total: number
    cids_up: string[]
    cids_down: string[]
  }>
  by_zona?: Array<{ zona: string; up: number; down: number; total: number }>
  totals: { up: number; down: number; all: number }
  legend: { up: string; down: string; total?: string }
}

/** @deprecated usar ReportRow */
export type OperationalReportRow = ReportRow

export type OperationalReportResponse = {
  rows: ReportRow[]
  total: number
  legend: Array<{ key: string; color: string; label: string }>
  filters_applied: Record<string, unknown>
  columns?: string[]
  lista_estados?: Array<{ value: string; label: string; group: string; tone: string }>
  zonas?: string[]
  resumen_prtg?: ResumenPrtg
}

export type ClosingPreviewResponse = {
  total: number
  rows: ReportRow[]
  note: string
  columns?: string[]
}

export type ManagementPayload = {
  /** Derivada en backend desde minedu_reason. */
  classification?: 'CONTACT_CONFIRMED' | 'LINK_OUTAGE' | 'NO_RESPONSE' | 'COMPLAINT' | null
  scope?: ManagementScope | '' | null
  outage_text?: string | null
  detail?: string | null
  observation?: string | null
  contact_id?: number | null
  /** Sin persona: gestión por descartes técnicos. */
  contact_via_descartes?: boolean
  contact_attempted_at?: string | null
  root_cause_group_code?: string | null
  root_cause_code?: string | null
  cause?: string | null
  minedu_reason?: MineduReason | '' | null
}

/** Filas del reporte: contraste por razón MINEDU / estado lista. */
export const CLASSIFICATION_ROW_CLASS: Record<string, string> = {
  red: 'bg-red-100/90 border-l-4 border-red-600',
  orange: 'bg-orange-100/90 border-l-4 border-orange-500',
  yellow: 'bg-yellow-100/90 border-l-4 border-yellow-500',
  amber: 'bg-amber-100/90 border-l-4 border-amber-500',
  blue: 'bg-blue-50 border-l-4 border-blue-500',
  violet: 'bg-violet-50 border-l-4 border-violet-500',
  cyan: 'bg-cyan-50 border-l-4 border-cyan-500',
  green: 'bg-emerald-50 border-l-4 border-emerald-500',
  slate: 'bg-slate-50 border-l-4 border-slate-300',
}

export const CLASSIFICATION_BADGE_CLASS: Record<string, string> = {
  red: 'bg-red-600 text-white ring-1 ring-red-700/30',
  orange: 'bg-orange-500 text-white ring-1 ring-orange-700/30',
  yellow: 'bg-yellow-400 text-yellow-950 ring-1 ring-yellow-600/40',
  amber: 'bg-amber-400 text-amber-950 ring-1 ring-amber-600/40',
  blue: 'bg-blue-100 text-blue-800',
  violet: 'bg-violet-100 text-violet-800',
  cyan: 'bg-cyan-100 text-cyan-800',
  green: 'bg-emerald-100 text-emerald-800',
  slate: 'bg-slate-100 text-slate-700',
}

export const LISTA_ESTADO_BADGE: Record<string, string> = {
  Averias: 'bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-300',
  'Descartes en curso': 'bg-orange-100 text-orange-900 dark:bg-orange-500/20 dark:text-orange-300',
  'Sin respuesta': 'bg-yellow-100 text-yellow-900 dark:bg-yellow-500/20 dark:text-yellow-200',
  'Equipos apagados': 'bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-200',
  Energia: 'bg-amber-200 text-amber-950 dark:bg-amber-500/25 dark:text-amber-100',
  Restablecido: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300',
  Requerimiento: 'bg-violet-100 text-violet-800 dark:bg-violet-500/20 dark:text-violet-300',
  'Enlace parcial': 'bg-cyan-100 text-cyan-800 dark:bg-cyan-500/20 dark:text-cyan-300',
  Activo: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
}

export function techTypeBadgeClass(tipo?: string | null): string {
  const t = (tipo ?? '').toUpperCase()
  if (t === 'GPON') return 'bg-cyan-50 text-cyan-700 ring-1 ring-cyan-600/20'
  if (t === 'P2P') return 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-600/20'
  return 'bg-slate-100 text-slate-700 ring-1 ring-slate-500/15'
}

export function formatOutageDisplay(row: Pick<ReportRow, 'outage_at' | 'caida'>): { date: string; time?: string } {
  if (row.outage_at) {
    const d = new Date(row.outage_at)
    if (!Number.isNaN(d.getTime())) {
      return {
        date: d.toLocaleDateString('es-PE', { timeZone: 'America/Lima', day: '2-digit', month: '2-digit', year: 'numeric' }),
        time: d.toLocaleTimeString('es-PE', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit', hour12: false }),
      }
    }
  }
  return { date: row.caida ?? '—' }
}
