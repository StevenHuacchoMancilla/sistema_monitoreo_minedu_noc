import { useConcentrations, useDashboardSummary, useManualSync } from '../../dashboard/hooks/useDashboard'
import { AppLayout } from '../../../layouts/AppLayout'
import { ErrorState, LoadingState } from '../../../components/ui/States'
import { ConcentrationCards } from '../../dashboard/components/ConcentrationCards'

export function ConcentrationsPage() {
  const concentrations = useConcentrations()
  const summary = useDashboardSummary()
  const { prtg, cloudnet } = useManualSync()
  const rows = concentrations.data?.data ?? []

  return (
    <AppLayout
      title="Concentraciones zonales"
      syncing={prtg.isPending || cloudnet.isPending}
      onRefresh={() => void concentrations.refetch()}
      onSyncPrtg={() => prtg.mutate()}
      onSyncCloudnet={() => cloudnet.mutate()}
    >
      {concentrations.isLoading ? <LoadingState /> : null}
      {concentrations.isError ? (
        <ErrorState
          message={concentrations.error instanceof Error ? concentrations.error.message : 'Error'}
        />
      ) : null}

      {!concentrations.isLoading && !concentrations.isError ? (
        <ConcentrationCards
          items={rows}
          title="Concentraciones zonales"
          subtitle="Comparación entre colegios caídos, operativos y sin monitoreo dentro de cada zona."
          action={
            <span className="rounded-full bg-[#1d1d1f] px-3 py-1 text-xs font-semibold tabular-nums text-white">
              {(summary.data?.nav?.concentraciones ?? rows.length).toLocaleString('es-PE')}
            </span>
          }
        />
      ) : null}
    </AppLayout>
  )
}
