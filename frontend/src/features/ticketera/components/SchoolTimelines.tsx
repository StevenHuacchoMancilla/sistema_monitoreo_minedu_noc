import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { SectionCard } from '../../../components/ui/Card'
import { FormField, Input, Select } from '../../../components/ui/FormControls'
import { Button } from '../../../components/ui/Button'
import type { TicketeraRow } from '../types/ticketera'

const DAY = 86_400_000
const MIN_BAR = 7

type Lane = {
  row: TicketeraRow
  openMs: number
  closeMs: number | null
  endMs: number
  before: boolean
  after: boolean
  openEnded: boolean
}

type InvalidLane = { row: TicketeraRow; reason: string }

type Hover = {
  title: string
  lines: string[]
}

function dayStart(key: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return null
  const value = Date.parse(`${key}T00:00:00-05:00`)
  return Number.isFinite(value) ? value : null
}

function clock(ms: number): string {
  return new Intl.DateTimeFormat('es-PE', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(ms))
}

function hms(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—'
  const total = Math.round(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function tickStep(span: number): number {
  const steps = [
    1000, 5000, 15000, 30000, 60000, 5 * 60000, 15 * 60000, 30 * 60000,
    3600000, 3 * 3600000, 6 * 3600000, 12 * 3600000, DAY, 7 * DAY, 30 * DAY,
  ]
  return steps.find((step) => span / step <= 8) ?? 30 * DAY
}

function tickLabel(ms: number, span: number): string {
  const parts = new Intl.DateTimeFormat('es-PE', {
    timeZone: 'America/Lima',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: span <= 20 * 60000 ? '2-digit' : undefined,
    hourCycle: 'h23',
  }).formatToParts(new Date(ms))
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? ''
  if (span > 3 * DAY) return `${get('day')}/${get('month')}`
  if (span > 12 * 3600000) return `${get('day')}/${get('month')} ${get('hour')}:${get('minute')}`
  const seconds = span <= 20 * 60000 ? `:${get('second')}` : ''
  return `${get('hour')}:${get('minute')}${seconds}`
}

function labelOf(row: TicketeraRow): string {
  const ticket = row.ticket.trim() || 'Sin ticket'
  return `${ticket} · fila ${row.row}`
}

export function SchoolTimelines({
  rows,
  cid,
  onCidChange,
  from,
  to,
  now,
  rankingRows,
}: {
  rows: TicketeraRow[]
  cid: string
  onCidChange: (cid: string) => void
  from: string
  to: string
  now: string
  rankingRows: number | null
}) {
  const [query, setQuery] = useState('')
  const [view, setView] = useState<{ start: number; end: number } | null>(null)
  const [hover, setHover] = useState<Hover | null>(null)
  const [focusRow, setFocusRow] = useState<number | null>(null)

  const nowMs = Number.isFinite(Date.parse(now)) ? Date.parse(now) : Date.now()
  const rangeStart = dayStart(from)
  const rangeEnd = dayStart(to) == null ? null : (dayStart(to) as number) + DAY

  useEffect(() => {
    setView(null)
    setFocusRow(null)
    setHover(null)
  }, [cid, from, to])

  const schools = useMemo(() => {
    const map = new Map<string, { cid: string; name: string; tss: string }>()
    for (const row of rows) {
      const key = row.cid.trim()
      if (!key || key.startsWith('#') || key.toUpperCase() === 'NINGUNO') continue
      const current = map.get(key) ?? { cid: key, name: row.nombre, tss: row.tss }
      if (!current.name && row.nombre) current.name = row.nombre
      map.set(key, current)
    }
    return [...map.values()].sort((a, b) => a.cid.localeCompare(b.cid, 'es', { numeric: true }))
  }, [rows])

  const filteredSchools = schools.filter((school) => {
    const text = query.trim().toUpperCase()
    if (!text || school.cid === cid) return true
    return `${school.cid} ${school.name} ${school.tss}`.toUpperCase().includes(text)
  })

  const school = schools.find((item) => item.cid === cid)

  const model = useMemo(() => {
    if (!cid || rangeStart == null || rangeEnd == null) {
      return { lanes: [] as Lane[], invalid: [] as InvalidLane[], observed: 0, future: 0, down: 0 }
    }
    const lanes: Lane[] = []
    const invalid: InvalidLane[] = []
    for (const row of rows) {
      if (row.cid.trim() !== cid) continue
      const openMs = row.open ? Date.parse(row.open) : Number.NaN
      const closeMs = row.close ? Date.parse(row.close) : Number.NaN
      const hasClose = Number.isFinite(closeMs)
      if (!Number.isFinite(openMs)) {
        invalid.push({ row, reason: 'Apertura vacía o no interpretable' })
        continue
      }
      if (row.close_text.trim() && !hasClose) {
        invalid.push({ row, reason: 'Cierre no interpretable' })
        continue
      }
      if (hasClose && closeMs < openMs) {
        invalid.push({ row, reason: 'Cierre anterior a la apertura' })
        continue
      }
      const endMs = hasClose ? closeMs : nowMs
      if (endMs <= openMs) {
        invalid.push({ row, reason: 'Duración cero o negativa' })
        continue
      }
      if (openMs >= rangeEnd || endMs <= rangeStart) continue
      lanes.push({
        row,
        openMs,
        closeMs: hasClose ? closeMs : null,
        endMs,
        before: openMs < rangeStart,
        after: endMs > rangeEnd || (hasClose && closeMs > nowMs),
        openEnded: !hasClose,
      })
    }
    lanes.sort((a, b) => a.openMs - b.openMs || a.row.row - b.row.row)

    const observedStart = rangeStart
    const observedEnd = Math.max(rangeStart, Math.min(rangeEnd, nowMs))
    const ranges = lanes
      .map((lane) => ({
        start: Math.max(observedStart, lane.openMs),
        end: Math.min(observedEnd, lane.closeMs ?? nowMs),
      }))
      .filter((range) => range.end > range.start)
      .sort((a, b) => a.start - b.start)
    const merged: Array<{ start: number; end: number }> = []
    for (const range of ranges) {
      const last = merged[merged.length - 1]
      if (last && range.start <= last.end) last.end = Math.max(last.end, range.end)
      else merged.push({ ...range })
    }
    const down = merged.reduce((sum, range) => sum + (range.end - range.start), 0)
    return {
      lanes,
      invalid,
      observed: Math.max(0, observedEnd - observedStart),
      future: Math.max(0, rangeEnd - observedEnd),
      down,
    }
  }, [rows, cid, rangeStart, rangeEnd, nowMs])

  if (rangeStart == null || rangeEnd == null) return null

  const full = { start: rangeStart, end: rangeEnd }
  const timeWindow = view ?? full
  const span = Math.max(1000, timeWindow.end - timeWindow.start)
  const width = 1120
  const left = 168
  const right = 16
  const plot = width - left - right
  const xOf = (ms: number) => left + ((ms - timeWindow.start) / span) * plot

  function setWindow(start: number, end: number) {
    const minSpan = 60_000
    let nextStart = start
    let nextEnd = end
    if (nextEnd - nextStart < minSpan) {
      const mid = (nextStart + nextEnd) / 2
      nextStart = mid - minSpan / 2
      nextEnd = mid + minSpan / 2
    }
    nextStart = Math.max(full.start, nextStart)
    nextEnd = Math.min(full.end, nextEnd)
    if (nextEnd - nextStart < minSpan) {
      if (nextStart <= full.start) nextEnd = Math.min(full.end, nextStart + minSpan)
      else nextStart = Math.max(full.start, nextEnd - minSpan)
    }
    setView({ start: nextStart, end: nextEnd })
  }

  function zoom(factor: number) {
    const mid = (timeWindow.start + timeWindow.end) / 2
    const next = span * factor
    setWindow(mid - next / 2, mid + next / 2)
  }

  function pan(fraction: number) {
    const delta = span * fraction
    setWindow(timeWindow.start + delta, timeWindow.end + delta)
  }

  function focusLane(lane: Lane) {
    const pad = Math.max(15 * 60_000, (lane.endMs - lane.openMs) * 0.35)
    setFocusRow(lane.row.row)
    setWindow(lane.openMs - pad, lane.endMs + pad)
    const lines = detailLines(lane)
    setHover({ title: labelOf(lane.row), lines })
  }

  function detailLines(lane: Lane): string[] {
    const visibleStart = Math.max(timeWindow.start, rangeStart, lane.openMs)
    const visibleEnd = Math.min(timeWindow.end, rangeEnd, lane.endMs, nowMs)
    const inRange = Math.max(0, Math.min(rangeEnd, lane.endMs, nowMs) - Math.max(rangeStart, lane.openMs))
    const next = model.lanes.find((item) => item.openMs > (lane.closeMs ?? lane.endMs))
    const othersOpen = model.lanes.some((item) => {
      if (item.row.row === lane.row.row || lane.closeMs == null || next == null) return false
      return item.openMs < next.openMs && item.endMs > lane.closeMs
    })
    return [
      `CID ${cid}${school?.name ? ` · ${school.name}` : ''}`,
      `Apertura: ${clock(lane.openMs)}${lane.before ? ' · empezó antes del rango' : ''}`,
      lane.closeMs == null ? 'Cierre: Sin cierre' : `Cierre registrado: ${clock(lane.closeMs)}${lane.closeMs > nowMs ? ' · posterior a la última lectura' : ''}`,
      `Duración del ticket: ${hms((lane.closeMs ?? nowMs) - lane.openMs)}`,
      `Dentro del rango observado: ${hms(inRange)}`,
      `En la ventana visible: ${hms(Math.max(0, visibleEnd - visibleStart))}`,
      lane.after ? 'La barra dibujada está recortada al rango o a la última lectura.' : 'La barra usa la duración real dentro de lo observado.',
      next
        ? `Siguiente apertura del CID: ${clock(next.openMs)} · espera ${hms(next.openMs - (lane.closeMs ?? nowMs))}${next.openMs >= rangeEnd ? ' · fuera del rango' : ''}${othersOpen ? ' · hay otros tickets activos, no es servicio confirmado' : ''}`
        : 'No hay una apertura posterior en los datos de este CID.',
      `Estado: ${lane.row.status}`,
      lane.row.problems.length ? lane.row.problems.join(' · ') : 'Sin observaciones de fecha',
    ]
  }

  const axis = (() => {
    const step = tickStep(span)
    const ticks: number[] = []
    const first = Math.ceil(timeWindow.start / step) * step
    for (let tick = first; tick < timeWindow.end; tick += step) ticks.push(tick)
    return ticks
  })()

  const laneH = 28
  const ganttH = Math.max(160, 36 + model.lanes.length * laneH + 28)
  const up = Math.max(0, model.observed - model.down)
  const pct = model.observed ? (up / model.observed) * 100 : null

  const events = model.lanes.flatMap((lane) => {
    const items: Array<{ ms: number; kind: 'open' | 'close'; lane: Lane }> = []
    if (lane.openMs >= timeWindow.start && lane.openMs < timeWindow.end && lane.openMs <= nowMs) {
      items.push({ ms: lane.openMs, kind: 'open', lane })
    }
    if (lane.closeMs != null && lane.closeMs <= nowMs && lane.closeMs >= timeWindow.start && lane.closeMs < timeWindow.end) {
      items.push({ ms: lane.closeMs, kind: 'close', lane })
    }
    return items
  })
  const grouped = new Map<string, typeof events>()
  for (const event of events) {
    const key = `${event.kind}-${Math.round(event.ms / 1000)}`
    grouped.set(key, [...(grouped.get(key) ?? []), event])
  }

  return (
    <SectionCard
      title="Disponibilidad del colegio"
      action={<span className="text-xs text-slate-500">Rango completo, sin recorte de 08:00–16:00</span>}
    >
      <div className="mb-3 grid gap-3 lg:grid-cols-2">
        <FormField label="Buscar por CID, TSS o nombre">
          <Input value={query} placeholder="CID o nombre del colegio" onChange={(event) => setQuery(event.target.value)} />
        </FormField>
        <FormField label="Colegio de las gráficas">
          <Select value={cid} onChange={(event) => onCidChange(event.target.value)}>
            <option value="">Selecciona un colegio</option>
            {filteredSchools.map((item) => (
              <option key={item.cid} value={item.cid}>
                {item.cid} · {item.name || `TSS ${item.tss || '—'}`}
              </option>
            ))}
          </Select>
        </FormField>
      </div>

      {!cid || !school ? (
        <p className="py-8 text-center text-sm text-slate-500">Elige un colegio del ranking o búscalo aquí. Las dos gráficas usan solo ese CID.</p>
      ) : (
        <div className="space-y-4">
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
            CID {school.cid} · {school.name || `TSS ${school.tss || '—'}`}
          </p>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="Disponibilidad estimada" value={pct == null ? '—' : `${pct.toFixed(2)}%`} tone="ok" />
            <Metric label="Horas sin caída registrada" value={`${(up / 3600000).toFixed(2)} h`} tone="ok" />
            <Metric label="Horas de caída" value={`${(model.down / 3600000).toFixed(2)} h`} tone="down" />
            <Metric label="Tickets válidos en el rango" value={String(model.lanes.length)} />
          </div>
          <p className="text-xs leading-relaxed text-slate-500">
            El tiempo sin tickets activos es una disponibilidad estimada con la ticketera, no una medición de PRTG.
            Las horas unen intervalos simultáneos para no contar dos veces el mismo tiempo. Las barras no se fusionan: cada fila sigue siendo una incidencia.
            Periodo observado {(model.observed / 3600000).toFixed(2)} h · futuro excluido {(model.future / 3600000).toFixed(2)} h.
            {rankingRows != null && rankingRows !== model.lanes.length
              ? ` El ranking muestra ${rankingRows} incidencias de este CID con los filtros del reporte; estas gráficas usan ${model.lanes.length} tickets del CID en las 24 horas del rango, aunque hayan empezado antes.`
              : ' Estas gráficas no usan el horario 08:00–16:00 ni el Top del ranking.'}
          </p>
          {model.invalid.length ? (
            <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
              {model.invalid.length} registros del CID no se dibujan: {model.invalid.map((item) => `fila ${item.row.row} (${item.reason})`).join('; ')}.
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => zoom(0.5)}>Acercar</Button>
            <Button variant="secondary" onClick={() => zoom(2)}>Alejar</Button>
            <Button variant="secondary" onClick={() => pan(-0.35)}>Anterior</Button>
            <Button variant="secondary" onClick={() => pan(0.35)}>Siguiente</Button>
            <Button variant="secondary" onClick={() => { setView(null); setFocusRow(null) }}>Restablecer rango</Button>
            <FormField label="Acercar un ticket" className="min-w-56 flex-1">
              <Select
                value={focusRow == null ? '' : String(focusRow)}
                onChange={(event) => {
                  const lane = model.lanes.find((item) => item.row.row === Number(event.target.value))
                  if (lane) focusLane(lane)
                }}
              >
                <option value="">Selecciona una incidencia</option>
                {model.lanes.map((lane) => (
                  <option key={lane.row.row} value={lane.row.row}>{labelOf(lane.row)}</option>
                ))}
              </Select>
            </FormField>
          </div>
          <div className="flex flex-wrap gap-4 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-rose-500" /> Incidencia</span>
            <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-rose-500" /> Apertura · −1</span>
            <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Cierre registrado · +1</span>
            <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-slate-400" /> Sin cierre</span>
          </div>

          <ChartFrame
            title="Intervalos de caída por incidencia"
            note="Una sola línea de tiempo. Cada carril es una incidencia. El trazo mínimo de una caída de segundos no representa su duración: el horario real está en el detalle."
            onWheel={(delta) => zoom(delta > 0 ? 1.25 : 0.8)}
          >
            {model.lanes.length === 0 ? (
              <p className="px-3 py-8 text-center text-sm text-slate-500">Este colegio no tiene incidencias válidas dentro del rango.</p>
            ) : (
              <svg width={width} height={ganttH} role="img" aria-label="Intervalos de caída del colegio" className="text-slate-500">
                {axis.map((tick) => (
                  <g key={tick}>
                    <line x1={xOf(tick)} x2={xOf(tick)} y1={28} y2={ganttH - 8} stroke="currentColor" strokeOpacity={0.25} />
                    <text x={xOf(tick)} y={18} textAnchor="middle" fontSize={10} fill="currentColor">{tickLabel(tick, span)}</text>
                  </g>
                ))}
                {model.lanes.map((lane, index) => {
                  const y = 36 + index * laneH
                  const start = Math.max(timeWindow.start, lane.openMs)
                  const end = Math.min(timeWindow.end, lane.endMs, nowMs)
                  const rawWidth = xOf(end) - xOf(start)
                  const short = rawWidth < MIN_BAR && end > start
                  const barW = Math.max(MIN_BAR, rawWidth)
                  const barX = Math.min(xOf(start), width - right - barW)
                  const selected = focusRow === lane.row.row
                  return (
                    <g key={lane.row.row} onClick={() => focusLane(lane)} className="cursor-pointer">
                      <text x={8} y={y + 12} fontSize={10} fill="currentColor">{labelOf(lane.row).slice(0, 24)}</text>
                      <rect x={left} y={y} width={plot} height={20} rx={4} fill={selected ? 'rgba(73,99,238,0.12)' : 'transparent'} />
                      {end > start ? (
                        <rect x={barX} y={y + 4} width={barW} height={12} rx={3} fill="#f43f5e">
                          <title>{`${labelOf(lane.row)} ${clock(lane.openMs)}`}</title>
                        </rect>
                      ) : null}
                      {short ? <circle cx={barX + barW / 2} cy={y + 10} r={3.5} fill="#f43f5e" stroke="#fff" /> : null}
                      {lane.closeMs != null && lane.closeMs <= nowMs && lane.closeMs >= timeWindow.start && lane.closeMs <= timeWindow.end ? (
                        <circle cx={xOf(lane.closeMs)} cy={y + 10} r={4} fill="#10b981" />
                      ) : null}
                      {lane.openEnded && lane.endMs >= timeWindow.start && lane.endMs <= timeWindow.end ? (
                        <circle cx={xOf(Math.min(lane.endMs, timeWindow.end))} cy={y + 10} r={4} fill="#94a3b8" />
                      ) : null}
                    </g>
                  )
                })}
              </svg>
            )}
          </ChartFrame>

          <ChartFrame
            title="Eventos de caída y recuperación"
            note="−1 es la apertura y +1 es el cierre registrado. La altura no es la duración. Un cierre no certifica la recuperación del colegio si quedan otros tickets abiertos. Los eventos del mismo segundo se listan juntos, sin mover su hora."
            onWheel={(delta) => zoom(delta > 0 ? 1.25 : 0.8)}
          >
            <svg width={width} height={230} role="img" aria-label="Aperturas y cierres del colegio" className="text-slate-500">
              {axis.map((tick) => (
                <g key={tick}>
                  <line x1={xOf(tick)} x2={xOf(tick)} y1={24} y2={190} stroke="currentColor" strokeOpacity={0.25} />
                  <text x={xOf(tick)} y={214} textAnchor="middle" fontSize={10} fill="currentColor">{tickLabel(tick, span)}</text>
                </g>
              ))}
              <line x1={left} x2={width - right} y1={108} y2={108} stroke="currentColor" />
              <text x={8} y={40} fontSize={11} fill="currentColor">+1</text>
              <text x={12} y={112} fontSize={11} fill="currentColor">0</text>
              <text x={8} y={184} fontSize={11} fill="currentColor">−1</text>
              {[...grouped.values()].map((group) => {
                const event = group[0]
                const x = xOf(event.ms)
                const down = event.kind === 'open'
                return (
                  <g
                    key={`${event.kind}-${event.ms}-${event.lane.row.row}`}
                    className="cursor-pointer"
                    onClick={() => focusLane(event.lane)}
                  >
                    <rect x={x - 2} y={down ? 108 : 36} width={4} height={72} fill={down ? '#f43f5e' : '#10b981'} />
                    {group.length > 1 ? (
                      <text x={x + 6} y={down ? 176 : 32} fontSize={10} fill="currentColor">{group.length}</text>
                    ) : null}
                    <title>
                      {group.map((item) => `${item.kind === 'open' ? 'Apertura' : 'Cierre registrado'} · ${labelOf(item.lane.row)} · ${clock(item.ms)}`).join('\n')}
                    </title>
                  </g>
                )
              })}
            </svg>
          </ChartFrame>

          {hover ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
              <p className="font-semibold">{hover.title}</p>
              {hover.lines.map((line) => <p key={line}>{line}</p>)}
            </div>
          ) : (
            <p className="text-xs text-slate-500">Pulsa una barra o un evento para ver apertura, cierre y la siguiente incidencia del mismo CID.</p>
          )}
        </div>
      )}
    </SectionCard>
  )
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: 'ok' | 'down' }) {
  const color = tone === 'ok' ? 'text-emerald-600 dark:text-emerald-300' : tone === 'down' ? 'text-rose-600 dark:text-rose-300' : 'text-slate-900 dark:text-slate-100'
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 dark:border-slate-800 dark:bg-slate-950">
      <p className="text-[11px] font-medium text-slate-500">{label}</p>
      <p className={`mt-1 text-xl font-bold tabular-nums ${color}`}>{value}</p>
    </div>
  )
}

function ChartFrame({
  title,
  note,
  onWheel,
  children,
}: {
  title: string
  note: string
  onWheel: (delta: number) => void
  children: ReactNode
}) {
  return (
    <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
      <p className="mt-1 mb-2 text-xs text-slate-500">{note}</p>
      <div
        className="max-h-[640px] overflow-auto"
        onWheel={(event) => {
          if (!event.ctrlKey && !event.metaKey) return
          event.preventDefault()
          onWheel(event.deltaY)
        }}
      >
        {children}
      </div>
    </div>
  )
}
