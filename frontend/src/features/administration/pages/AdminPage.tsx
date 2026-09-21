import { AppLayout } from '../../../layouts/AppLayout'
import { SectionCard } from '../../../components/ui/Card'
import { useDashboardSummary, useManualSync } from '../../dashboard/hooks/useDashboard'
import { LoadingState, ErrorState } from '../../../components/ui/States'

export function AdminPage() {
  const summary = useDashboardSummary()
  const { prtg, cloudnet } = useManualSync()
  const data = summary.data

  return (
    <AppLayout
      title="Administración / Diagnóstico"
      syncing={prtg.isPending || cloudnet.isPending}
      onRefresh={() => void summary.refetch()}
      onSyncPrtg={() => prtg.mutate()}
      onSyncCloudnet={() => cloudnet.mutate()}
    >
      {summary.isLoading ? <LoadingState /> : null}
      {summary.isError ? (
        <ErrorState message={summary.error instanceof Error ? summary.error.message : 'Error'} />
      ) : null}
      {data ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <SectionCard title="Última sync PRTG">
            <pre className="overflow-x-auto text-xs text-noc-muted">{JSON.stringify(data.sync.prtg, null, 2)}</pre>
          </SectionCard>
          <SectionCard title="Última sync Cloudnet">
            <pre className="overflow-x-auto text-xs text-noc-muted">{JSON.stringify(data.sync.cloudnet, null, 2)}</pre>
          </SectionCard>
          <SectionCard title="Pendientes operativos">
            <ul className="space-y-1 text-sm">
              <li>Contactos pendientes match: {data.kpis.contactos_pendientes_match ?? 0}</li>
              <li>Sites Cloudnet sin asociación: {data.kpis.sites_sin_asociacion}</li>
              <li>Sin datos PRTG: {data.kpis.sin_datos_prtg}</li>
              <li>Sin CID: {data.kpis.sin_cid}</li>
            </ul>
          </SectionCard>
          <SectionCard title="Salud">
            <pre className="overflow-x-auto text-xs text-noc-muted">{JSON.stringify(data.health, null, 2)}</pre>
          </SectionCard>
        </div>
      ) : null}
    </AppLayout>
  )
}
