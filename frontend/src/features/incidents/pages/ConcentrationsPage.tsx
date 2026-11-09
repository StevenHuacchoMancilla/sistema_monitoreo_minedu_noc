import { Layers, MapPinned, TriangleAlert } from 'lucide-react'
import { useMemo } from 'react'
import { useConcentrations, useDashboardSummary, useManualSync } from '../../dashboard/hooks/useDashboard'
import { AppLayout } from '../../../layouts/AppLayout'
import { PageHeader } from '../../../components/ui/PageHeader'
import { MetricCard } from '../../../components/ui/MetricCard'
import { MetricsGrid } from '../../../components/ui/MetricsGrid'
import { ErrorState, LoadingState } from '../../../components/ui/States'
import { Badge } from '../../../components/ui/SoftBadge'
import { ConcentrationCards } from '../../dashboard/components/ConcentrationCards'

export function ConcentrationsPage() {
  const concentrations = useConcentrations()
  const summary = useDashboardSummary()
  const { prtg } = useManualSync()
  const rows = concentrations.data?.data ?? []

  const kpis = useMemo(() => {
    const zones = rows.length
    const down = rows.reduce((sum, z) => sum + (z.caidos ?? 0), 0)
    const worst = rows.reduce<(typeof rows)[number] | null>((best, z) => {
      if (!best) return z
      const a = z.porcentaje_caidos ?? 0
      const b = best.porcentaje_caidos ?? 0
      if (a > b) return z
      if (a === b && (z.caidos ?? 0) > (best.caidos ?? 0)) return z
      return best
    }, null)
    return { zones, down, worst }
  }, [rows])

  const navCount = summary.data?.nav?.concentraciones ?? rows.length

  return (
    <AppLayout
      title="Concentraciones zonales"
      syncing={prtg.isPending}
      onRefresh={() => void concentrations.refetch()}
      onSyncPrtg={() => prtg.mutate()}
    >
      <PageHeader
        icon={<Layers className="h-5 w-5" />}
        title="Concentraciones zonales"
        description="Zonas de la rama PRTG con varios colegios caídos a la vez. Abre una zona para ver cada colegio, la hora de esta caída y si es P2P o GPON."
        badges={
          <Badge tone="danger" className="tabular-nums">
            {navCount.toLocaleString('es-PE')} zonas
          </Badge>
        }
      />

      {concentrations.isLoading ? <LoadingState /> : null}
      {concentrations.isError ? (
        <ErrorState
          message={concentrations.error instanceof Error ? concentrations.error.message : 'Error'}
        />
      ) : null}

      {!concentrations.isLoading && !concentrations.isError ? (
        <>
          <MetricsGrid>
            <MetricCard icon={<MapPinned />} label="Zonas activas" value={kpis.zones} tone="warning" />
            <MetricCard
              icon={<TriangleAlert />}
              label="Colegios caídos"
              value={kpis.down}
              description="Suma en concentraciones"
              tone="danger"
            />
            <MetricCard
              icon={<TriangleAlert />}
              label="Zona más crítica"
              value={kpis.worst ? `${kpis.worst.porcentaje_caidos ?? 0}%` : '—'}
              description={kpis.worst?.label ?? 'Sin datos'}
              tone="danger"
            />
          </MetricsGrid>

          <ConcentrationCards
            items={rows}
            title="Zonas con concentración"
            subtitle="Ordenadas por % de caídos. El borde indica severidad: crítica (≥20% o ≥5), elevada (≥10% o ≥3)."
            action={
              <Badge tone="neutral" className="tabular-nums">
                {rows.length.toLocaleString('es-PE')}
              </Badge>
            }
          />
        </>
      ) : null}
    </AppLayout>
  )
}
