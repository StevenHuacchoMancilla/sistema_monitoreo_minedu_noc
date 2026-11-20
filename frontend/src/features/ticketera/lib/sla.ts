import { limaDateKey } from '../../../lib/fechaHora'
import { fold } from './modelo'
import type { TicketeraRow, TicketeraStatus } from '../types/ticketera'

const DAY_MS = 86_400_000
const HOUR_MS = 3_600_000
export const SLA_VAC_START = Date.parse('2026-10-12T00:00:00-05:00')
export const SLA_VAC_END = Date.parse('2026-10-19T00:00:00-05:00')

export type SlaTipo = 'CAIDA' | 'QUEJA'

export type SlaPart = {
  row: TicketeraRow
  mes: string
  start: number | null
  end: number | null
  estado: TicketeraStatus
  valid: boolean
  total: number
  effective: number
  discount: number
  net: number
  part: number
  cid: string
  tipo: SlaTipo
  area: string
  limite: number | null
  areaError: boolean
  before: number | null
  after: number | null
  resultado: string
}

export type SlaVivo = {
  mes: string
  area: string
  consumido: number
  vacaciones: number
  saldo: number
  horaLectura: number
  error?: string
}

export function slaTipo(row: TicketeraRow): SlaTipo | '' {
  const value = fold(row.minedu)
  if (value === 'CAIDADEENLACE') return 'CAIDA'
  if (value === 'QUEJA') return 'QUEJA'
  return ''
}

export function slaNombre(tipo: SlaTipo | ''): string {
  if (tipo === 'QUEJA') return 'Queja'
  if (tipo === 'CAIDA') return 'Caída de Enlace'
  return 'Sin razón SLA'
}

export function slaArea(row: TicketeraRow): 'RURAL' | 'URBANA' | '' {
  const value = fold(row.area)
  return value === 'RURAL' || value === 'URBANA' ? value : ''
}

export function incidentKey(row: TicketeraRow): string {
  const ticket = row.ticket.trim()
  return `${row.cid.trim()}::${ticket && !ticket.startsWith('#') ? `T:${fold(ticket)}` : `F:${row.row}`}`
}

export function cidValid(row: TicketeraRow): boolean {
  const cid = row.cid.trim()
  return Boolean(cid) && fold(cid) !== 'NINGUNO' && !cid.startsWith('#')
}

function dayStart(key: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return null
  const value = Date.parse(`${key}T00:00:00-05:00`)
  return Number.isFinite(value) ? value : null
}

function monthKey(ms: number | null): string {
  if (ms == null) return 'SIN FECHA'
  const key = limaDateKey(ms)
  return key ? key.slice(0, 7) : 'SIN FECHA'
}

function nextMonth(mes: string): number | null {
  if (!/^\d{4}-\d{2}$/.test(mes)) return null
  const [year, month] = mes.split('-').map(Number)
  const nextYear = month === 12 ? year + 1 : year
  const next = month === 12 ? 1 : month + 1
  return Date.parse(`${nextYear}-${String(next).padStart(2, '0')}-01T00:00:00-05:00`)
}

function within(start: number, end: number, from: number, to: number): number {
  return Math.max(0, Math.min(end, to) - Math.max(start, from))
}

export function effectiveMillis(start: number, end: number): number {
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0
  const firstKey = limaDateKey(start)
  const first = firstKey ? dayStart(firstKey) : null
  if (first == null) return 0
  let sum = 0
  let count = 0
  for (let day = first; day < end && count < 36600; day += DAY_MS, count += 1) {
    sum += within(start, end, day + 8 * HOUR_MS, day + 16 * HOUR_MS)
  }
  return sum
}

function stamp(row: TicketeraRow, field: 'open' | 'close'): number | null {
  const value = row[field]
  if (!value) return null
  const ms = Date.parse(value)
  return Number.isFinite(ms) ? ms : null
}

