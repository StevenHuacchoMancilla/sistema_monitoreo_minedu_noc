import { AppLayout } from '../../../layouts/AppLayout'
import { Button } from '../../../components/ui/Button'
import { ErrorState } from '../../../components/ui/States'
import { DashboardHeader, SectionSkeleton } from '../../../components/ui/KpiCard'
import { useForcePrtgSync, usePrtgDashboard } from '../hooks/usePrtgDashboard'
import { PrtgKpis } from '../components/PrtgKpis'
import { PrtgCoverageCard, PrtgHealthCard, PrtgStatusDistribution } from '../components/PrtgHealthCard'
import { PrtgCharts, SyncDiagnosticsPanel } from '../components/PrtgCharts'

export function PrtgDashboardPage() {
  const query = usePrtgDashboard()
  const sync = useForcePrtgSync()
  const data = query.data

  return (
    <AppLayout bare>
      <DashboardHeader
        title="Resumen PRTG"
        subtitle="Monitoreo de conectividad y disponibilidad de locales educativos"
        accent="prtg"
        lastSync={data?.sync?.last_sync}
        status={data?.sync?.status}
        warningCount={data?.sync?.warning_count ?? data?.sync?.warnings}
      >
        <Button type="button" onClick={() => void query.refetch()} disabled={query.isFetching || sync.isPending}>
          Refrescar
        </Button>
        <Button type="button" variant="primary" onClick={() => sync.mutate()} disabled={sync.isPending}>
          {sync.isPending ? 'Sincronizando PRTG…' : 'Forzar sincronización PRTG'}
        </Button>
      </DashboardHeader>

      {sync.isSuccess ? (
        <p className="mb-4 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm font-medium text-noc-success">
          Sincronización completada · Procesados: {String(sync.data.processed_count ?? 0)} · Warnings:{' '}
          {String(sync.data.warning_count ?? 0)} · Errores: {String(sync.data.error_count ?? 0)}
        </p>
      ) : null}
      {sync.isError ? (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-noc-danger">
          {sync.error instanceof Error ? sync.error.message : 'Error al sincronizar PRTG'}
        </p>
      ) : null}

      {query.isLoading ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <SectionSkeleton rows={6} />
          <SectionSkeleton rows={6} />
        </div>
      ) : null}
      {query.isError ? (
        <ErrorState message={query.error instanceof Error ? query.error.message : 'Error cargando Resumen PRTG'} />
      ) : null}

      {data ? (
        <div className="space-y-4">
          <PrtgKpis data={data} />
          <PrtgCharts data={data} />
          <div className="grid gap-4 xl:grid-cols-2">
            <PrtgStatusDistribution data={data} />
            <PrtgCoverageCard data={data} />
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            <PrtgHealthCard data={data} />
            <SyncDiagnosticsPanel data={data} />
          </div>
        </div>
      ) : null}
    </AppLayout>
  )
}
