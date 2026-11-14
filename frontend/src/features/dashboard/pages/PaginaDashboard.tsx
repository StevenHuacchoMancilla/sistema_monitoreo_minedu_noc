import { useState } from 'react'
import { DisenoApp } from '../../../layouts/DisenoApp'
import { ErrorState, LoadingState } from '../../../components/ui/Estados'
import { useDashboardSummary, useManualSync } from '../hooks/useDashboard'
import { GrillaKpiDashboard } from '../components/GrillaKpiDashboard'
import { PanelSaludSistema } from '../components/PanelSaludSistema'
import { VistaPreviaConcentraciones } from '../components/VistaPreviaConcentraciones'
import { ListaTarjetasCaida } from '../components/ListaTarjetasCaida'
import { ModalGestionIncidente } from '../../incidents/components/ModalGestionIncidente'
import { formatDateTime } from '../../../lib/fechaHora'

export function PaginaDashboard() {
  const summary = useDashboardSummary()
  const { prtg } = useManualSync()
  const syncing = prtg.isPending
  const [manageId, setManageId] = useState<number | null>(null)

  const data = summary.data
  const lastUpdated = data?.sync.prtg?.finished_at ?? null

  return (
    <DisenoApp
      title="Resumen operativo"
      lastUpdated={lastUpdated ? formatDateTime(lastUpdated) : null}
      syncing={syncing}
      onRefresh={() => void summary.refetch()}
      onSyncPrtg={() => prtg.mutate()}
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

      {prtg.isSuccess ? (
        <p className="mb-3 text-sm text-noc-success">
          {`PRTG ${String(prtg.data.status ?? 'OK')} · procesados ${String(prtg.data.processed_count ?? 0)} · warnings ${String(prtg.data.warning_count ?? 0)}`}
        </p>
      ) : null}

      {data ? (
        <div className="space-y-4">
          <GrillaKpiDashboard kpis={data.kpis} />
          <PanelSaludSistema data={data} />

          <div className="grid gap-4">
            <ListaTarjetasCaida
              title="Caídas recientes"
              rows={data.active_incidents_preview}
              linkTo="/incidents/active"
              linkLabel={`Ver todas (${data.kpis.incidencias_activas}) →`}
              onManage={setManageId}
            />
            <VistaPreviaConcentraciones items={data.concentrations} />
          </div>
        </div>
      ) : null}

      {manageId !== null ? (
        <ModalGestionIncidente incidentId={manageId} onClose={() => setManageId(null)} />
      ) : null}
    </DisenoApp>
  )
}
