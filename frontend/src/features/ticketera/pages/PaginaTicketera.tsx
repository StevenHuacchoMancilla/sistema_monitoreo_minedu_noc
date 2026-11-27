import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CircleAlert,
  CircleCheck,
  CircleHelp,
  Download,
  MessageSquareText,
  RefreshCw,
  School,
  ScrollText,
  Ticket,
  Unplug,
  ClipboardList,
} from 'lucide-react'
import { endpoints } from '../../../api/endpoints'
import { useAuth } from '../../auth/context/ContextoAuth'
import { ModalGestionIncidente } from '../../incidents/components/ModalGestionIncidente'
import {
  PanelComentariosIncidente,
  type ComentariosPanelState,
} from '../../incidents/components/PanelComentariosIncidente'
import { ApiError } from '../../../api/clienteHttp'
import { DisenoApp } from '../../../layouts/DisenoApp'
import { EncabezadoPagina } from '../../../components/ui/EncabezadoPagina'
import { TarjetaFiltro } from '../../../components/ui/TarjetaFiltro'
import { FormField, Input, Select } from '../../../components/ui/ControlesFormulario'
import { Boton } from '../../../components/ui/Boton'
import { TarjetaMetrica } from '../../../components/ui/TarjetaMetrica'
import { GrillaMetricas } from '../../../components/ui/GrillaMetricas'
import { DataTableContainer, tableClassName, thClassName, theadClassName, trClassName } from '../../../components/ui/MarcoTablaDatos'
import { EmptyState, ErrorState, LoadingState } from '../../../components/ui/Estados'
import { formatDateTime24 } from '../../../lib/fechaHora'
import { GraficosTicketera } from '../components/GraficosTicketera'
import { LineasTiempoColegio } from '../components/LineasTiempoColegio'
import { PanelCuadre } from '../components/PanelCuadre'
import { PanelSla } from '../components/PanelSla'
import {
  FILTER_LABELS,
  defaultFilters,
  fieldOptions,
  historyRange,
  kpis,
  latestDay,
  optionLabel,
  prepare,
  type FilterField,
  type PreparedRow,
} from '../lib/modelo'
import type { TicketeraFilters, TicketeraRow, TicketeraStatus, TicketeraView } from '../types/ticketera'

const PAGE = 25
const DAY_MS = 86_400_000

function limaDayStart(key: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return null
  const value = Date.parse(`${key}T00:00:00-05:00`)
  return Number.isFinite(value) ? value : null
}

/** Misma regla que Disponibilidad del colegio: solapa el rango de fechas, día completo. */
function overlapsReportRange(row: TicketeraRow, from: string, to: string, nowIso: string): boolean {
  const rangeStart = limaDayStart(from)
  const rangeEndDay = limaDayStart(to)
  if (rangeStart == null || rangeEndDay == null) return false
  const rangeEnd = rangeEndDay + DAY_MS
  const openMs = row.open ? Date.parse(row.open) : Number.NaN
  if (!Number.isFinite(openMs)) return false
  const closeMs = row.close ? Date.parse(row.close) : Number.NaN
  const hasClose = Number.isFinite(closeMs)
  if (row.close_text.trim() && !hasClose) return false
  if (hasClose && closeMs < openMs) return false
  const nowMs = Date.parse(nowIso)
  const endMs = hasClose ? closeMs : (Number.isFinite(nowMs) ? nowMs : Date.now())
  if (endMs <= openMs) return false
  return openMs < rangeEnd && endMs > rangeStart
}
const cell = 'px-2.5 py-2 align-top text-[13px] leading-snug text-slate-700 dark:text-slate-300'

const STATUS_CLASS: Record<TicketeraStatus, string> = {
  ABIERTO: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-200',
  CERRADO: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200',
  REVISAR: 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-200',
}

function HistoricoPanel({
  title,
  action,
  children,
}: {
  title: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="min-w-0 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_10px_30px_-22px_rgba(15,23,42,0.7)] md:p-5 dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[15px] font-semibold tracking-tight text-slate-950 dark:text-slate-50">{title}</h2>
        {action}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  )
}

