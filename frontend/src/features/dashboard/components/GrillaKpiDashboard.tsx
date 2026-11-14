import { TarjetaKpi } from '../../../components/ui/TarjetaKpi'
import type { DashboardKpis } from '../../../types/api'

export function GrillaKpiDashboard({ kpis }: { kpis: DashboardKpis }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
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
