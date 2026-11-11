import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ChevronLeft,
  ChevronRight,
  Clock3,
  Download,
  FileSpreadsheet,
  MessageSquareText,
  RefreshCw,
  ScrollText,
  Ticket,
  X,
} from 'lucide-react'
import { AppLayout } from '../../../layouts/AppLayout'
import { PageHeader } from '../../../components/ui/PageHeader'
import { FilterCard } from '../../../components/ui/FilterCard'
import { FormField, Input, SearchField, Select } from '../../../components/ui/FormControls'
import { Button } from '../../../components/ui/Button'
import { EmptyState, ErrorState, LoadingState } from '../../../components/ui/States'
import { DataTableContainer } from '../../../components/ui/DataTableFrame'
import { DateRangeFields } from '../../../components/ui/DateRangeFields'
import { PrtgLocationFilterFields } from '../../locations/components/PrtgLocationFilterFields'
import { endpoints } from '../../../api/endpoints'
import { API_URL, ApiError } from '../../../api/client'
import { todayLimaKey, shiftDateKey } from '../../../lib/datetime'
import { usePermissions } from '../../auth/hooks/usePermissions'
import { P } from '../../auth/permissions'
import { FOLLOWUP_LABELS } from '../../../components/ui/Badge'
import type {
  GeneralReportColumn,
  GeneralReportEstado,
  GeneralReportMinedu,
  GeneralReportPeriod,
  GeneralReportRow,
} from '../types/generalReport'
import { GENERAL_MINEDU_OPTIONS } from '../types/generalReport'

const PER_PAGE_OPTIONS = [25, 50, 100] as const

const FOLLOWUP_OPTIONS = Object.entries(FOLLOWUP_LABELS).map(([value, label]) => ({ value, label }))

/** Columnas densas en tabla (detalle completo va al panel). */
const HIDDEN_IN_TABLE = new Set(['detalle', 'detalle_evento', 'cuando_usarlo'])

const MONO_KEYS = new Set(['ticket', 'cid', 'tss', 'codigo'])

function toQuery(params: Record<string, string | number | undefined | null>): string {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== '') q.set(k, String(v))
  }
  const s = q.toString()
  return s ? `?${s}` : ''
}

async function downloadGeneralXlsx(params: Record<string, string | number | undefined>): Promise<void> {
  const response = await fetch(`${API_URL}/reports/general.xlsx${toQuery(params)}`, {
    method: 'GET',
    credentials: 'include',
    headers: {
      Accept: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'X-Requested-With': 'XMLHttpRequest',
    },
  })
  if (!response.ok) {
    let message = `API ${response.status}`
    try {
      const body = await response.json()
      if (body && typeof body.message === 'string') message = body.message
    } catch {
      /* ignore */
    }
    throw new ApiError(response.status, message)
  }
  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `reporte_general_ticketera_${new Date().toISOString().slice(0, 10)}.xlsx`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function previewText(value: string, max = 56): string {
  const clean = value.replace(/\s+/g, ' ').trim()
  if (!clean || clean === '—') return '—'
  if (clean.length <= max) return clean
  return `${clean.slice(0, max).trim()}…`
}

function parseTimeline(body: string): Array<{ at?: string; text: string }> {
  const lines = body
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean)
  if (lines.length === 0) return []

  return lines.map((line) => {
    const m = line.match(/^(\d{2}\/\d{2}\/\d{4}\s+\d{1,2}:\d{2})\s*[·\-–]\s*(.+)$/)
    if (m) return { at: m[1], text: m[2] }
    return { text: line }
  })
}

type DetailPanel = {
  kind: 'detalle' | 'evento'
  row: GeneralReportRow
  body: string
  emptyHint: string
}

