export type ManagementClassification =
  | 'NEW_OUTAGE'
  | 'CONTACT_CONFIRMED'
  | 'NO_RESPONSE'
  | 'COMPLAINT'
  | 'UNCLASSIFIED'

export type ManagementScope = 'PEXT' | 'PINT'

/** Fila canónica compartida por operativo, preview y XLSX. */
export type ReportRow = {
  n: number | null
  ordinal: number
  incident_id: number
  cid: string | null
  local_educativo: string | null
  presentacion_nombre_prtg: string | null
  outage_at: string | null
  caida: string | null
  caida_source?: string | null
  tipo: string | null
  technology_type?: string | null
  detalle: string | null
  pext_pint: string | null
  provincia: string | null
  distrito: string | null
  codigo_local: string | null
  management_classification: ManagementClassification | null
  management_classification_label: string | null
  color_key: string
  followup_status: string | null
  started_at: string | null
  recovered_at: string | null
  activa: boolean
}

/** @deprecated usar ReportRow */
export type OperationalReportRow = ReportRow

export type OperationalReportResponse = {
  rows: ReportRow[]
  total: number
  legend: Array<{ key: string; color: string; label: string }>
  filters_applied: Record<string, unknown>
  columns?: string[]
}

export type ClosingPreviewResponse = {
  total: number
  rows: ReportRow[]
  note: string
  columns?: string[]
}

export type ManagementPayload = {
  classification: Exclude<ManagementClassification, 'NEW_OUTAGE' | 'UNCLASSIFIED'>
  scope?: ManagementScope | '' | null
  outage_text?: string | null
  detail?: string | null
  observation?: string | null
  contact_id?: number | null
  contact_attempted_at?: string | null
}

export const CLASSIFICATION_ROW_CLASS: Record<string, string> = {
  yellow: 'bg-amber-50 border-l-4 border-amber-400',
  red: 'bg-red-50 border-l-4 border-red-500',
  orange: 'bg-orange-50 border-l-4 border-orange-400',
  blue: 'bg-blue-50 border-l-4 border-blue-500',
  slate: 'bg-slate-50 border-l-4 border-slate-300',
}

export const CLASSIFICATION_BADGE_CLASS: Record<string, string> = {
  yellow: 'bg-amber-100 text-amber-900',
  red: 'bg-red-100 text-red-800',
  orange: 'bg-orange-100 text-orange-900',
  blue: 'bg-blue-100 text-blue-800',
  slate: 'bg-slate-100 text-slate-700',
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
