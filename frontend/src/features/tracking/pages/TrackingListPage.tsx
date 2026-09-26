import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  Activity,
  CircleCheck,
  ClipboardList,
  Eye,
  FileSpreadsheet,
  MessageSquareText,
  PlayCircle,
  RotateCcw,
} from 'lucide-react'
import { AppLayout } from '../../../layouts/AppLayout'
import { PageHeader } from '../../../components/ui/PageHeader'
import { MetricCard } from '../../../components/ui/MetricCard'
import { FilterCard } from '../../../components/ui/FilterCard'
import { FormField, SearchField, Select } from '../../../components/ui/FormControls'
import { DateRangeFields, quickApertureRange } from '../../../components/ui/DateRangeFields'
import {
  DataTableContainer,
  DateTimeCell,
  ShortName,
  Truncate,
  tableClassName,
  tdClassName,
  thClassName,
  theadClassName,
  trClassName,
} from '../../../components/ui/DataTableFrame'
import { TicketCell } from '../../../components/ui/TicketCell'
import { PaginationBar } from '../../../components/ui/PaginationBar'
import { Button } from '../../../components/ui/Button'
import { Badge } from '../../../components/ui/SoftBadge'
import { EmptyState, ErrorState, LoadingState } from '../../../components/ui/States'
import { PrtgLocationFilterFields } from '../../locations/components/PrtgLocationFilterFields'
import { useManualSync } from '../../dashboard/hooks/useDashboard'
import { ApiError } from '../../../api/client'
import { fetchTrackingList } from '../api/trackingApi'
import { trackingStatusTone } from '../lib/trackingStatus'