export function GeneralReportPage() {
  const { can } = usePermissions()
  const canExport = can(P.reportsExport)

  const [period, setPeriod] = useState<GeneralReportPeriod>('all')
  const [day, setDay] = useState(todayLimaKey())
  const [from, setFrom] = useState(shiftDateKey(todayLimaKey(), -7))
  const [to, setTo] = useState(todayLimaKey())
  const [search, setSearch] = useState('')
  const [provincia, setProvincia] = useState('')
  const [distrito, setDistrito] = useState('')
  const [mineduSelected, setMineduSelected] = useState<GeneralReportMinedu[]>([])
  const [estado, setEstado] = useState<GeneralReportEstado>('ACTIVO')
  const [seguimiento, setSeguimiento] = useState('')
  const [tecnologia, setTecnologia] = useState('')
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState<(typeof PER_PAGE_OPTIONS)[number]>(50)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const [panel, setPanel] = useState<DetailPanel | null>(null)

  const filterParams = useMemo(() => {
    const base: Record<string, string | undefined> = {
      period,
      search: search.trim() || undefined,
      provincia: provincia || undefined,
      distrito: distrito || undefined,
      minedu: mineduSelected.length > 0 ? mineduSelected.join(',') : undefined,
      estado: estado || undefined,
      seguimiento: seguimiento || undefined,
      tecnologia: tecnologia.trim() || undefined,
    }
    if (period === 'day') base.day = day
    if (period === 'range') {
      base.from = from
      base.to = to
    }
    return base
  }, [period, day, from, to, search, provincia, distrito, mineduSelected, estado, seguimiento, tecnologia])

  const toggleMinedu = (value: GeneralReportMinedu) => {
    setMineduSelected((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
    )
  }

  useEffect(() => {
    setPage(1)
  }, [filterParams, perPage])

  const queryParams = useMemo(
    () => ({
      ...filterParams,
      page: String(page),
      per_page: String(perPage),
    }),
    [filterParams, page, perPage],
  )

  const report = useQuery({
    queryKey: ['reports', 'general', queryParams],
    queryFn: () => endpoints.generalReport(queryParams),
    placeholderData: (prev) => prev,
  })

  const onExport = async () => {
    setExportError(null)
    setExporting(true)
    try {
      await downloadGeneralXlsx(filterParams)
    } catch (e) {
      setExportError(e instanceof Error ? e.message : 'No se pudo exportar')
    } finally {
      setExporting(false)
    }
  }

  const clearFilters = () => {
    setPeriod('all')
    setDay(todayLimaKey())
    setFrom(shiftDateKey(todayLimaKey(), -7))
    setTo(todayLimaKey())
    setSearch('')
    setProvincia('')
    setDistrito('')
    setMineduSelected([])
    setEstado('ACTIVO')
    setSeguimiento('')
    setTecnologia('')
    setPage(1)
    setPerPage(50)
  }

  const columns = (report.data?.columns ?? []).filter((c) => !HIDDEN_IN_TABLE.has(c.key))
  const rows = report.data?.data ?? []
  const meta = report.data?.meta
  const lastPage = meta?.last_page ?? 1

  const pageStats = useMemo(() => {
    let conTicket = 0
    let sinTicket = 0
    let abiertos = 0
    let conDetalle = 0
    for (const row of rows) {
      if (row.ticket && row.ticket !== 'SIN TICKET') conTicket++
      else sinTicket++
      if (row.activa) abiertos++
      if (row.detalle && row.detalle !== '—') conDetalle++
    }
    return { conTicket, sinTicket, abiertos, conDetalle, total: rows.length }
  }, [rows])

  return (
    <AppLayout bare onRefresh={() => void report.refetch()} syncing={report.isFetching}>
      <div className="min-w-0 space-y-5">
        <PageHeader
          icon={<FileSpreadsheet className="h-5 w-5" aria-hidden />}
          title="Seguimiento de caídas"
          description="Vista ticketera: ticket, MINEDU, causa y comentarios de gestión con fecha/hora."
          breadcrumb={
            <p className="text-xs font-medium text-slate-500">
              NOC Loreto <span className="text-slate-300">/</span> Reportes{' '}
              <span className="text-slate-300">/</span> General
            </p>
          }
          actions={
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" onClick={() => void report.refetch()} disabled={report.isFetching}>
                <RefreshCw className={`h-4 w-4 ${report.isFetching ? 'animate-spin' : ''}`} aria-hidden />
                Actualizar
              </Button>
              {canExport ? (
                <Button type="button" onClick={() => void onExport()} disabled={exporting || report.isLoading}>
                  <Download className="h-4 w-4" aria-hidden />
                  {exporting ? 'Exportando…' : 'Exportar XLSX'}
                </Button>
              ) : null}
            </div>
          }
        />

        <div className="grid min-w-0 grid-cols-1 gap-3 min-[420px]:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="En esta página"
            value={pageStats.total.toLocaleString('es-PE')}
            hint={meta ? `${(meta.total ?? 0).toLocaleString('es-PE')} en total` : undefined}
            tone="slate"
          />
          <StatCard
            label="Abiertos"
            value={pageStats.abiertos.toLocaleString('es-PE')}
            hint="Caídos / en curso"
            tone="amber"
          />
          <StatCard
            label="Con ticket TGS"
            value={pageStats.conTicket.toLocaleString('es-PE')}
            hint={`${pageStats.sinTicket} sin ticket`}
            tone="sky"
          />
          <StatCard
            label="Con comentarios"
            value={pageStats.conDetalle.toLocaleString('es-PE')}
            hint="Detalle de gestión"
            tone="emerald"
          />
        </div>

        <FilterCard
          title="Filtros"
          actions={
            <Button type="button" variant="ghost" onClick={clearFilters}>
              Limpiar
            </Button>
          }
        >
          <FormField label="Fecha" className="sm:col-span-2 xl:col-span-2">
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  { key: 'today' as const, label: 'Hoy' },
                  { key: 'yesterday' as const, label: 'Ayer' },
                  { key: 'day' as const, label: 'Un día' },
                  { key: 'range' as const, label: 'Rango' },
                  { key: 'all' as const, label: 'Todo' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setPeriod(opt.key)}
                  className={`rounded-lg px-2.5 py-1.5 text-[12px] font-semibold transition ${
                    period === opt.key
                      ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                      : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-800'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </FormField>

          {period === 'day' ? (
            <FormField label="Día">
              <Input type="date" value={day} onChange={(e) => setDay(e.target.value)} />
            </FormField>
          ) : null}

          {period === 'range' ? (
            <DateRangeFields title="Rango" from={from} to={to} onFromChange={setFrom} onToChange={setTo} />
          ) : null}

          <SearchField
            label="Buscar"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="CID o TSS"
          />

          <PrtgLocationFilterFields
            province={provincia}
            district={distrito}
            onProvinceChange={(v) => {
              setProvincia(v)
              setDistrito('')
            }}
            onDistrictChange={setDistrito}
          />

          <FormField label="Razón MINEDU (multi)" className="sm:col-span-2 xl:col-span-2">
            <div className="flex flex-wrap gap-1.5 rounded-lg border border-slate-200 bg-slate-50 p-2 dark:border-slate-700 dark:bg-slate-950">
              {GENERAL_MINEDU_OPTIONS.map((opt) => {
                const on = mineduSelected.includes(opt.value)
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => toggleMinedu(opt.value)}
                    className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition ${
                      on
                        ? 'bg-sky-600 text-white'
                        : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700'
                    }`}
                  >
                    {opt.label}
                  </button>
                )
              })}
              {mineduSelected.length > 0 ? (
                <button
                  type="button"
                  className="rounded-md px-2 py-1 text-[11px] font-medium text-slate-500 underline"
                  onClick={() => setMineduSelected([])}
                >
                  Todas
                </button>
              ) : null}
            </div>
          </FormField>

          <FormField label="Estado ticket">
            <Select value={estado} onChange={(e) => setEstado(e.target.value as GeneralReportEstado)}>
              <option value="ACTIVO">Abiertos (con ticket TGS)</option>
              <option value="RECUPERADO">Cerrados (ticket TGS)</option>
              <option value="">Todos (incluye sin ticket)</option>
            </Select>
          </FormField>

          <FormField label="Seguimiento">
            <Select value={seguimiento} onChange={(e) => setSeguimiento(e.target.value)}>
              <option value="">Todos</option>
              <option value="PENDIENTE_CONTACTO">Pendiente de gestión</option>
              <option value="EN_GESTION">En gestión</option>
              <option value="EN_ESPERA">En espera</option>
              <option value="PENDIENTE_CIERRE">Pendiente de cierre</option>
              <option value="CERRADO">Cerrado</option>
              {FOLLOWUP_OPTIONS.filter(
                (opt) =>
                  !['PENDIENTE_CONTACTO', 'EN_GESTION', 'EN_ESPERA', 'PENDIENTE_CIERRE', 'CERRADO'].includes(
                    opt.value,
                  ),
              ).map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
          </FormField>

          <FormField label="Tecnología">
            <Input value={tecnologia} onChange={(e) => setTecnologia(e.target.value)} placeholder="GPON, P2P…" />
          </FormField>
        </FilterCard>

        {exportError ? (
          <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
            {exportError}
          </p>
        ) : null}

        {report.isLoading && !report.data ? <LoadingState /> : null}
        {report.isError ? (
          <ErrorState message={report.error instanceof Error ? report.error.message : 'No se pudo cargar'} />
        ) : null}

        {report.data ? (
          <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-4 py-3.5 dark:border-slate-800 dark:from-slate-900 dark:to-slate-900">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <div className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900">
                  <Ticket className="h-4 w-4" aria-hidden />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Ticketera operativa</p>
                  <p className="text-[12px] text-slate-500">
                    {meta?.period_label} · {(meta?.total ?? 0).toLocaleString('es-PE')} registro(s) · página{' '}
                    {meta?.page ?? page}/{lastPage}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Select
                  className="h-9 w-[5.5rem]"
                  value={String(perPage)}
                  onChange={(e) => setPerPage(Number(e.target.value) as (typeof PER_PAGE_OPTIONS)[number])}
                  aria-label="Filas por página"
                >
                  {PER_PAGE_OPTIONS.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </Select>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={page <= 1 || report.isFetching}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden />
                  Anterior
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={page >= lastPage || report.isFetching}
                  onClick={() => setPage((p) => Math.min(lastPage, p + 1))}
                >
                  Siguiente
                  <ChevronRight className="h-4 w-4" aria-hidden />
                </Button>
              </div>
            </div>

            {rows.length === 0 ? (
              <div className="p-10">
                <EmptyState title="Sin incidentes" description="No hay caídas con estos filtros." />
              </div>
            ) : (
              <GeneralReportTable
                columns={columns}
                rows={rows}
                onVerDetalle={(row) =>
                  setPanel({
                    kind: 'detalle',
                    row,
                    body: row.detalle?.trim() && row.detalle !== '—' ? row.detalle : '',
                    emptyHint: 'Todavía no hay comentarios de gestión con fecha y hora.',
                  })
                }
                onVerDetalleEvento={(row) =>
                  setPanel({
                    kind: 'evento',
                    row,
                    body: row.detalle_evento?.trim() && row.detalle_evento !== '—' ? row.detalle_evento : '',
                    emptyHint: 'Sin detalle de evento. En mantenimientos se completa desde Mantenimientos (técnico, actividades, materiales, horarios).',
                  })
                }
              />
            )}
          </section>
        ) : null}
      </div>

      {panel ? <DetailSidePanel panel={panel} onClose={() => setPanel(null)} /> : null}
    </AppLayout>
  )
}

function StatCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string
  value: string
  hint?: string
  tone: 'slate' | 'amber' | 'sky' | 'emerald'
}) {
  const tones = {
    slate: 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/60',
    amber: 'border-amber-200/80 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/30',
    sky: 'border-sky-200/80 bg-sky-50 dark:border-sky-900/50 dark:bg-sky-950/30',
    emerald: 'border-emerald-200/80 bg-emerald-50 dark:border-emerald-900/50 dark:bg-emerald-950/30',
  }
  return (
    <div className={`rounded-2xl border px-4 py-3 ${tones[tone]}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums tracking-tight text-slate-900 dark:text-slate-50">{value}</p>
      {hint ? <p className="mt-0.5 text-[12px] text-slate-500 dark:text-slate-400">{hint}</p> : null}
    </div>
  )
}

function StatusPill({ value }: { value: string }) {
  if (value === 'ABIERTO') {
    return (
      <span className="inline-flex rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-900 dark:bg-amber-500/20 dark:text-amber-200">
        ABIERTO
      </span>
    )
  }
  if (value === 'CERRADO') {
    return (
      <span className="inline-flex rounded-md bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-200">
        CERRADO
      </span>
    )
  }
  if (value === 'SIN TICKET') {
    return (
      <span className="inline-flex rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-slate-700 dark:text-slate-300">
        SIN TICKET
      </span>
    )
  }
  return <span className="text-[12px] font-semibold">{value}</span>
}

function GeneralReportTable({
  columns,
  rows,
  onVerDetalle,
  onVerDetalleEvento,
}: {
  columns: GeneralReportColumn[]
  rows: GeneralReportRow[]
  onVerDetalle: (row: GeneralReportRow) => void
  onVerDetalleEvento: (row: GeneralReportRow) => void
}) {
  const th =
    'whitespace-nowrap px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-slate-300'
  const td = 'px-3 py-2.5 align-middle text-[12px] text-slate-800 dark:text-slate-200'

  return (
    <DataTableContainer>
      <table className="w-full min-w-[2200px] border-collapse text-left">
        <thead className="sticky top-0 z-20 border-b border-slate-700/80 bg-slate-900">
          <tr>
            {columns.map((col) => (
              <th key={col.key} className={th}>
                {col.label}
              </th>
            ))}
            <th
              className={`${th} sticky right-0 z-30 bg-slate-900 text-right shadow-[-10px_0_12px_-10px_rgba(0,0,0,0.5)]`}
            >
              Acciones
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr
              key={row.incident_id}
              className={[
                'border-b border-slate-100/90 transition-colors dark:border-slate-800/90',
                idx % 2 === 0 ? 'bg-white dark:bg-slate-900' : 'bg-slate-50/70 dark:bg-slate-900/40',
                row.activa ? '' : 'opacity-90',
                'hover:bg-sky-50/60 dark:hover:bg-slate-800/80',
              ].join(' ')}
            >
              {columns.map((col) => {
                const raw = row[col.key]
                const value = raw == null || raw === '' ? '—' : String(raw)

                if (col.key === 'estado_ticket' || (col.key === 'ticket' && value === 'SIN TICKET')) {
                  return (
                    <td key={`${row.incident_id}-${col.key}`} className={td}>
                      <StatusPill value={col.key === 'ticket' && value === 'SIN TICKET' ? 'SIN TICKET' : value} />
                    </td>
                  )
                }

                if (col.key === 'ticket' && value !== 'SIN TICKET') {
                  return (
                    <td key={`${row.incident_id}-${col.key}`} className={`${td} font-mono text-[11px] font-semibold`}>
                      <span className="inline-flex max-w-[12rem] truncate rounded-md bg-slate-100 px-1.5 py-0.5 text-slate-800 dark:bg-slate-800 dark:text-slate-100">
                        {value}
                      </span>
                    </td>
                  )
                }

                if (col.key === 'causa') {
                  return (
                    <td
                      key={`${row.incident_id}-${col.key}`}
                      className={`${td} max-w-[180px]`}
                      title={value === '—' ? undefined : value}
                    >
                      <span className="line-clamp-2 leading-snug text-slate-700 dark:text-slate-300">
                        {previewText(value, 64)}
                      </span>
                    </td>
                  )
                }

                return (
                  <td
                    key={`${row.incident_id}-${col.key}`}
                    className={[
                      td,
                      MONO_KEYS.has(col.key) ? 'font-mono font-semibold tabular-nums' : '',
                      col.key === 'minedu' ? 'font-semibold' : '',
                      'whitespace-nowrap',
                    ].join(' ')}
                  >
                    {value}
                  </td>
                )
              })}
              <td
                className={[
                  'sticky right-0 z-10 px-2 py-2 align-middle shadow-[-10px_0_12px_-10px_rgba(15,23,42,0.2)]',
                  idx % 2 === 0 ? 'bg-white dark:bg-slate-900' : 'bg-slate-50 dark:bg-slate-900',
                ].join(' ')}
              >
                <div className="flex min-w-[10.5rem] flex-col gap-1">
                  <button
                    type="button"
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-[11px] font-semibold text-sky-800 transition hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-950/50 dark:text-sky-200 dark:hover:bg-sky-950"
                    onClick={() => onVerDetalle(row)}
                  >
                    <MessageSquareText className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    Ver detalle
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
                    onClick={() => onVerDetalleEvento(row)}
                  >
                    <ScrollText className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    Detalle de evento
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </DataTableContainer>
  )
}

function DetailSidePanel({ panel, onClose }: { panel: DetailPanel; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const { row, body, emptyHint, kind } = panel
  const entries = body ? parseTimeline(body) : []

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end">
      <button type="button" className="absolute inset-0 bg-slate-950/55 backdrop-blur-[2px]" aria-label="Cerrar" onClick={onClose} />
      <aside className="relative flex h-full w-full max-w-md flex-col border-l border-slate-200 bg-slate-50 shadow-2xl dark:border-slate-700 dark:bg-slate-950 sm:max-w-lg">
        <header className="border-b border-slate-200 bg-white px-5 py-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="mb-2 inline-flex items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${
                    kind === 'detalle'
                      ? 'bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-200'
                      : 'bg-violet-100 text-violet-800 dark:bg-violet-500/20 dark:text-violet-200'
                  }`}
                >
                  {kind === 'detalle' ? (
                    <MessageSquareText className="h-3.5 w-3.5" aria-hidden />
                  ) : (
                    <ScrollText className="h-3.5 w-3.5" aria-hidden />
                  )}
                  {kind === 'detalle' ? 'Detalle de gestión' : 'Detalle de evento'}
                </span>
                <StatusPill value={row.estado_ticket} />
              </div>
              <h2 className="truncate font-mono text-sm font-bold text-slate-900 dark:text-slate-50" title={row.ticket}>
                {row.ticket}
              </h2>
              <p className="mt-1 truncate text-[13px] font-medium text-slate-700 dark:text-slate-300">
                CID {row.cid} · {row.local_educativo}
              </p>
            </div>
            <button
              type="button"
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800 dark:hover:text-slate-100"
              onClick={onClose}
              aria-label="Cerrar panel"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5">
            <MetaChip label={row.provincia} />
            <MetaChip label={row.distrito} />
            <MetaChip label={row.tecnologia} />
            <MetaChip label={row.minedu} />
            {row.codigo && row.codigo !== '—' ? <MetaChip label={row.codigo} /> : null}
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          {kind === 'detalle' && entries.length > 0 ? (
            <ol className="relative space-y-0 border-l-2 border-sky-200 pl-5 dark:border-sky-900">
              {entries.map((entry, i) => (
                <li key={`${entry.at ?? ''}-${i}`} className="relative pb-5 last:pb-0">
                  <span className="absolute -left-[1.4rem] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-sky-500 dark:border-slate-950" />
                  {entry.at ? (
                    <p className="mb-1 inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      <Clock3 className="h-3 w-3" aria-hidden />
                      {entry.at}
                    </p>
                  ) : null}
                  <div className="rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-[13px] leading-relaxed text-slate-800 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                    {entry.text}
                  </div>
                </li>
              ))}
            </ol>
          ) : kind === 'evento' && body ? (
            <EventoDetalleCard body={body} />
          ) : body ? (
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-4 text-[13px] leading-relaxed text-slate-800 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
              <pre className="whitespace-pre-wrap break-words font-sans">{body}</pre>
            </div>
          ) : (
            <div className="flex h-full min-h-[12rem] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white/70 px-6 text-center dark:border-slate-700 dark:bg-slate-900/50">
              <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-slate-800">
                {kind === 'detalle' ? <MessageSquareText className="h-5 w-5" /> : <ScrollText className="h-5 w-5" />}
              </div>
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Sin contenido</p>
              <p className="mt-1 max-w-xs text-[13px] text-slate-500">{emptyHint}</p>
            </div>
          )}
        </div>

        {row.causa && row.causa !== '—' ? (
          <footer className="border-t border-slate-200 bg-white px-5 py-3 dark:border-slate-800 dark:bg-slate-900">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Causa raíz</p>
            <p className="mt-0.5 text-[13px] text-slate-700 dark:text-slate-300">{row.causa}</p>
          </footer>
        ) : null}
      </aside>
    </div>,
    document.body,
  )
}

