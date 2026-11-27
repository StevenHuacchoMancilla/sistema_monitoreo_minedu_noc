import { TarjetaKpi } from '../../../components/ui/TarjetaKpi'
import type { DashboardKpis } from '../../../types/api'

export function GrillaKpiDashboard({ kpis }: { kpis: DashboardKpis }) {
  return (
    <div className="noc-card grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-noc-border sm:grid-cols-3 xl:grid-cols-5 [&_article]:rounded-none [&_article]:border-0 [&_article]:bg-transparent [&_article]:shadow-none">
      <TarjetaKpi label="Total locales" value={kpis.total_locales} />
      <TarjetaKpi label="CID válido" value={kpis.con_cid_valido} />
      <TarjetaKpi label="Operativos" value={kpis.operativos} tone="ok" />
      <TarjetaKpi label="Caídos" value={kpis.caidos} tone="danger" />
      <TarjetaKpi label="Incidencias activas" value={kpis.incidencias_activas} tone="warn" />
      <TarjetaKpi label="Pend. contacto" value={kpis.pendientes_contacto} tone="warn" />
      <TarjetaKpi label="En gestión" value={kpis.en_gestion} />
      <TarjetaKpi label="Sin datos PRTG" value={kpis.sin_datos_prtg} />
      <TarjetaKpi label="Recuperados hoy" value={kpis.recuperados_hoy} tone="ok" />
    </div>
  )
}
