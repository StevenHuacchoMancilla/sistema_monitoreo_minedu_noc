import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { SectionCard } from '../../../components/ui/Card'
import { FormField, Input, Select } from '../../../components/ui/FormControls'
import type { TicketeraRow } from '../types/ticketera'

const DAY = 86_400_000
const EVENT_SLOT = 34
const EVENT_BAR = 20
const DURATION_SLOT = 78
const DURATION_BAR = 60
const PLOT_H = 248
const DURATION_LABEL_H = 58
const EVENT_LABEL_H = 72
const GUTTER = 76
const LOG_FLOOR = 15_000

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

function shortDate(ms: number): string {
  return new Intl.DateTimeFormat('es-PE', {
    timeZone: 'America/Lima',
    day: '2-digit',
    month: '2-digit',
  }).format(new Date(ms))
}

function shortTime(ms: number): string {
  return new Intl.DateTimeFormat('es-PE', {
    timeZone: 'America/Lima',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(ms))
}

function dayLabel(ms: number): string {
  return new Intl.DateTimeFormat('es-PE', {
    timeZone: 'America/Lima',
    day: '2-digit',
    month: 'short',
  }).format(new Date(ms))
}

function dayKey(ms: number): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
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

function labelOf(row: TicketeraRow): string {
  const ticket = row.ticket.trim() || 'Sin ticket'
  return `${ticket} · fila ${row.row}`
}

function shortId(row: TicketeraRow): string {
  const ticket = row.ticket.trim()
  const piece = ticket.split('_').filter(Boolean).pop()
  if (piece && piece.length <= 6) return piece
  return String(row.row)
}

function durationOf(lane: Lane, nowMs: number): number {
  return Math.max(0, (lane.closeMs ?? nowMs) - lane.openMs)
}

function trim(value: number): string {
  const digits = value >= 10 ? 0 : 1
  return value.toFixed(digits).replace(/\.0$/, '')
}

function formatMinutes(ms: number): string {
  const minutes = ms / 60_000
  if (minutes < 1) return `${Math.round(ms / 1000)} s`
  if (minutes < 60) return `${trim(minutes)} min`
  const hours = minutes / 60
  if (hours < 48) return `${trim(hours)} h`
  return `${trim(hours / 24)} d`
}

function logRatio(ms: number, maxMs: number): number {
  const top = Math.max(maxMs, LOG_FLOOR * 4)
  const value = Math.min(Math.max(ms, LOG_FLOOR), top)
  return Math.log(value / LOG_FLOOR) / Math.log(top / LOG_FLOOR)
}

function logTicks(maxMs: number): number[] {
  const marks = [30_000, 60_000, 120_000, 300_000, 900_000, 1_800_000, 3_600_000, 14_400_000, 86_400_000, 259_200_000]
  return marks.filter((ms) => ms >= LOG_FLOOR && ms <= maxMs * 1.02)
}

function median(values: number[]): number {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function topCauses(lanes: Lane[]): Array<{ label: string; count: number }> {
  const counts = new Map<string, number>()
  for (const lane of lanes) {
    const label = lane.row.causa.trim() || 'Sin causa global'
    counts.set(label, (counts.get(label) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 4)
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
  const [focusRow, setFocusRow] = useState<number | null>(null)
  const [active, setActive] = useState<number | null>(null)
  const [shownIndex, setShownIndex] = useState<number | null>(null)
  const durationScroll = useRef<HTMLDivElement>(null)
  const eventScroll = useRef<HTMLDivElement>(null)
  const scrolling = useRef(false)

  const nowMs = Number.isFinite(Date.parse(now)) ? Date.parse(now) : Date.now()
  const rangeStart = dayStart(from)
  const rangeEnd = dayStart(to) == null ? null : (dayStart(to) as number) + DAY

  useEffect(() => {
    setFocusRow(null)
    setActive(null)
    setShownIndex(null)
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
      return { lanes: [] as Lane[], invalid: [] as InvalidLane[], observed: 0, future: 0, down: 0, cidTotal: 0, outside: 0 }
    }
    const lanes: Lane[] = []
    const invalid: InvalidLane[] = []
    let cidTotal = 0
    let outside = 0
    for (const row of rows) {
      if (row.cid.trim() !== cid) continue
      cidTotal += 1
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
      if (openMs >= rangeEnd || endMs <= rangeStart) {
        outside += 1
        continue
      }
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
      cidTotal,
      outside,
    }
  }, [rows, cid, rangeStart, rangeEnd, nowMs])

  function syncScroll(source: HTMLDivElement, target: HTMLDivElement | null, fromSlot: number, toSlot: number) {
    if (!target || scrolling.current) return
    scrolling.current = true
    target.scrollLeft = (source.scrollLeft / fromSlot) * toSlot
    requestAnimationFrame(() => {
      scrolling.current = false
    })
  }

  function selectLane(index: number) {
    const lane = model.lanes[index]
    if (!lane) return
    setFocusRow(lane.row.row)
    setActive(index)
    setShownIndex(index)
    durationScroll.current?.scrollTo({ left: Math.max(0, index * DURATION_SLOT - 160), behavior: 'smooth' })
    eventScroll.current?.scrollTo({ left: Math.max(0, index * EVENT_SLOT - 80), behavior: 'smooth' })
  }

  if (rangeStart == null || rangeEnd == null) return null

  const durations = model.lanes.map((lane) => durationOf(lane, nowMs))
  const maxDuration = durations.reduce((max, value) => Math.max(max, value), 0)
  const medianDuration = median(durations)
  const underFive = durations.filter((value) => value < 5 * 60_000).length
  const causes = topCauses(model.lanes)
  const closes = model.lanes.filter((lane) => lane.closeMs != null && lane.closeMs <= nowMs).length
  const scaleTop = Math.max(maxDuration, LOG_FLOOR * 4)
  const ticks = logTicks(scaleTop)
  const baseline = PLOT_H - 8
  const inner = baseline - 18
  const yOf = (ms: number) => baseline - logRatio(ms, scaleTop) * inner
  const up = Math.max(0, model.observed - model.down)
  const pct = model.observed ? (up / model.observed) * 100 : null
  const highlighted = (index: number) => model.lanes[index]?.row.row === focusRow || index === active
  const shown = shownIndex == null ? null : model.lanes[shownIndex] ?? null
  const preview = (index: number) => {
    setActive(index)
    setShownIndex(index)
  }

  return (
    <SectionCard
      title="Disponibilidad del colegio"
      action={<span className="text-xs text-slate-500">Una columna por incidencia, ordenadas por apertura</span>}
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
          <div className="flex flex-wrap items-end justify-between gap-3">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              CID {school.cid} · {school.name || `TSS ${school.tss || '—'}`}
            </p>
            <FormField label="Ir a una incidencia" className="min-w-56">
              <Select
                value={focusRow == null ? '' : String(focusRow)}
                onChange={(event) => {
                  const index = model.lanes.findIndex((item) => item.row.row === Number(event.target.value))
                  if (index >= 0) selectLane(index)
                }}
              >
                <option value="">Selecciona una incidencia</option>
                {model.lanes.map((lane) => (
                  <option key={lane.row.row} value={lane.row.row}>{labelOf(lane.row)}</option>
                ))}
              </Select>
            </FormField>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="Disponibilidad estimada" value={pct == null ? '—' : `${pct.toFixed(2)}%`} tone="ok" />
            <Metric label="Duración mediana" value={formatMinutes(medianDuration)} />
            <Metric label="Caídas de menos de 5 min" value={`${underFive} de ${model.lanes.length}`} />
            <Metric label="Causa más frecuente" value={causes[0]?.label ?? '—'} hint={causes[0] ? `${causes[0].count} incidencias` : 'Sin causa global'} />
          </div>
          {causes.length ? (
            <div className="flex flex-wrap gap-2">
              {causes.map((cause) => (
                <span key={cause.label} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                  {cause.label} · {cause.count}
                </span>
              ))}
            </div>
          ) : null}
          <p className="text-xs leading-relaxed text-slate-500">
            {`Este CID tiene ${model.cidTotal} filas: ${model.lanes.length} entran en la gráfica, ${model.outside} caen fuera del rango y ${model.invalid.length} tienen fecha inválida.`}
            {` Cierres: ${closes}. Sin cierre: ${model.lanes.filter((lane) => lane.openEnded).length}.`}
            {rankingRows != null && rankingRows !== model.lanes.length
              ? ` El ranking cuenta ${rankingRows} con los filtros del reporte.`
              : ' Estas gráficas no usan el horario 08:00–16:00 ni el Top del ranking.'}
          </p>
          {model.invalid.length ? (
            <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
              {model.invalid.length} registros del CID no se dibujan: {model.invalid.map((item) => `fila ${item.row.row} (${item.reason})`).join('; ')}.
            </p>
          ) : null}

          <ChartShell
            title="Duración de cada incidencia"
            note={`${model.lanes.length} columnas en minutos, escala logarítmica. Así una caída de 2 minutos se ve aunque otra lleve días abierta. En la barra está la duración h:mm:ss; debajo, la fila, la fecha y la hora de apertura.`}
            legend={(
              <>
                <Swatch color="#e11d48" label="Con cierre" />
                <Swatch color="#f59e0b" label="Sin cierre, hasta la última lectura" />
              </>
            )}
          >
            {model.lanes.length === 0 ? (
              <p className="px-3 py-8 text-center text-sm text-slate-500">Este colegio no tiene incidencias válidas dentro del rango.</p>
            ) : (
              <div className="flex">
                <AxisGutter ticks={ticks} format={formatMinutes} axis="Minutos" yOf={yOf} height={PLOT_H + DURATION_LABEL_H} />
                <div
                  ref={durationScroll}
                  className="min-w-0 flex-1 overflow-x-auto"
                  onScroll={(event) => syncScroll(event.currentTarget, eventScroll.current, DURATION_SLOT, EVENT_SLOT)}
                >
                  <DurationPlot
                    lanes={model.lanes}
                    nowMs={nowMs}
                    yOf={yOf}
                    ticks={ticks}
                    highlighted={highlighted}
                    onEnter={preview}
                    onLeave={() => setActive(null)}
                    onSelect={selectLane}
                  />
                </div>
              </div>
            )}
          </ChartShell>

          <ChartShell
            title="Apertura y recuperación de cada incidencia"
            note={`${model.lanes.length} aperturas en rojo y ${closes} cierres en verde. Cada incidencia ocupa su propia columna, así que ninguna queda tapada por otra.`}
            legend={(
              <>
                <Swatch color="#f43f5e" label="Apertura · −1" />
                <Swatch color="#10b981" label="Cierre registrado · +1" />
                <Swatch color="#334155" label="Sin cierre" hollow />
              </>
            )}
          >
            <div className="mb-3 grid grid-cols-3 gap-2">
              <MiniStat label="Aperturas" value={String(model.lanes.length)} tone="down" />
              <MiniStat label="Cierres" value={String(closes)} tone="ok" />
              <MiniStat label="Sin cierre" value={String(model.lanes.filter((lane) => lane.openEnded || (lane.closeMs != null && lane.closeMs > nowMs)).length)} />
            </div>
            {model.lanes.length === 0 ? (
              <p className="px-3 py-8 text-center text-sm text-slate-500">Este colegio no tiene incidencias válidas dentro del rango.</p>
            ) : (
              <div className="flex">
                <svg width={GUTTER} height={PLOT_H + EVENT_LABEL_H} className="sticky left-0 z-10 shrink-0 bg-white text-slate-400 dark:bg-slate-900" aria-hidden>
                  <text x={GUTTER - 8} y={28} textAnchor="end" fontSize={11} fill="currentColor">+1</text>
                  <text x={GUTTER - 8} y={PLOT_H / 2 + 4} textAnchor="end" fontSize={11} fill="currentColor">0</text>
                  <text x={GUTTER - 8} y={PLOT_H - 16} textAnchor="end" fontSize={11} fill="currentColor">−1</text>
                </svg>
                <div
                  ref={eventScroll}
                  className="min-w-0 flex-1 overflow-x-auto"
                  onScroll={(event) => syncScroll(event.currentTarget, durationScroll.current, EVENT_SLOT, DURATION_SLOT)}
                >
                  <EventPlot
                    lanes={model.lanes}
                    nowMs={nowMs}
                    highlighted={highlighted}
                    onEnter={preview}
                    onLeave={() => setActive(null)}
                    onSelect={selectLane}
                  />
                </div>
              </div>
            )}
          </ChartShell>

          {shown ? (
            <IncidentCard lane={shown} nowMs={nowMs} cid={cid} schoolName={school.name} lanes={model.lanes} rangeStart={rangeStart} rangeEnd={rangeEnd} />
          ) : (
            <p className="text-xs text-slate-500">Pasa el cursor por una columna para ver duración, causa global, detalle y código de esa incidencia.</p>
          )}
        </div>
      )}
    </SectionCard>
  )
}

function DurationPlot({
  lanes,
  nowMs,
  yOf,
  ticks,
  highlighted,
  onEnter,
  onLeave,
  onSelect,
}: {
  lanes: Lane[]
  nowMs: number
  yOf: (ms: number) => number
  ticks: number[]
  highlighted: (index: number) => boolean
  onEnter: (index: number) => void
  onLeave: () => void
  onSelect: (index: number) => void
}) {
  const width = Math.max(lanes.length * DURATION_SLOT, DURATION_SLOT)
  const baseline = PLOT_H - 8
  const height = PLOT_H + DURATION_LABEL_H
  return (
    <svg width={width} height={height} role="img" aria-label="Duración en minutos de cada incidencia" className="max-w-none text-slate-400">
      <defs>
        <linearGradient id="ticketera-bar-closed" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="#be123c" />
          <stop offset="100%" stopColor="#fb7185" />
        </linearGradient>
        <linearGradient id="ticketera-bar-open" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="#b45309" />
          <stop offset="100%" stopColor="#fbbf24" />
        </linearGradient>
      </defs>
      {dayBands(lanes).map((band) => (
        <rect key={band.key} x={band.from * DURATION_SLOT} y={0} width={(band.to - band.from) * DURATION_SLOT} height={height} fill={band.alt ? 'rgba(148,163,184,0.08)' : 'transparent'} />
      ))}
      {ticks.map((tick) => (
        <line key={tick} x1={0} x2={width} y1={yOf(tick)} y2={yOf(tick)} stroke="currentColor" strokeOpacity={0.16} />
      ))}
      <line x1={0} x2={width} y1={baseline} y2={baseline} stroke="currentColor" strokeOpacity={0.45} />
      {lanes.map((lane, index) => {
        const duration = durationOf(lane, nowMs)
        const y = yOf(duration)
        const barH = Math.max(16, baseline - y)
        const x = index * DURATION_SLOT + (DURATION_SLOT - DURATION_BAR) / 2
        const on = highlighted(index)
        const labelInside = barH >= 22
        return (
          <g key={lane.row.row} className="cursor-pointer" onMouseEnter={() => onEnter(index)} onMouseLeave={onLeave} onClick={() => onSelect(index)}>
            <rect x={index * DURATION_SLOT} y={0} width={DURATION_SLOT} height={height} fill="transparent" />
            <rect x={x} y={baseline - barH} width={DURATION_BAR} height={barH} rx={4} fill={lane.openEnded ? 'url(#ticketera-bar-open)' : 'url(#ticketera-bar-closed)'} stroke={on ? '#818cf8' : 'transparent'} strokeWidth={2}>
              <title>{`${labelOf(lane.row)} · ${hms(duration)} · ${formatMinutes(duration)}`}</title>
            </rect>
            <text
              x={index * DURATION_SLOT + DURATION_SLOT / 2}
              y={labelInside ? baseline - barH / 2 + 4 : baseline - barH - 6}
              textAnchor="middle"
              fontSize={10}
              fontWeight={700}
              fill={labelInside ? '#fff' : 'currentColor'}
            >
              {hms(duration)}
            </text>
            <text x={index * DURATION_SLOT + DURATION_SLOT / 2} y={baseline + 14} textAnchor="middle" fontSize={10} fontWeight={600} fill="currentColor">{`Fila ${lane.row.row}`}</text>
            <text x={index * DURATION_SLOT + DURATION_SLOT / 2} y={baseline + 28} textAnchor="middle" fontSize={9} fill="currentColor">{shortDate(lane.openMs)}</text>
            <text x={index * DURATION_SLOT + DURATION_SLOT / 2} y={baseline + 40} textAnchor="middle" fontSize={9} fill="currentColor">{shortTime(lane.openMs)}</text>
          </g>
        )
      })}
    </svg>
  )
}

function EventPlot({
  lanes,
  nowMs,
  highlighted,
  onEnter,
  onLeave,
  onSelect,
}: {
  lanes: Lane[]
  nowMs: number
  highlighted: (index: number) => boolean
  onEnter: (index: number) => void
  onLeave: () => void
  onSelect: (index: number) => void
}) {
  const width = Math.max(lanes.length * EVENT_SLOT, EVENT_SLOT)
  const mid = PLOT_H / 2
  const amp = mid - 28
  const height = PLOT_H + EVENT_LABEL_H
  return (
    <svg width={width} height={height} role="img" aria-label="Apertura y cierre de cada incidencia" className="max-w-none text-slate-400">
      {dayBands(lanes).map((band) => (
        <rect key={band.key} x={band.from * EVENT_SLOT} y={0} width={(band.to - band.from) * EVENT_SLOT} height={height} fill={band.alt ? 'rgba(148,163,184,0.08)' : 'transparent'} />
      ))}
      <line x1={0} x2={width} y1={mid} y2={mid} stroke="currentColor" strokeOpacity={0.55} />
      {lanes.map((lane, index) => {
        const x = index * EVENT_SLOT + (EVENT_SLOT - EVENT_BAR) / 2
        const closed = lane.closeMs != null && lane.closeMs <= nowMs
        const on = highlighted(index)
        return (
          <g key={lane.row.row} className="cursor-pointer" onMouseEnter={() => onEnter(index)} onMouseLeave={onLeave} onClick={() => onSelect(index)}>
            <rect x={index * EVENT_SLOT} y={0} width={EVENT_SLOT} height={height} fill="transparent" />
            <rect x={x} y={mid - amp} width={EVENT_BAR} height={amp} rx={4} fill={closed ? '#10b981' : 'rgba(51,65,85,0.45)'} stroke={on ? '#818cf8' : 'transparent'} strokeWidth={2}>
              <title>{closed ? `Cierre · ${labelOf(lane.row)} · ${clock(lane.closeMs as number)}` : `Sin cierre · ${labelOf(lane.row)}`}</title>
            </rect>
            <rect x={x} y={mid} width={EVENT_BAR} height={amp} rx={4} fill="#f43f5e" stroke={on ? '#818cf8' : 'transparent'} strokeWidth={2}>
              <title>{`Apertura · ${labelOf(lane.row)} · ${clock(lane.openMs)}`}</title>
            </rect>
            <text x={index * EVENT_SLOT + EVENT_SLOT / 2} y={PLOT_H + 16} textAnchor="middle" fontSize={10} fill="currentColor">{shortId(lane.row)}</text>
          </g>
        )
      })}
      {dayBands(lanes).map((band) => (
        <text key={`${band.key}-label`} x={((band.from + band.to) / 2) * EVENT_SLOT} y={PLOT_H + EVENT_LABEL_H - 8} textAnchor="middle" fontSize={11} fontWeight={600} fill="currentColor">
          {band.label}
        </text>
      ))}
    </svg>
  )
}

function dayBands(lanes: Lane[]): Array<{ key: string; label: string; from: number; to: number; alt: boolean }> {
  const bands: Array<{ key: string; label: string; from: number; to: number; alt: boolean }> = []
  lanes.forEach((lane, index) => {
    const key = dayKey(lane.openMs)
    const last = bands[bands.length - 1]
    if (!last || last.key !== key) bands.push({ key, label: dayLabel(lane.openMs), from: index, to: index + 1, alt: bands.length % 2 === 1 })
    else last.to = index + 1
  })
  return bands
}

function AxisGutter({
  ticks,
  format,
  axis,
  yOf,
  height,
}: {
  ticks: number[]
  format: (ms: number) => string
  axis: string
  yOf: (ms: number) => number
  height: number
}) {
  return (
    <svg width={GUTTER} height={height} className="sticky left-0 z-10 shrink-0 bg-white text-slate-400 dark:bg-slate-900" aria-hidden>
      <text x={12} y={PLOT_H / 2} textAnchor="middle" fontSize={10} fill="currentColor" transform={`rotate(-90 12 ${PLOT_H / 2})`}>{axis}</text>
      {ticks.map((tick) => (
        <text key={tick} x={GUTTER - 6} y={yOf(tick) + 3} textAnchor="end" fontSize={10} fill="currentColor">{format(tick)}</text>
      ))}
    </svg>
  )
}

function ChartShell({
  title,
  note,
  legend,
  children,
}: {
  title: string
  note: string
  legend: ReactNode
  children: ReactNode
}) {
  return (
    <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
          <p className="mt-1 max-w-3xl text-xs text-slate-500">{note}</p>
        </div>
        <div className="flex flex-wrap gap-3 text-xs text-slate-500">{legend}</div>
      </div>
      {children}
    </div>
  )
}

function Swatch({ color, label, hollow = false }: { color: string; label: string; hollow?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <i className="h-2.5 w-2.5 rounded-sm" style={{ background: hollow ? 'transparent' : color, boxShadow: hollow ? `inset 0 0 0 1.5px ${color}` : undefined }} />
      {label}
    </span>
  )
}

function Metric({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: 'ok' | 'down' }) {
  const color = tone === 'ok' ? 'text-emerald-600 dark:text-emerald-300' : tone === 'down' ? 'text-rose-600 dark:text-rose-300' : 'text-slate-900 dark:text-slate-100'
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 dark:border-slate-800 dark:bg-slate-950">
      <p className="text-[11px] font-medium text-slate-500">{label}</p>
      <p className={`mt-1 truncate text-xl font-bold tabular-nums ${color}`} title={hint ?? value}>{value}</p>
      {hint ? <p className="mt-0.5 truncate text-[11px] text-slate-500" title={hint}>{hint}</p> : null}
    </div>
  )
}

