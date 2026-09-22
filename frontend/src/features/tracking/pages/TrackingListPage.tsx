import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  Activity,
  CircleCheck,
  ClipboardList,
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
import { DataTableFrame } from '../../../components/ui/DataTableFrame'
import { PaginationBar } from '../../../components/ui/PaginationBar'
import { Button } from '../../../components/ui/Button'
import { Badge } from '../../../components/ui/SoftBadge'
import { EmptyState, ErrorState, LoadingState } from '../../../components/ui/States'
import { PrtgLocationFilterFields } from '../../locations/components/PrtgLocationFilterFields'
import { useManualSync } from '../../dashboard/hooks/useDashboard'
import { fetchTrackingList } from '../api/trackingApi'
import { trackingStatusTone } from '../lib/trackingStatus'

export function TrackingListPage() {
  const [q, setQ] = useState('')
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
  const { prtg, cloudnet } = useManualSync()

  const list = useQuery({
    queryKey: [
      'tracking',
      'list',
      q,
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
    queryFn: () =>
      fetchTrackingList({
        q: q || undefined,
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

  const hasFilters = Boolean(
    q || status || provincia || distrito || openedBy || closedBy || openedFrom || openedTo || closedFrom || closedTo,
  )

  return (
    <AppLayout
      bare
      syncing={prtg.isPending || cloudnet.isPending}
      onRefresh={() => void list.refetch()}
      onSyncPrtg={() => prtg.mutate()}
      onSyncCloudnet={() => cloudnet.mutate()}
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
            hasFilters ? (
              <Button type="button" size="sm" variant="ghost" onClick={clearFilters}>
                <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                Limpiar
              </Button>
            ) : null
          }
        >
          <SearchField
            label="Buscar"
            value={q}
            placeholder="N°, ticket, TSS, CID, colegio, responsable…"
            onChange={(e) => {
              setQ(e.target.value)
              setPage(1)
            }}
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
          <FormField label="Apertura desde">
            <input
              type="date"
              value={openedFrom}
              onChange={(e) => {
                setOpenedFrom(e.target.value)
                setPage(1)
              }}
              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            />
          </FormField>
          <FormField label="Apertura hasta">
            <input
              type="date"
              value={openedTo}
              onChange={(e) => {
                setOpenedTo(e.target.value)
                setPage(1)
              }}
              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            />
          </FormField>
          <FormField label="Cierre desde">
            <input
              type="date"
              value={closedFrom}
              onChange={(e) => {
                setClosedFrom(e.target.value)
                setPage(1)
              }}
              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            />
          </FormField>
          <FormField label="Cierre hasta">
            <input
              type="date"
              value={closedTo}
              onChange={(e) => {
                setClosedTo(e.target.value)
                setPage(1)
              }}
              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            />
          </FormField>
        </FilterCard>
      </div>

      {list.isLoading ? <LoadingState /> : null}
      {list.isError ? (
        <ErrorState message={list.error instanceof Error ? list.error.message : 'Error al cargar Tracking'} />
      ) : null}

      {!list.isLoading && !list.isError ? (
        rows.length === 0 ? (
          <EmptyState
            title="Sin trackings"
            description={hasFilters ? 'Prueba limpiar los filtros.' : 'Aún no hay registros de Tracking General.'}
          />
        ) : (
          <>
            <DataTableFrame>
              <table className="min-w-[1100px] w-full text-left text-sm">
                <thead className="sticky top-0 z-10 bg-slate-50 text-xs font-semibold tracking-wide text-slate-500 uppercase">
                  <tr>
                    <th className="px-3 py-2.5">N°</th>
                    <th className="px-3 py-2.5">Ticket</th>
                    <th className="px-3 py-2.5">TSS</th>
                    <th className="px-3 py-2.5">CID</th>
                    <th className="px-3 py-2.5">Descripción</th>
                    <th className="px-3 py-2.5">Apertura</th>
                    <th className="px-3 py-2.5">Aperturado por</th>
                    <th className="px-3 py-2.5">Último seguimiento</th>
                    <th className="px-3 py-2.5">Estado</th>
                    <th className="px-3 py-2.5">Cierre</th>
                    <th className="px-3 py-2.5">Cerrado por</th>
                    <th className="px-3 py-2.5">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((row) => (
                    <tr key={row.id} className="bg-white hover:bg-slate-50/80">
                      <td className="px-3 py-2.5 font-semibold tabular-nums text-slate-900">
                        {row.incident_number ?? row.id}
                      </td>
                      <td className="px-3 py-2.5 text-slate-700">{row.ticket || '—'}</td>
                      <td className="px-3 py-2.5 tabular-nums text-slate-700">{row.tss_snapshot || '—'}</td>
                      <td className="px-3 py-2.5 font-medium tabular-nums text-slate-900">
                        {row.cid_snapshot || '—'}
                      </td>
                      <td className="max-w-[14rem] px-3 py-2.5">
                        <p className="truncate text-slate-800" title={row.description ?? undefined}>
                          {row.description || '—'}
                        </p>
                        {row.school_name ? (
                          <p className="truncate text-xs text-slate-500" title={row.school_name}>
                            {row.school_name}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-slate-700">
                        {row.opened_at_display || '—'}
                      </td>
                      <td className="px-3 py-2.5 text-slate-700">{row.opened_by_name || '—'}</td>
                      <td className="max-w-[12rem] px-3 py-2.5 text-slate-600">
                        <p className="line-clamp-2 text-xs" title={row.last_update_preview ?? undefined}>
                          {row.last_update_preview || '—'}
                        </p>
                      </td>
                      <td className="px-3 py-2.5">
                        <Badge tone={trackingStatusTone(row.status)}>{row.status_label || row.status || '—'}</Badge>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-slate-700">
                        {row.closed_at_display || '—'}
                      </td>
                      <td className="px-3 py-2.5 text-slate-700">{row.closed_by_name || '—'}</td>
                      <td className="px-3 py-2.5">
                        <Link
                          to={`/tracking/${row.id}`}
                          className="text-sm font-semibold text-violet-700 hover:text-violet-900 hover:underline"
                        >
                          {row.status === 'CLOSED' ? 'Ver detalle' : 'Ver / Gestionar'}
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </DataTableFrame>

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
