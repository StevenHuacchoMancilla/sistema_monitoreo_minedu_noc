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
  report_date?: string
  is_today?: boolean
  available_dates?: string[]
}

export type ClosingPreviewResponse = {
  total: number
  rows: ReportRow[]
  note: string
  columns?: string[]
}

export type ManagementPayload = {
  /** Derivada en backend desde minedu_reason. */
  classification?: 'CONTACT_CONFIRMED' | 'LINK_OUTAGE' | 'NO_RESPONSE' | 'COMPLAINT' | 'FOLLOW_UP' | null
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
  stone: 'bg-stone-700/90 border-l-4 border-stone-800 text-stone-50',
  white: 'bg-white border-l-4 border-slate-200',
}

/** Orden Excel de ESTADO (LISTA DE LLEE). */
export const LISTA_ESTADO_OPTIONS: ListaLleeEstado[] = [
  'Averias',
  'Descartes en curso',
  'Sin respuesta',
  'Equipos apagados',
  'Energia',
  'Requerimiento',
  'Enlace parcial',
  'Restablecido',
  'Activo',
]

export const LISTA_ESTADO_CARD: Record<
  string,
  { soft: string; dot: string; text?: string }
> = {
  Averias: {
    soft: 'bg-red-100 border-red-200 dark:bg-red-950/40 dark:border-red-800',
    dot: 'bg-red-500',
  },
  'Descartes en curso': {
    soft: 'bg-amber-100 border-amber-200 dark:bg-amber-950/40 dark:border-amber-800',
    dot: 'bg-amber-500',
  },
  'Sin respuesta': {
    soft: 'bg-sky-100 border-sky-200 dark:bg-sky-950/40 dark:border-sky-800',
    dot: 'bg-sky-500',
  },
  'Equipos apagados': {
    soft: 'bg-violet-100 border-violet-200 dark:bg-violet-950/40 dark:border-violet-800',
    dot: 'bg-violet-500',
  },
  Energia: {
    soft: 'bg-orange-100 border-orange-200 dark:bg-orange-950/40 dark:border-orange-800',
    dot: 'bg-orange-400',
  },
  Requerimiento: {
    soft: 'bg-slate-100 border-slate-200 dark:bg-slate-800/60 dark:border-slate-600',
    dot: 'bg-slate-500',
  },
  'Enlace parcial': {
    soft: 'bg-stone-700 border-stone-800 text-stone-50 dark:bg-stone-800 dark:border-stone-600',
    dot: 'bg-stone-300',
    text: 'text-stone-50',
  },
  Restablecido: {
    soft: 'bg-emerald-100 border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-800',
    dot: 'bg-emerald-500',
  },
  Activo: {
    soft: 'bg-white border-slate-200 dark:bg-slate-900 dark:border-slate-700',
    dot: 'bg-slate-400',
  },
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
  'Descartes en curso': 'bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-300',
  'Sin respuesta': 'bg-sky-100 text-sky-900 dark:bg-sky-500/20 dark:text-sky-200',
  'Equipos apagados': 'bg-violet-100 text-violet-900 dark:bg-violet-500/20 dark:text-violet-200',
  Energia: 'bg-orange-100 text-orange-950 dark:bg-orange-500/25 dark:text-orange-100',
  Restablecido: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300',
  Requerimiento: 'bg-slate-100 text-slate-800 dark:bg-slate-500/20 dark:text-slate-200',
  'Enlace parcial': 'bg-stone-700 text-stone-50 dark:bg-stone-600 dark:text-stone-50',
  Activo: 'bg-white text-slate-800 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-100 dark:ring-slate-700',
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