function StatusPill({ status }: { status: TicketeraStatus }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_CLASS[status]}`}>
      {status}
    </span>
  )
}

function clock(seconds: number | null) {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return '—'
  const total = Math.round(seconds)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = total % 60
  return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

const SUMMARY_CARDS = [
  {
    key: 'total',
    label: 'Incidencias',
    hint: 'Una fila es una incidencia',
    icon: Ticket,
    value: 'text-blue-700 dark:text-blue-300',
    chip: 'bg-blue-500/10 text-blue-600 dark:bg-blue-400/15 dark:text-blue-300',
    bar: 'bg-blue-500',
  },
  {
    key: 'cids',
    label: 'CIDs afectados',
    hint: 'Colegios distintos',
    icon: School,
    value: 'text-violet-700 dark:text-violet-300',
    chip: 'bg-violet-500/10 text-violet-600 dark:bg-violet-400/15 dark:text-violet-300',
    bar: 'bg-violet-500',
  },
  {
    key: 'open',
    label: 'Abiertos',
    hint: 'Sin cierre confirmado',
    icon: CircleAlert,
    value: 'text-amber-700 dark:text-amber-300',
    chip: 'bg-amber-500/10 text-amber-600 dark:bg-amber-400/15 dark:text-amber-300',
    bar: 'bg-amber-500',
  },
  {
    key: 'closed',
    label: 'Cerrados',
    hint: 'Cierre válido',
    icon: CircleCheck,
    value: 'text-emerald-700 dark:text-emerald-300',
    chip: 'bg-emerald-500/10 text-emerald-600 dark:bg-emerald-400/15 dark:text-emerald-300',
    bar: 'bg-emerald-500',
  },
  {
    key: 'queja',
    label: 'Quejas',
    hint: 'Razón MINEDU: Queja',
    icon: MessageSquareText,
    value: 'text-rose-700 dark:text-rose-300',
    chip: 'bg-rose-500/10 text-rose-600 dark:bg-rose-400/15 dark:text-rose-300',
    bar: 'bg-rose-500',
  },
  {
    key: 'caida',
    label: 'Caídas de enlace',
    hint: 'Razón MINEDU: Caída de Enlace',
    icon: Unplug,
    value: 'text-orange-700 dark:text-orange-300',
    chip: 'bg-orange-500/10 text-orange-600 dark:bg-orange-400/15 dark:text-orange-300',
    bar: 'bg-orange-500',
  },
  {
    key: 'req',
    label: 'Requerimientos',
    hint: 'Incluye el texto de la hoja',
    icon: ClipboardList,
    value: 'text-cyan-700 dark:text-cyan-300',
    chip: 'bg-cyan-500/10 text-cyan-600 dark:bg-cyan-400/15 dark:text-cyan-300',
    bar: 'bg-cyan-500',
  },
  {
    key: 'missing',
    label: 'Sin razón MINEDU',
    hint: 'Razón MINEDU vacía o sin clasificar',
    icon: CircleHelp,
    value: 'text-slate-700 dark:text-slate-200',
    chip: 'bg-slate-500/10 text-slate-600 dark:bg-slate-400/15 dark:text-slate-300',
    bar: 'bg-slate-400',
  },
] as const

function downloadCsv(rows: PreparedRow[], from: string, to: string) {
  const header = ['Fila', 'Ticket', 'Tipo', 'CID', 'TSS', 'Local', 'Provincia', 'Distrito', 'Código', 'Grupo', 'MINEDU', 'Apertura', 'Restablecimiento', 'Cierre', 'Situación', 'Causa', 'Detalle', 'Detalle de evento']
  const lines = rows.map((row) =>
    [
      row.row,
      row.ticket,
      row.kind_label || row.kind || '',
      row.cid,
      row.tss,
      row.nombre,
      row.provincia,
      row.distrito,
      row.codigo,
      row.grupo,
      row.minedu,
      row.open_text,
      row.restored_text || '',
      row.close_text,
      row.status,
      row.causa,
      row.detalle,
      row.event_detail || '',
    ]
      .map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`)
      .join(';'),
  )
  const blob = new Blob([`\uFEFF${[header.join(';'), ...lines].join('\r\n')}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `Ticketera_${from}_${to}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

export function PaginaTicketera() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const canManage = Boolean(user?.permissions?.includes('incidents.manage'))
  const [manageId, setManageId] = useState<number | null>(null)
  const [comentariosPanel, setComentariosPanel] = useState<ComentariosPanelState | null>(null)
  const query = useQuery({
    queryKey: ['ticketera'],
    queryFn: () => endpoints.ticketera(),
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  })
  const [filters, setFilters] = useState<TicketeraFilters | null>(null)
  const [view, setView] = useState<TicketeraView>('summary')
  const [ticketPage, setTicketPage] = useState(1)
  const [ticketSort, setTicketSort] = useState<'newest' | 'oldest' | 'duration'>('newest')
  const [rankLimit, setRankLimit] = useState('15')
  const [rankMetric, setRankMetric] = useState<'incidents' | 'open'>('incidents')
  const [rankOrder, setRankOrder] = useState<'desc' | 'asc'>('desc')
  const [rankSearch, setRankSearch] = useState('')
  const [rankCid, setRankCid] = useState('')
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    if (!query.data || filters) return
    const day = latestDay(query.data.rows, query.data.today)
    const next = defaultFilters(day)
    if (query.data.source.mode === 'sistema') {
      const range = historyRange(query.data.rows, day)
      next.from = range.from
      next.to = range.to
    }
    setFilters(next)
  }, [query.data, filters])

  const prepared = useMemo(() => {
    if (!query.data || !filters) return null
    return prepare(query.data.rows, filters, query.data.now)
  }, [query.data, filters])

  const stats = useMemo(() => (prepared ? kpis(prepared.rows) : null), [prepared])
  const rankingBase = useMemo(() => {
    if (!query.data || !filters) return []
    return prepare(query.data.rows, { ...filters, minedu: '' }, query.data.now).rows
  }, [query.data, filters])

  const ranking = useMemo(() => {
    if (!prepared) return []
    const map = new Map<string, { cid: string; tss: string; name: string; rows: PreparedRow[]; opened: number }>()
    for (const row of prepared.rows) {
      const cid = row.cid.trim()
      if (!cid || cid.startsWith('#') || cid.toUpperCase() === 'NINGUNO') continue
      const group = map.get(cid) ?? { cid, tss: row.tss, name: row.nombre, rows: [], opened: 0 }
      group.rows.push(row)
      if (row.status === 'ABIERTO') group.opened += 1
      if (!group.name && row.nombre) group.name = row.nombre
      map.set(cid, group)
    }
    const queryText = rankSearch.trim().toUpperCase()
    const metric = (group: { rows: PreparedRow[]; opened: number }) => (rankMetric === 'open' ? group.opened : group.rows.length)
    const direction = rankOrder === 'asc' ? 1 : -1
    const ranked = [...map.values()]
      .filter((group) => !queryText || `${group.cid} ${group.tss}`.toUpperCase().includes(queryText))
      .sort((a, b) => direction * (metric(a) - metric(b)) || a.cid.localeCompare(b.cid, 'es', { numeric: true }))
    return rankLimit === 'all' ? ranked : ranked.slice(0, Number(rankLimit) || 15)
  }, [prepared, rankLimit, rankMetric, rankOrder, rankSearch])

  const detailRows = useMemo(() => {
    if (rankCid && query.data && filters) {
      return query.data.rows
        .filter((row) => row.cid.trim() === rankCid && overlapsReportRange(row, filters.from, filters.to, query.data.now))
        .sort((a, b) => {
          const aOpen = a.open ? Date.parse(a.open) : 0
          const bOpen = b.open ? Date.parse(b.open) : 0
          return (Number.isFinite(bOpen) ? bOpen : 0) - (Number.isFinite(aOpen) ? aOpen : 0) || a.row - b.row
        })
    }
    const source = ranking.flatMap((group) => group.rows)
    return [...source].sort((a, b) => (b.openMs ?? 0) - (a.openMs ?? 0) || a.row - b.row)
  }, [ranking, rankCid, query.data, filters])

  const rankingKeys = useMemo(() => {
    const keys = new Set<number>()
    const group = rankCid ? ranking.find((item) => item.cid === rankCid) : null
    for (const row of group?.rows ?? []) keys.add(row.row)
    return keys
  }, [ranking, rankCid])

  const tickets = useMemo(() => {
    const rows = [...(prepared?.rows ?? [])]
    rows.sort((a, b) => {
      if (ticketSort === 'duration') return (b.periodSeconds ?? 0) - (a.periodSeconds ?? 0) || a.row - b.row
      if (ticketSort === 'oldest') return (a.openMs ?? 0) - (b.openMs ?? 0) || a.row - b.row
      return (b.openMs ?? 0) - (a.openMs ?? 0) || a.row - b.row
    })
    return rows
  }, [prepared, ticketSort])

  function patch(partial: Partial<TicketeraFilters>) {
    setFilters((current) => (current ? { ...current, ...partial } : current))
    setTicketPage(1)
  }

  async function refreshNow() {
    setRefreshing(true)
    try {
      await queryClient.fetchQuery({
        queryKey: ['ticketera'],
        queryFn: () => endpoints.ticketera(true),
      })
    } finally {
      setRefreshing(false)
    }
  }

  const errorMessage = query.error instanceof ApiError ? query.error.message : query.error ? 'No se pudo leer el histórico.' : null
  const pages = Math.max(1, Math.ceil(tickets.length / PAGE))
  const page = Math.min(ticketPage, pages)
  const visibleTickets = tickets.slice((page - 1) * PAGE, page * PAGE)

  return (
    <DisenoApp>
      <EncabezadoPagina
        icon={<Ticket className="h-5 w-5" />}
        title="Histórico de tickets"
        description={
          query.data?.source.mode === 'sistema'
            ? 'Dashboard visual del histórico: KPIs por razón MINEDU, cuadre del día y detalle con comentarios NOC. La gestión se hace en la incidencia.'
            : 'Dashboard visual del histórico de tickets. Las gráficas se actualizan solas cada 30 segundos.'
        }
        badges={
          query.data ? (
            <span className="text-xs font-medium text-slate-500">
              {refreshing || query.isFetching ? 'Actualizando…' : `Leído ${formatDateTime24(query.data.now)}`}
              {' · '}
              {query.data.source.row_count.toLocaleString('es-PE')} registros
            </span>
          ) : null
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <Boton variant="secondary" onClick={() => void refreshNow()} disabled={refreshing}>
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              Actualizar
            </Boton>
            <Boton
              variant="secondary"
              disabled={!prepared?.rows.length || !filters}
              onClick={() => filters && prepared && downloadCsv(prepared.rows, filters.from, filters.to)}
            >
              <Download className="h-4 w-4" />
              CSV
            </Boton>
          </div>
        }
      />

      {query.isLoading ? <LoadingState label="Cargando histórico…" /> : null}
      {errorMessage ? <ErrorState message={errorMessage} /> : null}

      {query.data && filters && prepared && stats ? (
        <div className="space-y-4">
          <TarjetaFiltro
            title="Periodo y filtros"
            actions={
              <div className="flex flex-wrap gap-2">
                <Boton variant="secondary" onClick={() => patch({ from: query.data.today, to: query.data.today })}>
                  Hoy
                </Boton>
                <Boton
                  variant="secondary"
                  onClick={() => patch(historyRange(query.data.rows, query.data.today))}
                >
                  Historial
                </Boton>
                <Boton variant="ghost" onClick={() => patch(defaultFilters(latestDay(query.data.rows, query.data.today)))}>
                  Limpiar
                </Boton>
              </div>
            }
          >
            <FormField label="Fecha inicial">
              <Input type="date" value={filters.from} onChange={(event) => patch({ from: event.target.value })} />
            </FormField>
            <FormField label="Fecha final">
              <Input type="date" value={filters.to} onChange={(event) => patch({ to: event.target.value })} />
            </FormField>
            <FormField label="Horario">
              <Select value={filters.mode} onChange={(event) => patch({ mode: event.target.value as '24' | '8' })}>
                <option value="24">Día completo · 24 horas</option>
                <option value="8">Jornada · 08:00 a 16:00</option>
              </Select>
            </FormField>
            <FormField label="Provincia">
              <FilterSelect field="provincia" value={filters.provincia} rows={query.data.rows} onChange={(value) => patch({ provincia: value })} />
            </FormField>
            <FormField label="Grupo de causa">
              <FilterSelect field="grupo" value={filters.grupo} rows={query.data.rows} onChange={(value) => patch({ grupo: value })} />
            </FormField>
            <FormField label="Situación">
              <FilterSelect field="status" value={filters.status} rows={query.data.rows} onChange={(value) => patch({ status: value })} />
            </FormField>
            <details className="col-span-full">
              <summary className="cursor-pointer text-xs font-semibold text-blue-600">Más filtros</summary>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {(['distrito', 'energia', 'codigo', 'minedu', 'area', 'atencion'] as const).map((field) => (
                  <FormField key={field} label={FILTER_LABELS[field].replace(/^Todos |^Todas /, '')}>
                    <FilterSelect field={field} value={filters[field]} rows={query.data.rows} onChange={(value) => patch({ [field]: value })} />
                  </FormField>
                ))}
                <FormField label="Selección">
                  <Select value={filters.criterion} onChange={(event) => patch({ criterion: event.target.value as TicketeraFilters['criterion'] })}>
                    <option value="opening">Iniciadas dentro del horario</option>
                    <option value="overlap">Activas durante el horario</option>
                  </Select>
                </FormField>
                <FormField label="Buscar ticket o local">
                  <Input
                    type="search"
                    value={filters.search}
                    placeholder="CID o TSS"
                    onChange={(event) => patch({ search: event.target.value })}
                  />
                </FormField>
              </div>
            </details>
          </TarjetaFiltro>

          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200/80 bg-white px-4 py-3 text-[12px] text-slate-500 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
            <span className="font-semibold tracking-wide text-slate-700 uppercase dark:text-slate-200">Periodo</span>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200">
              {filters.from === filters.to
                ? filters.from.split('-').reverse().join('/')
                : `${filters.from.split('-').reverse().join('/')} — ${filters.to.split('-').reverse().join('/')}`}
            </span>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200">
              {filters.mode === '8' ? '08:00 a 16:00' : '24 horas'}
            </span>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200">
              {filters.criterion === 'overlap' ? 'Activas durante el horario' : 'Iniciadas dentro del horario'}
            </span>
          </div>
          {prepared.error ? <ErrorState message={prepared.error} /> : null}

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {SUMMARY_CARDS.map((card) => {
              const Icon = card.icon
              return (
                <article
                  key={card.key}
                  className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white px-4 py-4 shadow-[0_10px_30px_-22px_rgba(15,23,42,0.7)] dark:border-slate-800 dark:bg-slate-900"
                >
                  <span className={`absolute inset-x-0 top-0 h-0.5 ${card.bar}`} aria-hidden />
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold tracking-[0.14em] text-slate-500 uppercase dark:text-slate-400">
                        {card.label}
                      </p>
                      <p className={`mt-2 text-3xl font-semibold tabular-nums tracking-tight ${card.value}`}>
                        {stats[card.key].toLocaleString('es-PE')}
                      </p>
                    </div>
                    <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${card.chip}`}>
                      <Icon className="h-4 w-4" aria-hidden />
                    </span>
                  </div>
                  <p className="mt-3 text-[12px] text-slate-500 dark:text-slate-400">
                    {card.key === 'closed' && stats.review
                      ? `${stats.review.toLocaleString('es-PE')} por revisar`
                      : card.hint}
                  </p>
                </article>
              )
            })}
          </div>
          <p className="rounded-2xl border border-slate-200/70 bg-slate-50/80 px-4 py-3 text-[12px] leading-relaxed text-slate-500 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-400">
            KPIs del periodo filtrado (una fila = una incidencia). Quejas, caídas de enlace, requerimientos y sin razón
            MINEDU salen de esa columna. Puede diferir de Seguimiento de caídas si ese reporte incluye filas sin ticket
            o usa otros filtros.
          </p>

          <div className="flex w-fit max-w-full flex-wrap gap-1 rounded-2xl border border-slate-200/80 bg-slate-100/80 p-1 shadow-sm dark:border-slate-800 dark:bg-slate-950">
            {(
              [
                ['summary', 'Resumen'],
                ['caidos', 'Resumen de caídos'],
                ['tickets', 'Tickets'],
                ['sla', 'SLA · Anexo 30'],
                ['quality', 'Calidad de datos'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setView(id)}
                className={`rounded-xl px-3.5 py-2 text-xs font-semibold transition ${
                  view === id
                    ? 'bg-white text-slate-950 shadow-sm dark:bg-slate-800 dark:text-white'
                    : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {view === 'summary' ? (
            <div className="space-y-4">
              <GraficosTicketera
                rows={prepared.rows}
                intervals={prepared.intervals}
                filters={filters}
                now={query.data.now}
                onDay={(key) => patch({ from: key, to: key })}
                onFilter={(field, value) => patch({ [field]: value })}
              />
              <HistoricoPanel title={rankLimit === 'all' ? 'Ranking de locales' : `Ranking · Top ${rankLimit}`}>
                <div className="mb-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <FormField label="Mostrar">
                    <Select value={rankLimit} onChange={(event) => setRankLimit(event.target.value)}>
                      <option value="5">Top 5</option>
                      <option value="10">Top 10</option>
                      <option value="15">Top 15</option>
                      <option value="20">Top 20</option>
                      <option value="50">Top 50</option>
                      <option value="all">Todos</option>
                    </Select>
                  </FormField>
                  <FormField label="Ordenar por">
                    <Select value={rankMetric} onChange={(event) => setRankMetric(event.target.value as 'incidents' | 'open')}>
                      <option value="incidents">Número de incidencias</option>
                      <option value="open">Tickets abiertos</option>
                    </Select>
                  </FormField>
                  <FormField label="Orden">
                    <Select value={rankOrder} onChange={(event) => setRankOrder(event.target.value as 'desc' | 'asc')}>
                      <option value="desc">Mayor a menor</option>
                      <option value="asc">Menor a mayor</option>
                    </Select>
                  </FormField>
                  <FormField label="Buscar en el ranking">
                    <Input value={rankSearch} placeholder="CID o TSS" onChange={(event) => setRankSearch(event.target.value)} />
                  </FormField>
                </div>
                <DataTableContainer>
                  <table className={tableClassName}>
                    <thead className={theadClassName}>
                      <tr>
                        <th className={thClassName}>#</th>
                        <th className={thClassName}>Local / CID</th>
                        <th className={thClassName}>Incidencias</th>
                        <th className={thClassName}>Abiertos</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ranking.length ? ranking.map((group, index) => (
                        <tr key={group.cid} className={trClassName}>
                          <td className={cell}>{index + 1}</td>
                          <td className={`${cell} max-w-none`}>
                            <button
                              type="button"
                              className="font-semibold text-blue-600"
                              onClick={() => {
                                setRankCid(group.cid)
                                document.getElementById('school-timelines')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                              }}
                            >
                              {group.cid}
                            </button>
                            <span className="block truncate text-[11px] text-slate-500">{group.name || `TSS ${group.tss || '—'}`}</span>
                          </td>
                          <td className={cell}>{group.rows.length}</td>
                          <td className={cell}>{group.opened}</td>
                        </tr>
                      )) : (
                        <tr><td className={cell} colSpan={4}>Sin locales.</td></tr>
                      )}
                    </tbody>
                  </table>
                </DataTableContainer>
                <div className="mt-4">
                  <FormField label="Local del ranking">
                    <Select value={rankCid} onChange={(event) => setRankCid(event.target.value)}>
                      <option value="">Todos los locales del ranking</option>
                      {rankCid && !ranking.some((group) => group.cid === rankCid) ? (
                        <option value={rankCid}>{rankCid}</option>
                      ) : null}
                      {ranking.map((group) => (
                        <option key={group.cid} value={group.cid}>
                          {group.cid} · {group.name || `TSS ${group.tss}`} · {group.rows.length}
                        </option>
                      ))}
                    </Select>
                  </FormField>
                  <p className="mt-2 text-xs text-slate-500">
                    {rankCid
                      ? `${detailRows.length.toLocaleString('es-PE')} incidencias en el periodo, las mismas de Disponibilidad. El ranking cuenta ${rankingKeys.size.toLocaleString('es-PE')}: solo entran las que abrieron dentro del filtro.`
                      : `${detailRows.length.toLocaleString('es-PE')} incidencias en el detalle.`}
                  </p>
                </div>
                <div className="mt-3">
                  <DataTableContainer>
                    <table className={tableClassName}>
                      <thead className={theadClassName}>
                        <tr>
                          {['Ticket', 'CID', 'Código', 'Apertura', 'Situación', 'Acciones'].map((label) => (
                            <th key={label} className={thClassName}>{label}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {(rankCid ? detailRows : detailRows.slice(0, 20)).map((row) => (
                          <tr key={`${row.row}-${row.ticket}`} className={trClassName}>
                            <td className={cell}>
                              {row.ticket || 'Sin ticket'}
                              {rankCid && !rankingKeys.has(row.row) ? (
                                <span className="mt-1 block text-[11px] font-medium text-amber-700 dark:text-amber-300">
                                  No entra al ranking: quedó fuera del filtro de apertura u horario.
                                </span>
                              ) : null}
                            </td>
                            <td className={cell}>{row.cid}</td>
                            <td className={cell}>{row.codigo || '—'}</td>
                            <td className={`${cell} whitespace-nowrap`}>{row.open_text || '—'}</td>
                            <td className={cell}><StatusPill status={row.status} /></td>
                            <td className={cell}>
                              {row.incident_id ? (
                                <div className="flex flex-col items-stretch gap-1">
                                  <button
                                    type="button"
                                    className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-2 py-1.5 text-[11px] font-semibold text-sky-800 hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-950/50 dark:text-sky-200"
                                    onClick={() =>
                                      setComentariosPanel({
                                        incidentId: row.incident_id as number,
                                        kind: 'detalle',
                                        cid: row.cid,
                                        local: row.nombre,
                                        ticket: row.ticket,
                                      })
                                    }
                                  >
                                    <MessageSquareText className="h-3.5 w-3.5 shrink-0" aria-hidden />
                                    Ver detalle
                                  </button>
                                  <button
                                    type="button"
                                    className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                                    onClick={() =>
                                      setComentariosPanel({
                                        incidentId: row.incident_id as number,
                                        kind: 'evento',
                                        cid: row.cid,
                                        local: row.nombre,
                                        ticket: row.ticket,
                                      })
                                    }
                                  >
                                    <ScrollText className="h-3.5 w-3.5 shrink-0" aria-hidden />
                                    Detalle de evento
                                  </button>
                                </div>
                              ) : (
                                <span className="text-[11px] text-slate-400">Sin incidencia</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </DataTableContainer>
                </div>
              </HistoricoPanel>
              <div id="school-timelines">
                <LineasTiempoColegio
                  rows={query.data.rows}
                  cid={rankCid}
                  onCidChange={setRankCid}
                  from={filters.from}
                  to={filters.to}
                  now={query.data.now}
                  rankingRows={rankCid ? ranking.find((group) => group.cid === rankCid)?.rows.length ?? 0 : null}
                />
              </div>
            </div>
          ) : null}

          {view === 'caidos' ? <PanelCuadre rows={prepared.rows} now={query.data.now} /> : null}

          {view === 'sla' ? (
            <PanelSla
              allRows={query.data.rows}
              visibleRows={prepared.rows}
              rankingRows={rankingBase}
              now={query.data.now}
              topMinedu={filters.minedu}
            />
          ) : null}

          {view === 'tickets' ? (
            <HistoricoPanel
              title="Detalle de incidencias"
              action={
                <Select value={ticketSort} onChange={(event) => { setTicketSort(event.target.value as typeof ticketSort); setTicketPage(1) }}>
                  <option value="newest">Apertura más reciente</option>
                  <option value="oldest">Apertura más antigua</option>
                  <option value="duration">Mayor duración en el periodo</option>
                </Select>
              }
            >
              <DataTableContainer>
                <table className={tableClassName}>
                  <thead className={theadClassName}>
                    <tr>
                      {['Fila', 'Ticket', 'Tipo', 'TSS / ubicación', 'Código', 'Razón', 'Apertura', 'Restablecimiento', 'Cierre', 'Situación', 'Duración', 'En el periodo', 'SLA', 'Acciones'].map((label) => (
                        <th key={label} className={thClassName}>{label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visibleTickets.length ? visibleTickets.map((row) => (
                      <tr key={`${row.row}-${row.ticket}`} className={trClassName}>
                        <td className={cell}>{row.row}</td>
                        <td className={`${cell} max-w-none`}>
                          {row.incident_id ? (
                            <button type="button" className="font-semibold text-blue-700 hover:underline dark:text-blue-300" onClick={() => setManageId(row.incident_id ?? null)}>
                              {row.ticket || 'Sin ticket'}
                            </button>
                          ) : (
                            <span className="font-semibold">{row.ticket || 'Sin ticket'}</span>
                          )}
                          <span className="block text-[11px] text-slate-500">CID {row.cid || '—'}</span>
                        </td>
                        <td className={cell}>{row.kind_label || 'Correctivo'}</td>
                        <td className={`${cell} max-w-none`}>
                          TSS {row.tss || '—'}
                          <span className="block truncate text-[11px] text-slate-500">{row.nombre || row.provincia || '—'}</span>
                        </td>
                        <td className={`${cell} max-w-none`}>
                          {row.codigo || '—'}
                          <span className="block truncate text-[11px] text-slate-500">{row.grupo || 'Sin grupo'}</span>
                        </td>
                        <td className={cell}>{row.minedu || '—'}</td>
                        <td className={`${cell} whitespace-nowrap`}>{row.open_text || '—'}</td>
                        <td className={`${cell} whitespace-nowrap`}>{row.restored_text || '—'}</td>
                        <td className={`${cell} whitespace-nowrap`}>{row.close_text || '—'}</td>
                        <td className={cell}><StatusPill status={row.status} /></td>
                        <td className={`${cell} whitespace-nowrap tabular-nums`}>{clock(row.totalSeconds)}</td>
                        <td className={`${cell} whitespace-nowrap tabular-nums`}>{clock(row.periodSeconds)}</td>
                        <td className={`${cell} whitespace-nowrap tabular-nums`}>{clock(row.sla_seconds)}</td>
                        <td className={cell}>
                          {row.incident_id ? (
                            <div className="flex flex-col items-stretch gap-1">
                              <button
                                type="button"
                                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-2 py-1.5 text-[11px] font-semibold whitespace-nowrap text-sky-800 hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-950/50 dark:text-sky-200"
                                onClick={() =>
                                  setComentariosPanel({
                                    incidentId: row.incident_id as number,
                                    kind: 'detalle',
                                    cid: row.cid,
                                    local: row.nombre,
                                    ticket: row.ticket,
                                  })
                                }
                              >
                                <MessageSquareText className="h-3.5 w-3.5 shrink-0" aria-hidden />
                                Ver detalle
                              </button>
                              <button
                                type="button"
                                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] font-semibold whitespace-nowrap text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                                onClick={() =>
                                  setComentariosPanel({
                                    incidentId: row.incident_id as number,
                                    kind: 'evento',
                                    cid: row.cid,
                                    local: row.nombre,
                                    ticket: row.ticket,
                                  })
                                }
                              >
                                <ScrollText className="h-3.5 w-3.5 shrink-0" aria-hidden />
                                Detalle de evento
                              </button>
                            </div>
                          ) : (
                            <span className="text-[11px] text-slate-400">Sin incidencia</span>
                          )}
                        </td>
                      </tr>
                    )) : (
                      <tr><td className={cell} colSpan={14}>Sin tickets para estos filtros.</td></tr>
                    )}
                  </tbody>
                </table>
              </DataTableContainer>
              <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                <span>{tickets.length.toLocaleString('es-PE')} incidencias · Página {page} de {pages}</span>
                <div className="flex gap-2">
                  <Boton variant="secondary" disabled={page <= 1} onClick={() => setTicketPage(page - 1)}>Anterior</Boton>
                  <Boton variant="secondary" disabled={page >= pages} onClick={() => setTicketPage(page + 1)}>Siguiente</Boton>
                </div>
              </div>
            </HistoricoPanel>
          ) : null}

          {view === 'quality' ? (
            <div className="space-y-4">
              <GrillaMetricas dense>
                <TarjetaMetrica icon={<Ticket />} label="Filas leídas" value={query.data.audit.read_rows} description="Toda la hoja" />
                <TarjetaMetrica icon={<Ticket />} label="Con observaciones" value={query.data.audit.affected_rows} description="Puede haber varias por fila" tone="warning" />
                <TarjetaMetrica icon={<Ticket />} label="MINEDU vacío" value={query.data.audit.missing_minedu} />
                <TarjetaMetrica icon={<Ticket />} label="Aperturas inválidas" value={query.data.audit.invalid_open} tone="danger" />
                <TarjetaMetrica icon={<Ticket />} label="Cierres inválidos" value={query.data.audit.invalid_close + query.data.audit.inverted_dates} />
                <TarjetaMetrica icon={<Ticket />} label="Tickets duplicados" value={query.data.audit.duplicate_tickets} description="Se conservan las filas" />
              </GrillaMetricas>
              <HistoricoPanel title="Observaciones" action={<span className="text-xs text-slate-500">{query.data.warning_count.toLocaleString('es-PE')}</span>}>
                {query.data.warnings.length ? (
                  <DataTableContainer>
                    <table className={tableClassName}>
                      <thead className={theadClassName}>
                        <tr>
                          <th className={thClassName}>Fila</th>
                          <th className={thClassName}>Ticket</th>
                          <th className={thClassName}>Observación</th>
                        </tr>
                      </thead>
                      <tbody>
                        {query.data.warnings.map((warning, index) => (
                          <tr key={`${warning.row}-${index}`} className={trClassName}>
                            <td className={cell}>{warning.row}</td>
                            <td className={cell}>{warning.ticket || '—'}</td>
                            <td className={`${cell} max-w-none`}>{warning.message}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </DataTableContainer>
                ) : (
                  <EmptyState title="Sin observaciones" description="La hoja no reportó problemas en esta lectura." />
                )}
              </HistoricoPanel>
            </div>
          ) : null}
        </div>
      ) : null}
      {comentariosPanel ? (
        <PanelComentariosIncidente
          panel={comentariosPanel}
          showEvidence
          onClose={() => setComentariosPanel(null)}
        />
      ) : null}
      {manageId !== null ? (
        <ModalGestionIncidente
          incidentId={manageId}
          initialTab={canManage ? 'management' : 'summary'}
          readOnly={!canManage}
          onClose={() => {
            setManageId(null)
            void queryClient.invalidateQueries({ queryKey: ['ticketera'] })
          }}
        />
      ) : null}
    </DisenoApp>
  )
}

function FilterSelect({
  field,
  value,
  rows,
  onChange,
}: {
  field: FilterField
  value: string
  rows: Parameters<typeof fieldOptions>[0]
  onChange: (value: string) => void
}) {
  const options = fieldOptions(rows, field)
  return (
    <Select value={options.includes(value) ? value : ''} onChange={(event) => onChange(event.target.value)}>
      <option value="">{FILTER_LABELS[field]}</option>
      {options.map((option) => (
        <option key={option} value={option}>
          {optionLabel(option)}
        </option>
      ))}
    </Select>
  )
}
