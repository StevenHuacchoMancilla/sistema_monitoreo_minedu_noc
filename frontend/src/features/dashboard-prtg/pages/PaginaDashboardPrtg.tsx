import { DisenoApp } from '../../../layouts/DisenoApp'
import { Boton } from '../../../components/ui/Boton'
import { ErrorState } from '../../../components/ui/Estados'
import { DashboardHeader, SectionSkeleton } from '../../../components/ui/TarjetaKpi'
import { useForcePrtgSync, useDashboardPrtg } from '../hooks/useDashboardPrtg'
import { KpisPrtg } from '../components/KpisPrtg'
import { PrtgCoverageCard, TarjetaSaludPrtg, PrtgStatusDistribution } from '../components/TarjetaSaludPrtg'
import { GraficosPrtg, SyncDiagnosticsPanel } from '../components/GraficosPrtg'

export function PaginaDashboardPrtg() {
  const query = useDashboardPrtg()
  const sync = useForcePrtgSync()
  const data = query.data

  return (
    <DisenoApp bare>
      <DashboardHeader
        title="Resumen PRTG"
        subtitle="Monitoreo de conectividad y disponibilidad de locales educativos"
        accent="prtg"
        lastSync={data?.sync?.last_sync}
        status={data?.sync?.status}
        warningCount={data?.sync?.warning_count ?? data?.sync?.warnings}
      >
        <Boton type="button" onClick={() => void query.refetch()} disabled={query.isFetching || sync.isPending}>
          Refrescar
        </Boton>
        <Boton type="button" variant="primary" onClick={() => sync.mutate()} disabled={sync.isPending}>
          {sync.isPending ? 'Sincronizando PRTG…' : 'Forzar sincronización PRTG'}
        </Boton>
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
          <KpisPrtg data={data} />
          <GraficosPrtg data={data} />
          <div className="grid gap-4 xl:grid-cols-2">
            <PrtgStatusDistribution data={data} />
            <PrtgCoverageCard data={data} />
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            <TarjetaSaludPrtg data={data} />
            <SyncDiagnosticsPanel data={data} />
          </div>
        </div>
      ) : null}
    </DisenoApp>
  )
}
