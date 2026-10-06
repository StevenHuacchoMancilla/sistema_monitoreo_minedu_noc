import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, RefreshCw, Ticket } from 'lucide-react'
import { endpoints } from '../../../api/endpoints'
import { ApiError } from '../../../api/client'
import { AppLayout } from '../../../layouts/AppLayout'
import { PageHeader } from '../../../components/ui/PageHeader'
import { FilterCard } from '../../../components/ui/FilterCard'
import { FormField, Input, Select } from '../../../components/ui/FormControls'
import { Button } from '../../../components/ui/Button'
import { MetricCard } from '../../../components/ui/MetricCard'
import { SectionCard } from '../../../components/ui/Card'
import { DataTableContainer, tableClassName, thClassName, theadClassName, trClassName } from '../../../components/ui/DataTableFrame'
import { EmptyState, ErrorState, LoadingState } from '../../../components/ui/States'
import { formatDateTime24, formatDuration } from '../../../lib/datetime'
import { TicketeraCharts } from '../components/TicketeraCharts'
import { SchoolTimelines } from '../components/SchoolTimelines'
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
} from '../lib/model'
import type { TicketeraFilters, TicketeraStatus, TicketeraView } from '../types/ticketera'

const PAGE = 25
const cell = 'px-2.5 py-2 align-top text-[13px] leading-snug text-slate-700 dark:text-slate-300'

const STATUS_CLASS: Record<TicketeraStatus, string> = {
  ABIERTO: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-200',
  CERRADO: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200',
  REVISAR: 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-200',
}