export function TrackingListPage() {
  const [q, setQ] = useState('')
  const [qDebounced, setQDebounced] = useState('')
  const [status, setStatus] = useState('')
  const [provincia, setProvincia] = useState('')
  const [distrito, setDistrito] = useState('')
  const [openedBy, setOpenedBy] = useState('')
  const [closedBy, setClosedBy] = useState('')
  const [openedFrom, setOpenedFrom] = useState('')
  const [openedTo, setOpenedTo] = useState('')
  const [closedFrom, setClosedFrom] = useState('')
  const [closedTo, setClosedTo] = useState('')
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(25)
  const { prtg } = useManualSync()

  useEffect(() => {
    const timer = window.setTimeout(() => setQDebounced(q.trim()), 350)
    return () => window.clearTimeout(timer)
  }, [q])

  useEffect(() => {
    setPage(1)
  }, [qDebounced])

  const openedRangeError =
    openedFrom && openedTo && openedFrom > openedTo
      ? 'La fecha inicial no puede ser posterior a la fecha final.'
      : null
  const closedRangeError =
    closedFrom && closedTo && closedFrom > closedTo
      ? 'La fecha inicial no puede ser posterior a la fecha final.'
      : null
  const dateError = openedRangeError || closedRangeError

  const list = useQuery({
    queryKey: [
      'tracking',
      'list',
      qDebounced,
      status,
      provincia,
      distrito,
      openedBy,
      closedBy,
      openedFrom,
      openedTo,
      closedFrom,
      closedTo,
      page,
      perPage,
    ],
    enabled: !dateError,
    queryFn: () =>
      fetchTrackingList({
        q: qDebounced || undefined,
        status: status || undefined,
        provincia: provincia || undefined,
        distrito: distrito || undefined,
        opened_by: openedBy || undefined,
        closed_by: closedBy || undefined,
        opened_from: openedFrom || undefined,
        opened_to: openedTo || undefined,
        closed_from: closedFrom || undefined,
        closed_to: closedTo || undefined,
        page,
        per_page: perPage,
      }),
  })

  const rows = list.data?.data ?? []
  const meta = list.data?.meta
  const kpis = list.data?.kpis
  const filterOpts = list.data?.filters

  const clearFilters = () => {
    setQ('')
    setQDebounced('')
    setStatus('')
    setProvincia('')
    setDistrito('')
    setOpenedBy('')
    setClosedBy('')
    setOpenedFrom('')
    setOpenedTo('')
    setClosedFrom('')
    setClosedTo('')
    setPage(1)
  }

  const applyQuickAperture = (kind: 'today' | 'yesterday' | 'last7' | 'month') => {
    const range = quickApertureRange(kind)
    setOpenedFrom(range.from)
    setOpenedTo(range.to)
    setPage(1)
  }

  const hasFilters = Boolean(
    q ||
      status ||
      provincia ||
      distrito ||
      openedBy ||
      closedBy ||
      openedFrom ||
      openedTo ||
      closedFrom ||
      closedTo,
  )

  const listErrorMessage = useMemo(() => {
    if (dateError) return dateError
    if (!list.isError) return null
    if (list.error instanceof ApiError) {
      const body = list.error.body as { errors?: { opened_to?: string[]; closed_to?: string[] }; message?: string } | null
      return (
        body?.errors?.opened_to?.[0] ??
        body?.errors?.closed_to?.[0] ??
        body?.message ??
        list.error.message
      )
    }
    return list.error instanceof Error ? list.error.message : 'Error al cargar Tracking'
  }, [dateError, list.error, list.isError])

  return (
    <AppLayout
      bare
      syncing={prtg.isPending}
      onRefresh={() => void list.refetch()}
      onSyncPrtg={() => prtg.mutate()}
    >
      <PageHeader
        icon={<ClipboardList className="h-5 w-5" aria-hidden />}
        title="Tracking General"
        description="Seguimiento operativo de incidencias que requieren gestión hasta su cierre formal."
        badges={<Badge tone="info">Independiente del reporte operativo</Badge>}
        actions={
          <Link
            to="/tracking/report"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-3 text-sm font-semibold text-violet-800 hover:bg-violet-100"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" aria-hidden />
            Vista tipo Excel
          </Link>
        }
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard
          label="Abiertos"
          value={kpis?.abiertos ?? 0}
          icon={<PlayCircle className="h-4 w-4" />}
          tone="warning"
        />
        <MetricCard
          label="En seguimiento"
          value={kpis?.en_seguimiento ?? 0}
          icon={<MessageSquareText className="h-4 w-4" />}
          tone="info"
        />
        <MetricCard
          label="Recuperados téc. pendientes"
          value={kpis?.tecnicamente_recuperados ?? 0}
          icon={<Activity className="h-4 w-4" />}
          tone="success"
          description="PRTG OK, Tracking abierto"
        />
        <MetricCard
          label="Cerrados hoy"
          value={kpis?.cerrados_hoy ?? 0}
          icon={<CircleCheck className="h-4 w-4" />}
          tone="success"
        />
        <MetricCard
          label="Total en periodo"
          value={kpis?.total_periodo ?? 0}
          icon={<ClipboardList className="h-4 w-4" />}
        />
      </div>

      <div className="mb-4">
        <FilterCard
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <span className="hidden text-[11px] font-semibold tracking-wide text-slate-400 uppercase sm:inline">
                Apertura rápida
              </span>
              {(
                [
                  ['today', 'Hoy'],
                  ['yesterday', 'Ayer'],
                  ['last7', '7 días'],
                  ['month', 'Este mes'],
                ] as const
              ).map(([kind, label]) => (
                <Button
                  key={kind}
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => applyQuickAperture(kind)}
                >
                  {label}
                </Button>
              ))}
              {hasFilters ? (
                <Button type="button" size="sm" variant="ghost" onClick={clearFilters}>
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                  Limpiar filtros
                </Button>
              ) : null}
            </div>
          }
        >
          <SearchField
            label="Buscar"
            value={q}
            placeholder="N°, ticket, TSS, CID, colegio, responsable…"
            onChange={(e) => setQ(e.target.value)}
          />
          <FormField label="Estado">
            <Select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value)
                setPage(1)
              }}
            >
              <option value="">Todos</option>
              {(filterOpts?.statuses ?? []).map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
          </FormField>
          <PrtgLocationFilterFields
            province={provincia}
            district={distrito}
            provinceLabel="Provincia PRTG"
            districtLabel="Distrito PRTG"
            onProvinceChange={(value) => {
              setProvincia(value)
              setPage(1)
            }}
            onDistrictChange={(value) => {
              setDistrito(value)
              setPage(1)
            }}
          />
          <FormField label="Aperturado por">
            <Select
              value={openedBy}
              onChange={(e) => {
                setOpenedBy(e.target.value)
                setPage(1)
              }}
            >
              <option value="">Todos</option>
              {(filterOpts?.opened_by ?? []).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Cerrado por">
            <Select
              value={closedBy}
              onChange={(e) => {
                setClosedBy(e.target.value)
                setPage(1)
              }}
            >
              <option value="">Todos</option>
              {(filterOpts?.closed_by ?? []).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </FormField>
          <DateRangeFields
            title="Apertura"
            from={openedFrom}
            to={openedTo}
            error={openedRangeError}
            onFromChange={(value) => {
              setOpenedFrom(value)
              setPage(1)
            }}
            onToChange={(value) => {
              setOpenedTo(value)
              setPage(1)
            }}
          />
          <DateRangeFields
            title="Cierre"
            from={closedFrom}
            to={closedTo}
            error={closedRangeError}
            onFromChange={(value) => {
              setClosedFrom(value)
              setPage(1)
            }}
            onToChange={(value) => {
              setClosedTo(value)
              setPage(1)
            }}
          />
        </FilterCard>
      </div>

      {list.isLoading ? <LoadingState /> : null}
      {listErrorMessage ? <ErrorState message={listErrorMessage} /> : null}

      {!list.isLoading && !list.isError ? (
        rows.length === 0 ? (
          <EmptyState
            icon={<ClipboardList className="h-8 w-8" aria-hidden />}
            title={hasFilters ? 'Sin resultados' : 'Todavía no existen casos en Tracking General'}
            description={
              hasFilters
                ? 'No se encontraron resultados con los filtros seleccionados.'
                : 'Los casos aparecerán automáticamente cuando un operador registre la primera gestión de una incidencia.'
            }
            action={
              hasFilters ? (
                <Button type="button" size="sm" variant="secondary" onClick={clearFilters}>
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                  Limpiar filtros
                </Button>
              ) : null
            }
          />
        ) : (
          <>
            <DataTableContainer>
              <table className={`${tableClassName} table-fixed`} style={{ minWidth: 1100 }}>
                <colgroup>
                  <col className="w-[3.5rem]" />
                  <col className="w-[11rem]" />
                  <col className="w-[4rem]" />
                  <col className="w-[5rem]" />
                  <col style={{ width: '12rem' }} />
                  <col className="w-[7rem]" />
                  <col className="w-[6rem]" />
                  <col className="w-[10rem]" />
                  <col className="w-[8rem]" />
                  <col className="w-[7rem]" />
                  <col className="w-[6rem]" />
                  <col className="w-[3.25rem]" />
                </colgroup>
                <thead className={theadClassName}>
                  <tr>
                    <th className={thClassName}>N°</th>
                    <th className={thClassName}>Ticket</th>
                    <th className={thClassName}>TSS</th>
                    <th className={thClassName}>CID</th>
                    <th className={thClassName}>Descripción</th>
                    <th className={thClassName}>Apertura</th>
                    <th className={`${thClassName} hidden md:table-cell`}>Apert. por</th>
                    <th className={`${thClassName} hidden xl:table-cell`}>Últ. seguimiento</th>
                    <th className={thClassName}>Estado</th>
                    <th className={`${thClassName} hidden lg:table-cell`}>Cierre</th>
                    <th className={`${thClassName} hidden lg:table-cell`}>Cerr. por</th>
                    <th className={`${thClassName} text-right`}>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className={trClassName}>
                      <td className={`${tdClassName} font-semibold tabular-nums text-slate-900 dark:text-slate-100`}>
                        {row.incident_number ?? row.id}
                      </td>
                      <td className={tdClassName}>
                        <TicketCell ticket={row.report_ticket || row.ticket} />
                      </td>
                      <td className={`${tdClassName} tabular-nums`}>{row.tss_snapshot || '—'}</td>
                      <td className={`${tdClassName} font-medium tabular-nums text-slate-900 dark:text-slate-100`}>
                        {row.cid_snapshot || '—'}
                      </td>
                      <td className={tdClassName}>
                        <Truncate title={row.description} className="font-medium text-slate-800 dark:text-slate-100">
                          {row.description || '—'}
                        </Truncate>
                        {row.school_name ? (
                          <Truncate title={row.school_name} className="text-xs text-slate-500">
                            {row.school_name}
                          </Truncate>
                        ) : null}
                      </td>
                      <td className={tdClassName}>
                        <DateTimeCell value={row.opened_at_display} />
                      </td>
                      <td className={`${tdClassName} hidden md:table-cell`}>
                        <ShortName name={row.opened_by_name} />
                      </td>
                      <td className={`${tdClassName} hidden xl:table-cell`}>
                        <Truncate lines={2} title={row.last_update_preview} className="text-xs text-slate-600">
                          {row.last_update_preview || '—'}
                        </Truncate>
                      </td>
                      <td className={tdClassName}>
                        <Badge tone={trackingStatusTone(row.status)}>{row.status_label || row.status || '—'}</Badge>
                      </td>
                      <td className={`${tdClassName} hidden lg:table-cell`}>
                        <DateTimeCell value={row.closed_at_display} />
                      </td>
                      <td className={`${tdClassName} hidden lg:table-cell`}>
                        <ShortName name={row.closed_by_name} />
                      </td>
                      <td className={`${tdClassName} text-right`}>
                        <Link
                          to={`/tracking/${row.id}`}
                          title={row.status === 'CLOSED' ? 'Ver detalle' : 'Ver / gestionar Tracking'}
                          aria-label={row.status === 'CLOSED' ? 'Ver detalle' : 'Ver o gestionar Tracking'}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-violet-700 hover:bg-violet-50 dark:border-slate-700 dark:hover:bg-violet-950/40"
                        >
                          <Eye className="h-4 w-4" aria-hidden />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </DataTableContainer>

            {meta ? (
              <PaginationBar
                page={meta.current_page}
                lastPage={meta.last_page}
                perPage={meta.per_page}
                total={meta.total}
                pageSizeOptions={[25, 50, 100]}
                onPageChange={setPage}
                onPerPageChange={(n) => {
                  setPerPage(n)
                  setPage(1)
                }}
              />
            ) : null}
          </>
        )
      ) : null}
    </AppLayout>
  )
}
