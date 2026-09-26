import { KpiCard } from '../../../components/ui/KpiCard'
import type { DashboardKpis } from '../../../types/api'

export function DashboardKpiGrid({ kpis }: { kpis: DashboardKpis }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
      <KpiCard label="Total locales" value={kpis.total_locales} />
      <KpiCard label="CID válido" value={kpis.con_cid_valido} />
      <KpiCard label="Operativos" value={kpis.operativos} tone="ok" />
      <KpiCard label="Caídos" value={kpis.caidos} tone="danger" />
      <KpiCard label="Incidencias activas" value={kpis.incidencias_activas} tone="warn" />
      <KpiCard label="Pend. contacto" value={kpis.pendientes_contacto} tone="warn" />
      <KpiCard label="En gestión" value={kpis.en_gestion} />
      <KpiCard label="Sin datos PRTG" value={kpis.sin_datos_prtg} />
      <KpiCard label="Recuperados hoy" value={kpis.recuperados_hoy} tone="ok" />
    </div>
  )
}