function StatusPill({ status }: { status: TicketeraStatus }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_CLASS[status]}`}>
      {status}
    </span>
  )
}

function downloadCsv(rows: PreparedRow[], from: string, to: string) {
  const header = ['Fila', 'Ticket', 'CID', 'TSS', 'Local', 'Provincia', 'Distrito', 'Código', 'Grupo', 'MINEDU', 'Apertura', 'Cierre', 'Situación', 'Causa', 'Detalle']
  const lines = rows.map((row) =>
    [
      row.row,
      row.ticket,
      row.cid,
      row.tss,
      row.nombre,
      row.provincia,
      row.distrito,
      row.codigo,
      row.grupo,
      row.minedu,
      row.open_text,
      row.close_text,
      row.status,
      row.causa,
      row.detalle,
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

export function TicketeraPage() {
  const queryClient = useQueryClient()
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
    setFilters(defaultFilters(latestDay(query.data.rows, query.data.today)))
  }, [query.data, filters])

  const prepared = useMemo(() => {
    if (!query.data || !filters) return null
    return prepare(query.data.rows, filters, query.data.now)
  }, [query.data, filters])

  const stats = useMemo(() => (prepared ? kpis(prepared.rows) : null), [prepared])

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
      .filter((group) => !queryText || `${group.cid} ${group.tss} ${group.name}`.toUpperCase().includes(queryText))
      .sort((a, b) => direction * (metric(a) - metric(b)) || a.cid.localeCompare(b.cid, 'es', { numeric: true }))
    return rankLimit === 'all' ? ranked : ranked.slice(0, Number(rankLimit) || 15)
  }, [prepared, rankLimit, rankMetric, rankOrder, rankSearch])

  const detailRows = useMemo(() => {
    const source = rankCid ? ranking.find((group) => group.cid === rankCid)?.rows ?? [] : ranking.flatMap((group) => group.rows)
    return [...source].sort((a, b) => (b.openMs ?? 0) - (a.openMs ?? 0) || a.row - b.row)
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

  const errorMessage = query.error instanceof ApiError ? query.error.message : query.error ? 'No se pudo leer Ticketera.' : null
  const pages = Math.max(1, Math.ceil(tickets.length / PAGE))
  const page = Math.min(ticketPage, pages)
  const visibleTickets = tickets.slice((page - 1) * PAGE, page * PAGE)

  return (
    <AppLayout>
      <PageHeader
        icon={<Ticket className="h-5 w-5" />}
        title="Ticketera"
        description="Incidencias de la hoja TICKETERA. Las gráficas se actualizan solas cada 30 segundos."
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
            <Button variant="secondary" onClick={() => void refreshNow()} disabled={refreshing}>
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              Actualizar
            </Button>
            <Button
              variant="secondary"
              disabled={!prepared?.rows.length || !filters}
              onClick={() => filters && prepared && downloadCsv(prepared.rows, filters.from, filters.to)}
            >
              <Download className="h-4 w-4" />
              CSV
            </Button>
          </div>
        }
      />

      {query.isLoading ? <LoadingState label="Leyendo TICKETERA…" /> : null}
      {errorMessage ? <ErrorState message={errorMessage} /> : null}

      {query.data && filters && prepared && stats ? (
        <div className="space-y-4">
          <FilterCard
            title="Periodo y filtros"
            actions={
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => patch({ from: query.data.today, to: query.data.today })}>
                  Hoy
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => patch(historyRange(query.data.rows, query.data.today))}
                >
                  Historial
                </Button>
                <Button variant="ghost" onClick={() => patch(defaultFilters(latestDay(query.data.rows, query.data.today)))}>
                  Limpiar
                </Button>
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
                    placeholder="Ticket, CID, TSS, causa o MINEDU"
                    onChange={(event) => patch({ search: event.target.value })}
                  />
                </FormField>
              </div>
            </details>
          </FilterCard>

          <p className="text-xs font-medium text-slate-500">
            {filters.from === filters.to ? `Solo ${filters.from.split('-').reverse().join('/')}` : `${filters.from.split('-').reverse().join('/')} al ${filters.to.split('-').reverse().join('/')}`}
            {' · '}
            {filters.mode === '8' ? '08:00 a 16:00' : '24 horas'}
            {' · '}
            {filters.criterion === 'overlap' ? 'Activas durante el horario' : 'Iniciadas dentro del horario'}
          </p>
          {prepared.error ? <ErrorState message={prepared.error} /> : null}

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
            <MetricCard icon={<Ticket className="h-4 w-4" />} label="Incidencias" value={stats.total} description="Una fila es una incidencia" />
            <MetricCard icon={<Ticket className="h-4 w-4" />} label="CIDs afectados" value={stats.cids} description="CIDs distintos" tone="info" />
            <MetricCard icon={<Ticket className="h-4 w-4" />} label="Abiertos" value={stats.open} description="Sin cierre" tone="warning" />
            <MetricCard icon={<Ticket className="h-4 w-4" />} label="Cerrados" value={stats.closed} description={stats.review ? `${stats.review} por revisar` : 'Fechas consistentes'} tone="success" />
            <MetricCard icon={<Ticket className="h-4 w-4" />} label="Energía · G4" value={stats.energy} description={stats.total ? `${((stats.energy / stats.total) * 100).toFixed(1)}% del total` : '0%'} />
            <MetricCard icon={<Ticket className="h-4 w-4" />} label="Desconexiones · CR45" value={stats.disconnect} description={stats.total ? `${((stats.disconnect / stats.total) * 100).toFixed(1)}% del total` : '0%'} tone="danger" />
          </div>

          <div className="flex w-fit gap-1 rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-900">
            {(
              [
                ['summary', 'Resumen'],
                ['tickets', 'Tickets'],
                ['quality', 'Calidad de datos'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setView(id)}
                className={`rounded-lg px-3 py-2 text-xs font-semibold ${view === id ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800'}`}
              >
                {label}
              </button>
            ))}
          </div>

          {view === 'summary' ? (
            <div className="space-y-4">
              <TicketeraCharts
                rows={prepared.rows}
                intervals={prepared.intervals}
                filters={filters}
                now={query.data.now}
                onDay={(key) => patch({ from: key, to: key })}
                onFilter={(field, value) => patch({ [field]: value })}
              />
              <SectionCard title={rankLimit === 'all' ? 'Ranking de locales' : `Ranking · Top ${rankLimit}`}>
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
                    <Input value={rankSearch} placeholder="CID, TSS o nombre" onChange={(event) => setRankSearch(event.target.value)} />
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
                  <p className="mt-2 text-xs text-slate-500">{detailRows.length.toLocaleString('es-PE')} incidencias en el detalle.</p>
                </div>
                <div className="mt-3">
                  <DataTableContainer>
                    <table className={tableClassName}>
                      <thead className={theadClassName}>
                        <tr>
                          {['Ticket', 'CID', 'Código', 'Apertura', 'Situación'].map((label) => (
                            <th key={label} className={thClassName}>{label}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {detailRows.slice(0, 20).map((row) => (
                          <tr key={`${row.row}-${row.ticket}`} className={trClassName}>
                            <td className={cell}>{row.ticket || 'Sin ticket'}</td>
                            <td className={cell}>{row.cid}</td>
                            <td className={cell}>{row.codigo || '—'}</td>
                            <td className={`${cell} whitespace-nowrap`}>{row.open_text || '—'}</td>
                            <td className={cell}><StatusPill status={row.status} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </DataTableContainer>
                </div>
              </SectionCard>
              <div id="school-timelines">
                <SchoolTimelines
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

          {view === 'tickets' ? (
            <SectionCard
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
                      {['Fila', 'Ticket', 'TSS / ubicación', 'Código', 'MINEDU', 'Apertura', 'Situación', 'En el periodo'].map((label) => (
                        <th key={label} className={thClassName}>{label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visibleTickets.length ? visibleTickets.map((row) => (
                      <tr key={`${row.row}-${row.ticket}`} className={trClassName}>
                        <td className={cell}>{row.row}</td>
                        <td className={`${cell} max-w-none`}>
                          <span className="font-semibold">{row.ticket || 'Sin ticket'}</span>
                          <span className="block text-[11px] text-slate-500">CID {row.cid || '—'}</span>
                        </td>
                        <td className={`${cell} max-w-none`}>
                          TSS {row.tss || '—'}
                          <span className="block truncate text-[11px] text-slate-500">{row.nombre || row.provincia || '—'}</span>
                        </td>
                        <td className={`${cell} max-w-none`}>
                          {row.codigo || '—'}
                          <span className="block truncate text-[11px] text-slate-500">{row.grupo || 'Sin grupo'}</span>
                        </td>
                        <td className={`${cell} max-w-[16rem]`}>{row.minedu || 'Sin clasificación'}</td>
                        <td className={`${cell} whitespace-nowrap`}>{row.open_text || '—'}</td>
                        <td className={cell}><StatusPill status={row.status} /></td>
                        <td className={cell}>{formatDuration(row.periodSeconds)}</td>
                      </tr>
                    )) : (
                      <tr><td className={cell} colSpan={8}>Sin tickets para estos filtros.</td></tr>
                    )}
                  </tbody>
                </table>
              </DataTableContainer>
              <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                <span>{tickets.length.toLocaleString('es-PE')} incidencias · Página {page} de {pages}</span>
                <div className="flex gap-2">
                  <Button variant="secondary" disabled={page <= 1} onClick={() => setTicketPage(page - 1)}>Anterior</Button>
                  <Button variant="secondary" disabled={page >= pages} onClick={() => setTicketPage(page + 1)}>Siguiente</Button>
                </div>
              </div>
            </SectionCard>
          ) : null}

          {view === 'quality' ? (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <MetricCard icon={<Ticket className="h-4 w-4" />} label="Filas leídas" value={query.data.audit.read_rows} description="Toda la hoja" />
                <MetricCard icon={<Ticket className="h-4 w-4" />} label="Con observaciones" value={query.data.audit.affected_rows} description="Puede haber varias por fila" tone="warning" />
                <MetricCard icon={<Ticket className="h-4 w-4" />} label="MINEDU vacío" value={query.data.audit.missing_minedu} />
                <MetricCard icon={<Ticket className="h-4 w-4" />} label="Aperturas inválidas" value={query.data.audit.invalid_open} tone="danger" />
                <MetricCard icon={<Ticket className="h-4 w-4" />} label="Cierres inválidos" value={query.data.audit.invalid_close + query.data.audit.inverted_dates} />
                <MetricCard icon={<Ticket className="h-4 w-4" />} label="Tickets duplicados" value={query.data.audit.duplicate_tickets} description="Se conservan las filas" />
              </div>
              <SectionCard title="Observaciones" action={<span className="text-xs text-slate-500">{query.data.warning_count.toLocaleString('es-PE')}</span>}>
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
              </SectionCard>
            </div>
          ) : null}
        </div>
      ) : null}
    </AppLayout>
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
