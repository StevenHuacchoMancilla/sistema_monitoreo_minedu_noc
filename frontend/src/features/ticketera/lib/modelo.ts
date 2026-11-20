import { limaDateKey } from '../../../lib/fechaHora'
import type { TicketeraFilters, TicketeraRow } from '../types/ticketera'

export const EMPTY = '__VACIO__'

export const FILTER_FIELDS = [
  'provincia',
  'distrito',
  'energia',
  'grupo',
  'codigo',
  'minedu',
  'status',
  'area',
  'atencion',
] as const

export type FilterField = (typeof FILTER_FIELDS)[number]

export const FILTER_LABELS: Record<FilterField, string> = {
  provincia: 'Todas las provincias',
  distrito: 'Todos los distritos',
  energia: 'Todas las fuentes de energía',
  grupo: 'Todos los grupos de causa',
  codigo: 'Todos los códigos',
  minedu: 'Todas las clasificaciones MINEDU',
  status: 'Todos los estados',
  area: 'Todas las áreas del local',
  atencion: 'Todas las áreas de atención',
}

export type Interval = { key: string; start: number; end: number }

export type PreparedRow = TicketeraRow & {
  openMs: number | null
  closeMs: number | null
  periodSeconds: number | null
  totalSeconds: number | null
}

export type GroupBar = {
  key: string
  label: string
  count: number
  cids: number
}

const DAY_MS = 86_400_000

export function defaultFilters(day: string): TicketeraFilters {
  return {
    from: day,
    to: day,
    mode: '24',
    criterion: 'opening',
    provincia: '',
    distrito: '',
    energia: '',
    grupo: '',
    codigo: '',
    minedu: '',
    status: '',
    area: '',
    atencion: '',
    search: '',
  }
}

export function fold(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
}

export function classify(row: TicketeraRow, field: FilterField): string {
  const value = String(row[field] ?? '').trim()
  if (!value || value.startsWith('#')) return EMPTY
  if (['codigo', 'grupo', 'minedu'].includes(field) && fold(value) === 'NINGUNO') return EMPTY
  return value
}

export function optionLabel(value: string): string {
  return value === EMPTY ? 'Sin clasificación' : value
}

export function latestDay(rows: TicketeraRow[], fallback: string): string {
  const dates = rows
    .map((row) => (row.open ? limaDateKey(row.open) : null))
    .filter((key): key is string => Boolean(key))
    .sort()
  return dates.at(-1) ?? fallback
}

export function historyRange(rows: TicketeraRow[], fallback: string): { from: string; to: string } {
  const dates = rows
    .map((row) => (row.open ? limaDateKey(row.open) : null))
    .filter((key): key is string => Boolean(key))
    .sort()
  return {
    from: dates[0] ?? fallback,
    to: dates.at(-1) ?? fallback,
  }
}

function dayStart(key: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return null
  const value = Date.parse(`${key}T00:00:00-05:00`)
  return Number.isFinite(value) ? value : null
}

export function buildIntervals(filters: TicketeraFilters): { intervals: Interval[]; error: string | null } {
  const first = dayStart(filters.from)
  const last = dayStart(filters.to)
  if (first == null || last == null) {
    return { intervals: [], error: 'Selecciona una fecha inicial y una fecha final.' }
  }
  if (last < first) {
    return { intervals: [], error: 'La fecha final es anterior a la inicial.' }
  }
  if ((last - first) / DAY_MS > 3660) {
    return { intervals: [], error: 'El rango máximo es de 10 años.' }
  }

  const work = filters.mode === '8'
  const intervals: Interval[] = []
  for (let day = first; day <= last; day += DAY_MS) {
    const key = limaDateKey(day)
    if (!key) continue
    intervals.push({
      key,
      start: day + (work ? 8 * 3_600_000 : 0),
      end: day + (work ? 16 * 3_600_000 : DAY_MS),
    })
  }
  return { intervals, error: null }
}

function rowEnd(row: PreparedRow, nowMs: number): number {
  return row.closeMs ?? nowMs
}

function overlaps(row: PreparedRow, interval: Interval, nowMs: number): boolean {
  if (row.status === 'REVISAR' || row.openMs == null) return false
  const end = rowEnd(row, nowMs)
  return end > row.openMs && row.openMs < interval.end && end > interval.start
}

