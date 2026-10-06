import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { SectionCard } from '../../../components/ui/Card'
import { FormField, Input, Select } from '../../../components/ui/FormControls'
import type { TicketeraRow } from '../types/ticketera'

const DAY = 86_400_000
const SLOT = 34
const BAR = 20
const PLOT_H = 248
const LABEL_H = 78
const GUTTER = 58

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

function niceMax(value: number): number {
  if (value <= 0) return 1
  const exp = 10 ** Math.floor(Math.log10(value))
  const fraction = value / exp
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10
  return nice * exp
}

function trim(value: number): string {
  const digits = value >= 10 ? 0 : 1
  return value.toFixed(digits).replace(/\.0$/, '')
}

function durationScale(maxMs: number): { maxMs: number; ticks: number[]; axis: string; format: (ms: number) => string } {
  const max = Math.max(maxMs, 1000)
  let unit = 3600000
  let axis = 'Duración (horas)'
  let format = (ms: number) => trim(ms / 3600000)
  if (max < 120_000) {
    unit = 1000
    axis = 'Duración (segundos)'
    format = (ms: number) => trim(ms / 1000)
  } else if (max < 7_200_000) {
    unit = 60_000
    axis = 'Duración (minutos)'
    format = (ms: number) => trim(ms / 60000)
  }
  const top = niceMax(max / unit) * unit
  const steps = 4
  const ticks = Array.from({ length: steps + 1 }, (_, index) => (top / steps) * index)
  return { maxMs: top, ticks, axis, format }
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
  const [hover, setHover] = useState<Hover | null>(null)
  const [focusRow, setFocusRow] = useState<number | null>(null)
  const [active, setActive] = useState<number | null>(null)
  const durationScroll = useRef<HTMLDivElement>(null)
  const eventScroll = useRef<HTMLDivElement>(null)
  const scrolling = useRef(false)

  const nowMs = Number.isFinite(Date.parse(now)) ? Date.parse(now) : Date.now()
  const rangeStart = dayStart(from)
  const rangeEnd = dayStart(to) == null ? null : (dayStart(to) as number) + DAY

  useEffect(() => {
    setFocusRow(null)
    setHover(null)
    setActive(null)
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

  function syncScroll(source: HTMLDivElement, target: HTMLDivElement | null) {
    if (!target || scrolling.current) return
    scrolling.current = true
    target.scrollLeft = source.scrollLeft
    requestAnimationFrame(() => {
      scrolling.current = false
    })
  }

  function detailLines(lane: Lane): string[] {
    if (rangeStart == null || rangeEnd == null) return []
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
      `Duración del ticket: ${hms(durationOf(lane, nowMs))}`,
      `Dentro del rango observado: ${hms(inRange)}`,
      next
        ? `Siguiente apertura del CID: ${clock(next.openMs)} · espera ${hms(next.openMs - (lane.closeMs ?? nowMs))}${othersOpen ? ' · hay otros tickets activos, no es servicio confirmado' : ''}`
        : 'No hay una apertura posterior en los datos de este CID.',
      `Estado: ${lane.row.status}`,
      lane.row.problems.length ? lane.row.problems.join(' · ') : 'Sin observaciones de fecha',
    ]
  }

  function selectLane(index: number) {
    const lane = model.lanes[index]
    if (!lane) return
    setFocusRow(lane.row.row)
    setActive(index)
    setHover({ title: labelOf(lane.row), lines: detailLines(lane) })
    const left = Math.max(0, index * SLOT - 120)
    durationScroll.current?.scrollTo({ left, behavior: 'smooth' })
    eventScroll.current?.scrollTo({ left, behavior: 'smooth' })
  }

  if (rangeStart == null || rangeEnd == null) return null

  const durations = model.lanes.map((lane) => durationOf(lane, nowMs))
  const maxDuration = durations.reduce((max, value) => Math.max(max, value), 0)
  const avgDuration = durations.length ? durations.reduce((sum, value) => sum + value, 0) / durations.length : 0
  const closes = model.lanes.filter((lane) => lane.closeMs != null && lane.closeMs <= nowMs).length
  const scale = durationScale(maxDuration)
  const up = Math.max(0, model.observed - model.down)
  const pct = model.observed ? (up / model.observed) * 100 : null
  const highlighted = (index: number) => model.lanes[index]?.row.row === focusRow || index === active

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
            <Metric label="Horas de caída" value={`${(model.down / 3600000).toFixed(2)} h`} tone="down" />
            <Metric label="Duración media del ticket" value={hms(avgDuration)} />
            <Metric label="Incidencias en la gráfica" value={String(model.lanes.length)} />
          </div>
          <p className="text-xs leading-relaxed text-slate-500">
            Cada columna es una fila de la hoja, en orden de apertura. La altura de la primera gráfica es la duración real del ticket, no la posición dentro del mes.
            {` Este CID tiene ${model.cidTotal} filas: ${model.lanes.length} entran en la gráfica, ${model.outside} caen fuera del rango y ${model.invalid.length} tienen fecha inválida.`}
            {` Cierres dibujados: ${closes}. Sin cierre: ${model.lanes.filter((lane) => lane.openEnded).length}.`}
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
            note={`${model.lanes.length} columnas. La más larga mide ${hms(maxDuration)} y define la escala. Desplaza en horizontal para verlas todas.`}
            legend={(
              <>
                <Swatch color="#e11d48" label="Con cierre" />
                <Swatch color="#64748b" label="Sin cierre, hasta la última lectura" />
              </>
            )}
          >
            {model.lanes.length === 0 ? (
              <p className="px-3 py-8 text-center text-sm text-slate-500">Este colegio no tiene incidencias válidas dentro del rango.</p>
            ) : (
              <div className="flex">
                <AxisGutter
                  ticks={scale.ticks}
                  format={(ms) => scale.format(ms)}
                  axis={scale.axis}
                  max={scale.maxMs}
                />
                <div
                  ref={durationScroll}
                  className="min-w-0 flex-1 overflow-x-auto"
                  onScroll={(event) => syncScroll(event.currentTarget, eventScroll.current)}
                >
                  <DurationPlot
                    lanes={model.lanes}
                    nowMs={nowMs}
                    scaleMax={scale.maxMs}
                    ticks={scale.ticks}
                    format={scale.format}
                    highlighted={highlighted}
                    onEnter={(index) => {
                      setActive(index)
                      const lane = model.lanes[index]
                      if (lane && focusRow == null) setHover({ title: labelOf(lane.row), lines: detailLines(lane) })
                    }}
                    onLeave={() => {
                      setActive(null)
                      if (focusRow == null) setHover(null)
                    }}
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
                <svg width={GUTTER} height={PLOT_H + LABEL_H} className="sticky left-0 z-10 shrink-0 bg-white text-slate-400 dark:bg-slate-900" aria-hidden>
                  <text x={GUTTER - 8} y={28} textAnchor="end" fontSize={11} fill="currentColor">+1</text>
                  <text x={GUTTER - 8} y={PLOT_H / 2 + 4} textAnchor="end" fontSize={11} fill="currentColor">0</text>
                  <text x={GUTTER - 8} y={PLOT_H - 16} textAnchor="end" fontSize={11} fill="currentColor">−1</text>
                </svg>
                <div
                  ref={eventScroll}
                  className="min-w-0 flex-1 overflow-x-auto"
                  onScroll={(event) => syncScroll(event.currentTarget, durationScroll.current)}
                >
                  <EventPlot
                    lanes={model.lanes}
                    nowMs={nowMs}
                    highlighted={highlighted}
                    onEnter={(index) => {
                      setActive(index)
                      const lane = model.lanes[index]
                      if (lane && focusRow == null) setHover({ title: labelOf(lane.row), lines: detailLines(lane) })
                    }}
                    onLeave={() => {
                      setActive(null)
                      if (focusRow == null) setHover(null)
                    }}
                    onSelect={selectLane}
                  />
                </div>
              </div>
            )}
          </ChartShell>

          {hover ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
              <p className="font-semibold">{hover.title}</p>
              {hover.lines.map((line) => <p key={line}>{line}</p>)}
            </div>
          ) : (
            <p className="text-xs text-slate-500">Pasa el cursor o pulsa una columna para ver apertura, cierre y duración de esa incidencia.</p>
          )}
        </div>
      )}
    </SectionCard>
  )
}

