import { useState } from 'react'
import { AppLayout } from '../../../layouts/AppLayout'
import { ErrorState, LoadingState } from '../../../components/ui/States'
import { useDashboardSummary, useManualSync } from '../hooks/useDashboard'
import { DashboardKpiGrid } from '../components/DashboardKpiGrid'
import { SystemHealthPanel } from '../components/SystemHealthPanel'
import { CloudnetStatusPanel } from '../components/CloudnetStatusPanel'
import { ConcentrationsPreview } from '../components/ConcentrationsPreview'
import { OutageCardList } from '../components/OutageCardList'
import { IncidentManageModal } from '../../incidents/components/IncidentManageModal'

export function DashboardPage() {
  const summary = useDashboardSummary()
  const { prtg, cloudnet } = useManualSync()
  const syncing = prtg.isPending || cloudnet.isPending
  const [manageId, setManageId] = useState<number | null>(null)

  const data = summary.data
  const lastUpdated = data?.sync.prtg?.finished_at ?? data?.sync.cloudnet?.finished_at ?? null

  return (
    <AppLayout
      title="Resumen operativo"
      lastUpdated={lastUpdated ? new Date(lastUpdated).toLocaleString() : null}
      syncing={syncing}
      onRefresh={() => void summary.refetch()}
      onSyncPrtg={() => prtg.mutate()}
      onSyncCloudnet={() => cloudnet.mutate()}
      healthSlot={
        <span className="hidden max-w-[220px] truncate rounded-lg border border-noc-border px-2 py-1 text-xs text-noc-muted lg:inline-block" title={String(import.meta.env.VITE_API_URL ?? '')}>
          API {import.meta.env.VITE_API_URL}
        </span>
      }
    >
      {summary.isLoading ? <LoadingState /> : null}
      {summary.isError ? (
        <ErrorState message={summary.error instanceof Error ? summary.error.message : 'Error'} />
      ) : null}

      {(prtg.isSuccess || cloudnet.isSuccess) && (
        <p className="mb-3 text-sm text-noc-success">
          {prtg.isSuccess
            ? `PRTG ${String(prtg.data.status ?? 'OK')} · procesados ${String(prtg.data.processed_count ?? 0)} · warnings ${String(prtg.data.warning_count ?? 0)}`
            : null}
          {cloudnet.isSuccess
            ? ` · Cloudnet ${String(cloudnet.data.status ?? 'OK')} · procesados ${String(cloudnet.data.processed_count ?? 0)}`
            : null}
        </p>
      )}

      {data ? (
        <div className="space-y-4">
          <DashboardKpiGrid kpis={data.kpis} />
          <SystemHealthPanel data={data} />

          <div className="grid gap-4 xl:grid-cols-5">
            <div className="space-y-4 xl:col-span-3">
              <div className="grid gap-4">
                <OutageCardList
                  title="Caídas recientes"
                  rows={data.active_incidents_preview}
                  linkTo="/incidents/active"
                  linkLabel={`Ver todas (${data.kpis.incidencias_activas}) →`}
                  onManage={setManageId}
                />
              </div>
              <ConcentrationsPreview items={data.concentrations} />
            </div>
            <div className="space-y-4 xl:col-span-2">
              <CloudnetStatusPanel cloudnet={data.cloudnet} kpis={data.kpis} />
            </div>
          </div>
        </div>
      ) : null}

      {manageId !== null ? (
        <IncidentManageModal incidentId={manageId} onClose={() => setManageId(null)} />
      ) : null}
    </AppLayout>
  )
}