function closedMetrics(row: TicketeraRow, now: number) {
  const open = stamp(row, 'open')
  const close = stamp(row, 'close')
  if (row.status !== 'CERRADO' || open == null || close == null || close < open || open > now || close > now) {
    return null
  }
  const effective = Math.round(effectiveMillis(open, close) / 1000)
  const vacStart = Math.max(open, SLA_VAC_START)
  const vacEnd = Math.min(close, SLA_VAC_END)
  const discount = vacEnd > vacStart ? Math.round(effectiveMillis(vacStart, vacEnd) / 1000) : 0
  return {
    total: Math.round((close - open) / 1000),
    effective,
    discount,
    net: Math.max(0, effective - discount),
  }
}

function rawParts(row: TicketeraRow, now: number): Omit<SlaPart, 'cid' | 'tipo' | 'area' | 'limite' | 'areaError' | 'before' | 'after' | 'resultado'>[] {
  const open = stamp(row, 'open')
  const close = stamp(row, 'close')
  const metrics = closedMetrics(row, now)
  const mes = monthKey(open)
  if (!metrics || open == null || close == null) {
    return [{
      row, mes, start: open, end: close, estado: row.status, valid: false,
      total: 0, effective: 0, discount: 0, net: 0, part: 0,
    }]
  }
  if (close === open) {
    return [{
      row, mes, start: open, end: close, estado: row.status, valid: true,
      total: 0, effective: 0, discount: 0, net: 0, part: 1,
    }]
  }
  const parts: Omit<SlaPart, 'cid' | 'tipo' | 'area' | 'limite' | 'areaError' | 'before' | 'after' | 'resultado'>[] = []
  let cursor = open
  while (cursor < close && parts.length < 1200) {
    const key = monthKey(cursor)
    const boundary = nextMonth(key)
    if (boundary == null || boundary <= cursor) break
    const end = Math.min(close, boundary)
    const effective = Math.round(effectiveMillis(cursor, end) / 1000)
    const vacStart = Math.max(cursor, SLA_VAC_START)
    const vacEnd = Math.min(end, SLA_VAC_END)
    const discount = vacEnd > vacStart ? Math.round(effectiveMillis(vacStart, vacEnd) / 1000) : 0
    parts.push({
      row, mes: key, start: cursor, end, estado: row.status, valid: true,
      total: Math.round((end - cursor) / 1000),
      effective, discount, net: Math.max(0, effective - discount),
      part: parts.length + 1,
    })
    cursor = end
  }
  return parts
}

export function slaLedger(rows: TicketeraRow[], nowIso: string): SlaPart[] {
  const now = Date.parse(nowIso)
  const clock = Number.isFinite(now) ? now : Date.now()
  const groups = new Map<string, SlaPart[]>()
  const parts: SlaPart[] = []
  for (const row of rows) {
    const tipo = slaTipo(row)
    if (!tipo) continue
    const cid = cidValid(row) ? row.cid.trim() : `SIN CID · FILA ${row.row}`
    for (const raw of rawParts(row, clock)) {
      const part: SlaPart = {
        ...raw,
        cid,
        tipo,
        area: '',
        limite: null,
        areaError: false,
        before: null,
        after: null,
        resultado: '',
      }
      const key = `${cid}|${part.mes}|${tipo}`
      const list = groups.get(key) ?? []
      list.push(part)
      groups.set(key, list)
      parts.push(part)
    }
  }
  for (const group of groups.values()) {
    const areas = new Set(group.map((part) => slaArea(part.row)).filter(Boolean))
    const area = areas.size === 1 ? [...areas][0] : ''
    const limite = area === 'RURAL' ? 36 : area === 'URBANA' ? 6 : null
    let rest = limite == null ? null : Math.round(limite * 3600)
    group.sort((a, b) => (a.start ?? Infinity) - (b.start ?? Infinity) || a.row.row - b.row.row || a.part - b.part)
    for (const part of group) {
      part.area = area
      part.limite = limite
      part.areaError = areas.size > 1
      part.before = rest
      if (part.mes === 'SIN FECHA') {
        part.before = null
        part.resultado = 'REVISAR FECHAS'
        continue
      }
      if (areas.size > 1 || limite == null) {
        part.resultado = 'REVISAR ÁREA'
        continue
      }
      if (part.estado === 'ABIERTO') {
        part.resultado = 'EN CURSO'
        continue
      }
      if (!part.valid || rest == null) {
        part.resultado = 'REVISAR FECHAS'
        continue
      }
      rest -= part.net
      part.after = rest
      part.resultado = rest < 0 ? 'EXCEDIDO' : 'DENTRO DEL SLA'
    }
  }
  return parts
}