function DurationPlot({
  lanes,
  nowMs,
  scaleMax,
  ticks,
  format,
  highlighted,
  onEnter,
  onLeave,
  onSelect,
}: {
  lanes: Lane[]
  nowMs: number
  scaleMax: number
  ticks: number[]
  format: (ms: number) => string
  highlighted: (index: number) => boolean
  onEnter: (index: number) => void
  onLeave: () => void
  onSelect: (index: number) => void
}) {
  const width = Math.max(lanes.length * SLOT, SLOT)
  const baseline = 12 + PLOT_H - 8
  const inner = baseline - 12
  return (
    <svg width={width} height={PLOT_H + LABEL_H} role="img" aria-label="Duración de cada incidencia" className="max-w-none text-slate-400">
      <defs>
        <linearGradient id="ticketera-bar-closed" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="#be123c" />
          <stop offset="100%" stopColor="#fb7185" />
        </linearGradient>
        <linearGradient id="ticketera-bar-open" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="#475569" />
          <stop offset="100%" stopColor="#cbd5e1" />
        </linearGradient>
      </defs>
      {dayBands(lanes).map((band) => (
        <rect key={band.key} x={band.from * SLOT} y={0} width={(band.to - band.from) * SLOT} height={PLOT_H + LABEL_H} fill={band.alt ? 'rgba(148,163,184,0.08)' : 'transparent'} />
      ))}
      {ticks.map((tick) => {
        const y = baseline - (tick / scaleMax) * inner
        return <line key={tick} x1={0} x2={width} y1={y} y2={y} stroke="currentColor" strokeOpacity={tick === 0 ? 0.45 : 0.16} />
      })}
      {lanes.map((lane, index) => {
        const duration = durationOf(lane, nowMs)
        const height = Math.max(4, (duration / scaleMax) * inner)
        const x = index * SLOT + (SLOT - BAR) / 2
        const y = baseline - height
        const on = highlighted(index)
        return (
          <g key={lane.row.row} className="cursor-pointer" onMouseEnter={() => onEnter(index)} onMouseLeave={onLeave} onClick={() => onSelect(index)}>
            <rect x={index * SLOT} y={0} width={SLOT} height={PLOT_H + LABEL_H} fill="transparent" />
            <rect
              x={x}
              y={y}
              width={BAR}
              height={height}
              rx={4}
              fill={lane.openEnded ? 'url(#ticketera-bar-open)' : 'url(#ticketera-bar-closed)'}
              stroke={on ? '#818cf8' : 'transparent'}
              strokeWidth={2}
            >
              <title>{`${labelOf(lane.row)} · ${hms(duration)} · ${clock(lane.openMs)}`}</title>
            </rect>
            {on ? (
              <text x={index * SLOT + SLOT / 2} y={Math.max(12, y - 6)} textAnchor="middle" fontSize={10} fontWeight={700} fill="currentColor">{format(duration)}</text>
            ) : null}
            <text x={index * SLOT + SLOT / 2} y={baseline + 16} textAnchor="middle" fontSize={10} fill="currentColor">{shortId(lane.row)}</text>
          </g>
        )
      })}
      {dayBands(lanes).map((band) => (
        <text key={`${band.key}-label`} x={((band.from + band.to) / 2) * SLOT} y={PLOT_H + LABEL_H - 8} textAnchor="middle" fontSize={11} fontWeight={600} fill="currentColor">
          {band.label}
        </text>
      ))}
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
  const width = Math.max(lanes.length * SLOT, SLOT)
  const mid = PLOT_H / 2
  const amp = mid - 28
  return (
    <svg width={width} height={PLOT_H + LABEL_H} role="img" aria-label="Apertura y cierre de cada incidencia" className="max-w-none text-slate-400">
      {dayBands(lanes).map((band) => (
        <rect key={band.key} x={band.from * SLOT} y={0} width={(band.to - band.from) * SLOT} height={PLOT_H + LABEL_H} fill={band.alt ? 'rgba(148,163,184,0.08)' : 'transparent'} />
      ))}
      <line x1={0} x2={width} y1={mid} y2={mid} stroke="currentColor" strokeOpacity={0.55} />
      {lanes.map((lane, index) => {
        const x = index * SLOT + (SLOT - BAR) / 2
        const closed = lane.closeMs != null && lane.closeMs <= nowMs
        const on = highlighted(index)
        return (
          <g key={lane.row.row} className="cursor-pointer" onMouseEnter={() => onEnter(index)} onMouseLeave={onLeave} onClick={() => onSelect(index)}>
            <rect x={index * SLOT} y={0} width={SLOT} height={PLOT_H + LABEL_H} fill="transparent" />
            <rect x={x} y={mid - amp} width={BAR} height={amp} rx={4} fill={closed ? '#10b981' : 'rgba(51,65,85,0.45)'} stroke={on ? '#818cf8' : 'transparent'} strokeWidth={2}>
              <title>{closed ? `Cierre · ${labelOf(lane.row)} · ${clock(lane.closeMs as number)}` : `Sin cierre · ${labelOf(lane.row)}`}</title>
            </rect>
            <rect x={x} y={mid} width={BAR} height={amp} rx={4} fill="#f43f5e" stroke={on ? '#818cf8' : 'transparent'} strokeWidth={2}>
              <title>{`Apertura · ${labelOf(lane.row)} · ${clock(lane.openMs)}`}</title>
            </rect>
            <text x={index * SLOT + SLOT / 2} y={PLOT_H + 16} textAnchor="middle" fontSize={10} fill="currentColor">{shortId(lane.row)}</text>
          </g>
        )
      })}
      {dayBands(lanes).map((band) => (
        <text key={`${band.key}-label`} x={((band.from + band.to) / 2) * SLOT} y={PLOT_H + LABEL_H - 8} textAnchor="middle" fontSize={11} fontWeight={600} fill="currentColor">
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
  max,
}: {
  ticks: number[]
  format: (ms: number) => string
  axis: string
  max: number
}) {
  const baseline = 12 + PLOT_H - 8
  const inner = baseline - 12
  return (
    <svg width={GUTTER} height={PLOT_H + LABEL_H} className="sticky left-0 z-10 shrink-0 bg-white text-slate-400 dark:bg-slate-900" aria-hidden>
      <text x={14} y={PLOT_H / 2} textAnchor="middle" fontSize={10} fill="currentColor" transform={`rotate(-90 14 ${PLOT_H / 2})`}>{axis}</text>
      {ticks.map((tick) => {
        const y = baseline - (tick / max) * inner
        return (
          <text key={tick} x={GUTTER - 6} y={y + 3} textAnchor="end" fontSize={10} fill="currentColor">{format(tick)}</text>
        )
      })}
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

function Metric({ label, value, tone }: { label: string; value: string; tone?: 'ok' | 'down' }) {
  const color = tone === 'ok' ? 'text-emerald-600 dark:text-emerald-300' : tone === 'down' ? 'text-rose-600 dark:text-rose-300' : 'text-slate-900 dark:text-slate-100'
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 dark:border-slate-800 dark:bg-slate-950">
      <p className="text-[11px] font-medium text-slate-500">{label}</p>
      <p className={`mt-1 text-xl font-bold tabular-nums ${color}`}>{value}</p>
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
