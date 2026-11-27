import { TarjetaKpi } from '../../../components/ui/TarjetaKpi'
import type { PrtgDashboard } from '../types/dashboardPrtg'

export function KpisPrtg({ data }: { data: PrtgDashboard }) {
  const { kpis, status_distribution: dist, links, inventory } = data
  const monitored = Math.max(1, kpis.monitored)

  return (
    <div className="space-y-3">
      <p className="text-xs font-medium text-slate-500">
        Conectividad por colegio (sensor <span className="font-semibold text-slate-700">Ping</span>). En PRTG el grupo
        muestra ~{inventory?.sensors_total ?? '—'} sensores porque cada colegio suele tener Ping + LAN COLEGIO
        ({inventory?.sensors_ping ?? '—'} Ping · {inventory?.sensors_lan ?? '—'} LAN).
      </p>
      <div className="noc-card grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-noc-border sm:grid-cols-3 xl:grid-cols-5 [&_article]:rounded-none [&_article]:border-0 [&_article]:bg-transparent [&_article]:shadow-none">
        <TarjetaKpi accent="prtg" label="Total locales (BD)" value={kpis.total_schools} />
        <TarjetaKpi accent="prtg" label="CID válido" value={kpis.valid_cid} />
        <TarjetaKpi
          accent="prtg"
          label="Colegios en PRTG"
          value={kpis.prtg_devices ?? inventory?.devices ?? kpis.monitored}
          hint="Dispositivos CID en el scope actual"
        />
        <TarjetaKpi
          accent="prtg"
          label="Monitoreados (Ping)"
          value={kpis.monitored}
          hint={`${dist.operational_pct}% operativos`}
        />
        <TarjetaKpi
          accent="prtg"
          label="Operativos (Ping)"
          value={kpis.operational}
          tone="ok"
          hint={`${((kpis.operational / monitored) * 100).toFixed(1)} % de monitoreados`}
        />
        <TarjetaKpi
          accent="prtg"
          label="Caídos (Ping)"
          value={kpis.down}
          tone="danger"
          to={links.downs}
          linkLabel="Ver detalle →"
        />
        <TarjetaKpi accent="prtg" label="Parciales" value={kpis.partial} tone="warn" />
        <TarjetaKpi accent="prtg" label="Pausados" value={kpis.paused} />
        <TarjetaKpi
          accent="prtg"
          label="Sin datos PRTG"
          value={kpis.without_prtg}
          tone="warn"
          to={links.without_prtg}
          linkLabel="Ver diagnóstico →"
        />
        <TarjetaKpi accent="prtg" label="Incidencias activas" value={kpis.active_incidents} tone="danger" to={links.downs} />
        <TarjetaKpi
          accent="prtg"
          label="Pendientes de gestión"
          value={kpis.pending_contact}
          tone="warn"
          to={links.pending_contact}
        />
        <TarjetaKpi accent="prtg" label="En gestión" value={kpis.in_management} tone="info" to={links.in_management} />
        <TarjetaKpi accent="prtg" label="Recuperados hoy" value={kpis.recovered_today} tone="ok" />
        <TarjetaKpi
          accent="prtg"
          label="Sensores sync"
          value={kpis.prtg_sensors_total ?? inventory?.sensors_total ?? 0}
          hint={`Ping ${kpis.prtg_sensors_ping ?? 0} · LAN ${kpis.prtg_sensors_lan ?? 0}`}
        />
      </div>
    </div>
  )
}