export function slaEnCurso(rows: TicketeraRow[], nowIso: string, ledger: SlaPart[]): Map<string, SlaVivo> {
  const out = new Map<string, SlaVivo>()
  const now = Date.parse(nowIso)
  if (!Number.isFinite(now)) return out
  const mes = monthKey(now)
  const inicio = /^\d{4}-\d{2}$/.test(mes) ? Date.parse(`${mes}-01T00:00:00-05:00`) : null
  if (inicio == null || !Number.isFinite(inicio)) return out
  const cerrados = new Map<string, number>()
  for (const part of ledger) {
    if (part.valid && part.mes === mes && cidValid(part.row)) {
      const id = `${part.row.cid.trim()}|${part.tipo}`
      cerrados.set(id, (cerrados.get(id) ?? 0) + part.net)
    }
  }
  const abiertos = new Map<string, number>()
  const entradas: Array<{ key: string; cid: string; area: 'RURAL' | 'URBANA'; consumido: number; vacaciones: number }> = []
  const seen = new Set<string>()
  for (const row of rows) {
    const tipo = slaTipo(row)
    if (!tipo) continue
    const key = incidentKey(row)
    if (seen.has(key)) continue
    seen.add(key)
    if (row.status !== 'ABIERTO') continue
    const open = stamp(row, 'open')
    const area = slaArea(row)
    if (!cidValid(row) || !area || open == null || open > now) {
      out.set(key, {
        mes, area: area || '', consumido: 0, vacaciones: 0, saldo: 0, horaLectura: now,
        error: open == null || (open != null && open > now) ? 'Apertura pendiente de validar' : 'CID o área sin definir',
      })
      continue
    }
    const desde = Math.max(inicio, open)
    const bruto = now > desde ? Math.round(effectiveMillis(desde, now) / 1000) : 0
    const vacStart = Math.max(desde, SLA_VAC_START)
    const vacEnd = Math.min(now, SLA_VAC_END)
    const vacaciones = vacEnd > vacStart ? Math.round(effectiveMillis(vacStart, vacEnd) / 1000) : 0
    const consumido = Math.max(0, bruto - vacaciones)
    const id = `${row.cid.trim()}|${tipo}`
    abiertos.set(id, (abiertos.get(id) ?? 0) + consumido)
    entradas.push({ key, cid: id, area, consumido, vacaciones })
  }
  for (const item of entradas) {
    const limite = (item.area === 'RURAL' ? 36 : 6) * 3600
    out.set(item.key, {
      mes,
      area: item.area,
      consumido: item.consumido,
      vacaciones: item.vacaciones,
      saldo: limite - (cerrados.get(item.cid) ?? 0) - (abiertos.get(item.cid) ?? 0),
      horaLectura: now,
    })
  }
  return out
}

export function hmsSigned(hours: number | null): string {
  if (hours == null || !Number.isFinite(hours)) return '—'
  const sign = hours < 0 ? '-' : ''
  const total = Math.round(Math.abs(hours) * 3600)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return `${sign}${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function hmsFromSeconds(seconds: number | null): string {
  if (seconds == null || !Number.isFinite(seconds)) return '—'
  return hmsSigned(seconds / 3600)
}
