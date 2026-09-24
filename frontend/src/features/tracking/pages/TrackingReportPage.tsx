import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Download, FileSpreadsheet, RotateCcw } from 'lucide-react'
import { AppLayout } from '../../../layouts/AppLayout'
import { PageHeader } from '../../../components/ui/PageHeader'
import { FilterCard } from '../../../components/ui/FilterCard'
import { FormField, SearchField, Select } from '../../../components/ui/FormControls'
import { Button } from '../../../components/ui/Button'
import { EmptyState, ErrorState, LoadingState } from '../../../components/ui/States'
import { PrtgLocationFilterFields } from '../../locations/components/PrtgLocationFilterFields'
import { useManualSync } from '../../dashboard/hooks/useDashboard'
import { downloadTrackingReportXlsx, fetchTrackingList, fetchTrackingReport } from '../api/trackingApi'
import { TrackingReportTable } from '../components/TrackingReportTable'

export function TrackingReportPage() {
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
  const [downloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState<string | null>(null)
  const { prtg, cloudnet } = useManualSync()

  const filterParams = {
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
  }

  const filterOpts = useQuery({
    queryKey: ['tracking', 'list', 'filter-opts'],
    queryFn: () => fetchTrackingList({ per_page: 25, page: 1 }),
    staleTime: 60_000,
  })

  const report = useQuery({
    queryKey: ['tracking', 'report', filterParams],
    queryFn: () => fetchTrackingReport(filterParams),
  })

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
  }

  const hasFilters = Boolean(
    q || status || provincia || distrito || openedBy || closedBy || openedFrom || openedTo || closedFrom || closedTo,
  )

  const rows = report.data?.data ?? []
  const columns = report.data?.columns ?? []
  const meta = report.data?.meta
  const statuses = filterOpts.data?.filters.statuses ?? []
  const openedOpts = filterOpts.data?.filters.opened_by ?? []
  const closedOpts = filterOpts.data?.filters.closed_by ?? []

  const onDownload = async () => {
    setDownloadError(null)
    setDownloading(true)
    try {
      await downloadTrackingReportXlsx(filterParams)
    } catch (e) {
      setDownloadError(e instanceof Error ? e.message : 'No se pudo descargar el XLSX')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <AppLayout
      bare
      onRefresh={() => void report.refetch()}
      syncing={report.isFetching || prtg.isPending || cloudnet.isPending}
    >
      <PageHeader
        icon={<FileSpreadsheet className="h-5 w-5" aria-hidden />}
        title="Tracking General · Vista Excel"
        description="Misma estructura que TRACKING GENERAL.xlsx (10 columnas). El verde indica cerrado, no es fuente de verdad."
        breadcrumb={
          <Link to="/tracking" className="text-sm font-medium text-violet-700 hover:underline">
            ← Tracking General
          </Link>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={clearFilters} disabled={!hasFilters}>
              <RotateCcw className="h-3.5 w-3.5" aria-hidden />
              Limpiar filtros
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              loading={downloading}
              disabled={rows.length === 0 && !report.isFetching}
              onClick={() => void onDownload()}
              className="bg-violet-600 hover:bg-violet-700"
            >
              <Download className="h-3.5 w-3.5" aria-hidden />
              Descargar XLSX
            </Button>
          </div>
        }
      />

      {downloadError ? <p className="mb-3 text-sm font-semibold text-red-600">{downloadError}</p> : null}

      <div className="mb-4">
        <FilterCard>
          <SearchField
            label="Buscar"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="N°, ticket, TSS, CID, local…"
          />
          <FormField label="Estado">
            <Select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Todos</option>
              {statuses.map((s) => (
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
            onProvinceChange={setProvincia}
            onDistrictChange={setDistrito}
          />
          <FormField label="Aperturado por">
            <Select value={openedBy} onChange={(e) => setOpenedBy(e.target.value)}>
              <option value="">Todos</option>
              {openedOpts.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Cerrado por">
            <Select value={closedBy} onChange={(e) => setClosedBy(e.target.value)}>
              <option value="">Todos</option>
              {closedOpts.map((o) => (
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
              onChange={(e) => setOpenedFrom(e.target.value)}
              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </FormField>
          <FormField label="Apertura hasta">
            <input
              type="date"
              value={openedTo}
              onChange={(e) => setOpenedTo(e.target.value)}
              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </FormField>
          <FormField label="Cierre desde">
            <input
              type="date"
              value={closedFrom}
              onChange={(e) => setClosedFrom(e.target.value)}
              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </FormField>
          <FormField label="Cierre hasta">
            <input
              type="date"
              value={closedTo}
              onChange={(e) => setClosedTo(e.target.value)}
              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </FormField>
        </FilterCard>
      </div>

      {meta ? (
        <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
          Mostrando {meta.returned} de {meta.total} registro{meta.total === 1 ? '' : 's'}
          {meta.truncated ? ` (límite ${meta.limit}; afina filtros)` : ''}
          . Filas verdes = cerrados (solo visual).
        </p>
      ) : null}

      {report.isLoading ? <LoadingState /> : null}
      {report.isError ? (
        <ErrorState
          message={report.error instanceof Error ? report.error.message : 'No se pudo cargar la vista Excel'}
        />
      ) : null}

      {!report.isLoading && !report.isError ? (
        rows.length === 0 ? (
          <EmptyState
            title="Sin filas"
            description={hasFilters ? 'Prueba limpiar los filtros.' : 'Aún no hay Tracking para mostrar.'}
          />
        ) : (
          <TrackingReportTable columns={columns} rows={rows} />
        )
      ) : null}
    </AppLayout>
  )
}