function IncidentCard({
  lane,
  nowMs,
  cid,
  schoolName,
  lanes,
  rangeStart,
  rangeEnd,
}: {
  lane: Lane
  nowMs: number
  cid: string
  schoolName: string
  lanes: Lane[]
  rangeStart: number
  rangeEnd: number
}) {
  const duration = durationOf(lane, nowMs)
  const inRange = Math.max(0, Math.min(rangeEnd, lane.endMs, nowMs) - Math.max(rangeStart, lane.openMs))
  const why = [
    ['Causa global', lane.row.causa],
    ['Detalle', lane.row.detalle],
    ['Código', lane.row.codigo],
    ['Grupo', lane.row.grupo],
    ['Atención', lane.row.atencion],
    ['Área', lane.row.area],
    ['Minedu', lane.row.minedu],
    ['Energía', lane.row.energia],
  ].filter((item): item is [string, string] => item[1].trim() !== '')
  const next = lanes.find((item) => item.openMs > (lane.closeMs ?? lane.endMs))
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-950">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{labelOf(lane.row)}</p>
          <p className="text-xs text-slate-500">CID {cid}{schoolName ? ` · ${schoolName}` : ''}{lane.row.distrito ? ` · ${lane.row.distrito}` : ''}{lane.row.provincia ? `, ${lane.row.provincia}` : ''}</p>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${lane.openEnded ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200' : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200'}`}>
          {lane.row.status}
        </span>
      </div>
      <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <dl className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-x-2 gap-y-1 text-xs">
          <dt className="text-slate-500">Apertura</dt>
          <dd className="text-slate-800 dark:text-slate-100">{clock(lane.openMs)}{lane.before ? ' · empezó antes del rango' : ''}</dd>
          <dt className="text-slate-500">Cierre</dt>
          <dd className="text-slate-800 dark:text-slate-100">{lane.closeMs == null ? 'Sin cierre' : `${clock(lane.closeMs)}${lane.closeMs > nowMs ? ' · posterior a la última lectura' : ''}`}</dd>
          <dt className="text-slate-500">Duración</dt>
          <dd className="font-semibold text-slate-900 dark:text-slate-100">{hms(duration)} · {formatMinutes(duration)}</dd>
          <dt className="text-slate-500">En el rango</dt>
          <dd className="text-slate-800 dark:text-slate-100">{hms(inRange)}{lane.openEnded ? ' · sigue contando hasta la última lectura' : ''}</dd>
          <dt className="text-slate-500">Siguiente</dt>
          <dd className="text-slate-800 dark:text-slate-100">{next ? `${clock(next.openMs)} · espera ${hms(next.openMs - (lane.closeMs ?? nowMs))}` : 'No hay otra apertura posterior'}</dd>
        </dl>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Por qué cayó</p>
          {why.length ? (
            <dl className="mt-1 grid grid-cols-[7.5rem_minmax(0,1fr)] gap-x-2 gap-y-1 text-xs">
              {why.map(([label, value]) => (
                <div key={label} className="contents">
                  <dt className="text-slate-500">{label}</dt>
                  <dd className="text-slate-800 dark:text-slate-100">{value}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="mt-1 text-xs text-slate-500">Esta fila no trae causa global, detalle ni código en la hoja.</p>
          )}
          {lane.row.problems.length ? <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">{lane.row.problems.join(' · ')}</p> : null}
        </div>
      </div>
    </div>
  )
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone?: 'ok' | 'down' }) {
  const color = tone === 'ok' ? 'text-emerald-600 dark:text-emerald-300' : tone === 'down' ? 'text-rose-600 dark:text-rose-300' : 'text-slate-900 dark:text-slate-100'
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-950">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`text-lg font-bold tabular-nums ${color}`}>{value}</p>
    </div>
  )
}