function MetaChip({ label }: { label: string }) {
  if (!label || label === '—') return null
  return (
    <span className="inline-flex max-w-[10rem] truncate rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
      {label}
    </span>
  )
}

type EventoBlock = { label: string; value: string; bullets?: string[] }

function parseEventoBlocks(body: string): EventoBlock[] {
  const lines = body.split(/\r\n|\r|\n/).map((l) => l.trimEnd())
  const blocks: EventoBlock[] = []
  let current: EventoBlock | null = null

  const flush = () => {
    if (current) blocks.push(current)
    current = null
  }

  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue
    const labeled = line.match(/^([^:]{2,40}):\s*(.*)$/)
    if (labeled && !line.startsWith('•') && !line.startsWith('-') && !line.startsWith('*')) {
      flush()
      const label = labeled[1].trim()
      const value = labeled[2].trim()
      current = value
        ? { label, value }
        : { label, value: '', bullets: [] }
      continue
    }
    if (current && (line.startsWith('•') || line.startsWith('-') || line.startsWith('*'))) {
      const item = line.replace(/^[\s•\-\*]+/, '').trim()
      if (!current.bullets) current.bullets = []
      if (item) current.bullets.push(item)
      continue
    }
    if (current) {
      current.value = current.value ? `${current.value}\n${line}` : line
    } else {
      blocks.push({ label: 'Nota', value: line })
    }
  }
  flush()
  return blocks
}

function EventoDetalleCard({ body }: { body: string }) {
  const blocks = parseEventoBlocks(body)
  if (blocks.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white px-4 py-4 text-[13px] dark:border-slate-700 dark:bg-slate-900">
        <pre className="whitespace-pre-wrap break-words font-sans">{body}</pre>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="bg-[#0b3b5c] px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.12em] text-white">
        Detalle de evento
      </div>
      <dl className="divide-y divide-slate-100 dark:divide-slate-800">
        {blocks.map((block) => (
          <div key={block.label} className="grid gap-1 px-4 py-3 sm:grid-cols-[9.5rem_1fr] sm:gap-3">
            <dt className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{block.label}</dt>
            <dd className="text-[13px] font-semibold leading-relaxed text-slate-800 dark:text-slate-100">
              {block.bullets && block.bullets.length > 0 ? (
                <ul className="list-disc space-y-1 pl-4 font-medium">
                  {block.bullets.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : (
                block.value || '—'
              )}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
