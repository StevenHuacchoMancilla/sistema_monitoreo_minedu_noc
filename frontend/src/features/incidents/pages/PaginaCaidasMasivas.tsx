import { Link } from 'react-router-dom'
import { FileSpreadsheet } from 'lucide-react'
import { useMassOutages, useDashboardSummary } from '../../dashboard/hooks/useDashboard'
import { DisenoApp } from '../../../layouts/DisenoApp'
import { ErrorState, LoadingState } from '../../../components/ui/Estados'
import { TarjetasCaidaMasiva } from '../../dashboard/components/TarjetasCaidaMasiva'
import { EncabezadoPagina } from '../../../components/ui/EncabezadoPagina'

export function PaginaCaidasMasivas() {
  const mass = useMassOutages()
  const summary = useDashboardSummary(120_000)
  const rows = mass.data?.data ?? []

  return (
    <DisenoApp title="Caídas masivas" onRefresh={() => void mass.refetch()}>
      <EncabezadoPagina
        title="Caídas masivas"
        description="Colegios caídos del mismo Nodo/POP. Abre un nodo para foto o vista Excel (puedes quitar filas ya reportadas)."
        actions={
          <Link
            to="/mass-outages/report"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <FileSpreadsheet className="h-4 w-4" aria-hidden />
            Vista Excel
          </Link>
        }
      />
      {mass.isLoading ? <LoadingState /> : null}
      {mass.isError ? (
        <ErrorState message={mass.error instanceof Error ? mass.error.message : 'Error'} />
      ) : null}

      {!mass.isLoading && !mass.isError ? (
        <TarjetasCaidaMasiva
          items={rows}
          title="Caídas masivas por Nodo/POP"
          subtitle="Colegios caídos que comparten el mismo Nodo/POP. Distinto de Concentraciones (distrito de la rama PRTG)."
          action={
            <span className="rounded-full bg-[#1d1d1f] px-3 py-1 text-xs font-semibold tabular-nums text-white">
              {(summary.data?.nav?.caidas_masivas ?? rows.length).toLocaleString('es-PE')}
            </span>
          }
        />
      ) : null}
    </DisenoApp>
  )
}
