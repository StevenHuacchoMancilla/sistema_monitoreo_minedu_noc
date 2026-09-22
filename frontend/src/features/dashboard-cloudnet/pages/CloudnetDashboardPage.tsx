import { AppLayout } from '../../../layouts/AppLayout'
import { Button } from '../../../components/ui/Button'
import { ErrorState } from '../../../components/ui/States'
import { DashboardHeader, SectionSkeleton } from '../../../components/ui/KpiCard'
import { useCloudnetDashboard, useForceCloudnetSync } from '../hooks/useCloudnetDashboard'
import { CloudnetKpis } from '../components/CloudnetKpis'
import {
  ApStatusCard,
  ClientStatusCard,
  CloudnetCorrelationCard,
  CloudnetCoverageCard,
  CloudnetHealthCard,
  CloudnetInventoryPanel,
  DeviceStatusCard,
} from '../components/CloudnetPanels'

export function CloudnetDashboardPage() {
  const query = useCloudnetDashboard()
  const sync = useForceCloudnetSync()
  const data = query.data

  return (
    <AppLayout bare>
      <DashboardHeader
        title="Resumen Cloudnet"
        subtitle="Monitoreo de sites, dispositivos, access points y clientes H3C Cloudnet"
        accent="cloudnet"
        lastSync={data?.sync?.last_sync}
        status={data?.sync?.status}
        warningCount={data?.sync?.warning_count ?? data?.sync?.warnings}
      >
        <Button type="button" onClick={() => void query.refetch()} disabled={query.isFetching || sync.isPending}>
          Refrescar
        </Button>
        <Button type="button" variant="primary" onClick={() => sync.mutate()} disabled={sync.isPending}>
          {sync.isPending ? 'Sincronizando Cloudnet…' : 'Forzar sincronización Cloudnet'}
        </Button>
      </DashboardHeader>

      {sync.isSuccess ? (
        <p className="mb-4 rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm font-medium text-noc-cyan">
          Sincronización completada · Procesados: {String(sync.data.processed_count ?? 0)} · Warnings:{' '}
          {String(sync.data.warning_count ?? 0)} · Errores: {String(sync.data.error_count ?? 0)}
        </p>
      ) : null}
      {sync.isError ? (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-noc-danger">
          {sync.error instanceof Error ? sync.error.message : 'Error al sincronizar Cloudnet'}
        </p>
      ) : null}

      {query.isLoading ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <SectionSkeleton rows={6} />
          <SectionSkeleton rows={6} />
        </div>
      ) : null}
      {query.isError ? (
        <ErrorState message={query.error instanceof Error ? query.error.message : 'Error cargando Resumen Cloudnet'} />
      ) : null}

      {data ? (
        <div className="space-y-4">
          <CloudnetKpis data={data} />
          <CloudnetInventoryPanel data={data} />
          <div className="grid gap-4 xl:grid-cols-2">
            <DeviceStatusCard data={data} />
            <ApStatusCard data={data} />
            <ClientStatusCard data={data} />
            <CloudnetCoverageCard data={data} />
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            <CloudnetHealthCard data={data} />
            <CloudnetCorrelationCard data={data} />
          </div>
        </div>
      ) : null}
    </AppLayout>
  )
}
