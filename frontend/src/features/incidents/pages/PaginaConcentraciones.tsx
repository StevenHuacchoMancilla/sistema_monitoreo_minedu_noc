import { Layers, MapPinned, TriangleAlert } from 'lucide-react'
import { useMemo } from 'react'
import { useConcentrations, useDashboardSummary, useManualSync } from '../../dashboard/hooks/useDashboard'
import { DisenoApp } from '../../../layouts/DisenoApp'
import { EncabezadoPagina } from '../../../components/ui/EncabezadoPagina'
import { TarjetaMetrica } from '../../../components/ui/TarjetaMetrica'
import { GrillaMetricas } from '../../../components/ui/GrillaMetricas'
import { ErrorState, LoadingState } from '../../../components/ui/Estados'
import { Insignia } from '../../../components/ui/InsigniaSuave'
import { TarjetasConcentracion } from '../../dashboard/components/TarjetasConcentracion'

export function PaginaConcentraciones() {
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
    <DisenoApp
      title="Concentraciones zonales"
      syncing={prtg.isPending}
      onRefresh={() => void concentrations.refetch()}
      onSyncPrtg={() => prtg.mutate()}
    >
      <EncabezadoPagina
        icon={<Layers className="h-5 w-5" />}
        title="Concentraciones zonales"
        description="Zonas de la rama PRTG con varios colegios caídos a la vez. Abre una zona para ver cada colegio, la hora de esta caída y si es P2P o GPON."
        badges={
          <Insignia tone="danger" className="tabular-nums">
            {navCount.toLocaleString('es-PE')} zonas
          </Insignia>
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
          <GrillaMetricas>
            <TarjetaMetrica icon={<MapPinned />} label="Zonas activas" value={kpis.zones} tone="warning" />
            <TarjetaMetrica
              icon={<TriangleAlert />}
              label="Colegios caídos"
              value={kpis.down}
              description="Suma en concentraciones"
              tone="danger"
            />
            <TarjetaMetrica
              icon={<TriangleAlert />}
              label="Zona más crítica"
              value={kpis.worst ? `${kpis.worst.porcentaje_caidos ?? 0}%` : '—'}
              description={kpis.worst?.label ?? 'Sin datos'}
              tone="danger"
            />
          </GrillaMetricas>

          <TarjetasConcentracion
            items={rows}
            title="Zonas con concentración"
            subtitle="Ordenadas por % de caídos. El borde indica severidad: crítica (≥20% o ≥5), elevada (≥10% o ≥3)."
            action={
              <Insignia tone="neutral" className="tabular-nums">
                {rows.length.toLocaleString('es-PE')}
              </Insignia>
            }
          />
        </>
      ) : null}
    </DisenoApp>
  )
}