export function prepare(
  source: TicketeraRow[],
  filters: TicketeraFilters,
  nowIso: string,
): { rows: PreparedRow[]; intervals: Interval[]; error: string | null } {
  const { intervals, error } = buildIntervals(filters)
  if (error) return { rows: [], intervals, error }

  const nowMs = Date.parse(nowIso)
  const clock = Number.isFinite(nowMs) ? nowMs : Date.now()
  const query = fold(filters.search)
  const active = filters.criterion === 'overlap'

  const rows = source
    .map((row) => {
      const openMs = row.open ? Date.parse(row.open) : Number.NaN
      const closeMs = row.close ? Date.parse(row.close) : Number.NaN
      const prepared: PreparedRow = {
        ...row,
        openMs: Number.isFinite(openMs) ? openMs : null,
        closeMs: Number.isFinite(closeMs) ? closeMs : null,
        periodSeconds: null,
        totalSeconds: null,
      }
      if (prepared.status !== 'REVISAR' && prepared.openMs != null) {
        const end = rowEnd(prepared, clock)
        let covered = 0
        for (const interval of intervals) {
          covered += Math.max(0, Math.min(end, interval.end) - Math.max(prepared.openMs, interval.start))
        }
        prepared.periodSeconds = Math.round(covered / 1000)
        prepared.totalSeconds = Math.max(0, Math.round((end - prepared.openMs) / 1000))
      }
      return prepared
    })
    .filter((row) => {
      const matches = FILTER_FIELDS.every((field) => {
        const selected = filters[field]
        return !selected || classify(row, field) === selected
      })
      if (!matches) return false
      if (query) {
        const haystack = fold([row.cid, row.tss].join(' '))
        if (!haystack.includes(query)) return false
      }
      if (active) return intervals.some((interval) => overlaps(row, interval, clock))
      return intervals.some(
        (interval) => row.openMs != null && row.openMs >= interval.start && row.openMs < interval.end,
      )
    })

  return { rows, intervals, error: null }
}

export function isEnergy(row: TicketeraRow): boolean {
  return /^G4(?:\D|$)/i.test(row.grupo.trim())
}

export function mineduBucket(row: TicketeraRow): 'queja' | 'caida' | 'req' | 'empty' | 'other' {
  const value = fold(row.minedu)
  if (!value || value === 'NINGUNO') return 'empty'
  if (value === 'QUEJA') return 'queja'
  if (value === 'CAIDADEENLACE' || value === 'AVERIA') return 'caida'
  if (value === 'REQUERIMIENTO' || value === 'REQUERIMEINTO') return 'req'
  return 'other'
}

export function kpis(rows: PreparedRow[]) {
  const cids = new Set<string>()
  let open = 0
  let closed = 0
  let review = 0
  let energy = 0
  let disconnect = 0
  let queja = 0
  let caida = 0
  let req = 0
  let missing = 0
  for (const row of rows) {
    if (row.cid.trim() && fold(row.cid) !== 'NINGUNO' && !row.cid.startsWith('#')) cids.add(row.cid.trim())
    if (row.status === 'ABIERTO') open += 1
    if (row.status === 'CERRADO') closed += 1
    if (row.status === 'REVISAR') review += 1
    if (isEnergy(row)) energy += 1
    if (fold(row.codigo) === 'CR45') disconnect += 1
    const bucket = mineduBucket(row)
    if (bucket === 'queja') queja += 1
    else if (bucket === 'caida') caida += 1
    else if (bucket === 'req') req += 1
    else if (bucket === 'empty') missing += 1
  }
  return {
    total: rows.length,
    cids: cids.size,
    open,
    closed,
    review,
    energy,
    disconnect,
    queja,
    caida,
    req,
    missing,
  }
}

export function dailyPoints(intervals: Interval[], rows: PreparedRow[], criterion: TicketeraFilters['criterion'], nowIso: string) {
  const nowMs = Date.parse(nowIso)
  const clock = Number.isFinite(nowMs) ? nowMs : Date.now()
  const overlapMode = criterion === 'overlap'
  return intervals.map((interval) => ({
    key: interval.key,
    label: `${interval.key.slice(8, 10)}/${interval.key.slice(5, 7)}`,
    count: rows.filter((row) =>
      overlapMode
        ? overlaps(row, interval, clock)
        : row.openMs != null && row.openMs >= interval.start && row.openMs < interval.end,
    ).length,
  }))
}

const REASON_COLORS = ['#5b78ff', '#16b7c4', '#f5a33b', '#9971ec', '#e963a7', '#24bd94', '#f4c34a', '#468ddd', '#ef795f']

export function reasonSlices(rows: PreparedRow[]) {
  return grouped(rows, 'minedu').map((group, index) => ({
    key: group.key,
    label: group.label,
    count: group.count,
    color: REASON_COLORS[index % REASON_COLORS.length],
  }))
}

export function grouped(rows: PreparedRow[], field: FilterField): GroupBar[] {
  const map = new Map<string, { key: string; label: string; count: number; cids: Set<string> }>()
  for (const row of rows) {
    const key = classify(row, field)
    const current = map.get(key) ?? {
      key,
      label: optionLabel(key),
      count: 0,
      cids: new Set<string>(),
    }
    current.count += 1
    if (row.cid.trim() && fold(row.cid) !== 'NINGUNO') current.cids.add(row.cid.trim())
    map.set(key, current)
  }
  return [...map.values()]
    .map((group) => ({ key: group.key, label: group.label, count: group.count, cids: group.cids.size }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'es'))
}

export function fieldOptions(rows: TicketeraRow[], field: FilterField): string[] {
  const values = new Set(rows.map((row) => classify(row, field)))
  return [...values].sort((a, b) => {
    if (a === EMPTY) return 1
    if (b === EMPTY) return -1
    return a.localeCompare(b, 'es', { numeric: true })
  })
}

export function dayLabel(key: string): string {
  const [year, month, day] = key.split('-')
  return year && month && day ? `${day}/${month}/${year}` : key
}
