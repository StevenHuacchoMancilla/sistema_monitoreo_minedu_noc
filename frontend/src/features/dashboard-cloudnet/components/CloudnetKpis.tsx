import { KpiCard } from '../../../components/ui/KpiCard'
import type { CloudnetDashboard } from '../types/cloudnetDashboard'

export function CloudnetKpis({ data }: { data: CloudnetDashboard }) {
  const k = data.kpis
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
      <KpiCard accent="cloudnet" label="Sites Cloudnet" value={k.sites} tone="cyan" />
      <KpiCard accent="cloudnet" label="Sites vinculados" value={k.linked_sites} tone="ok" />
      <KpiCard
        accent="cloudnet"
        label="Sites sin asociación"
        value={k.unlinked_sites}
        tone="warn"
        to={data.links.unlinked}
        linkLabel="Ver no asociados →"
      />
      <KpiCard accent="cloudnet" label="Dispositivos totales" value={k.devices_total} />
      <KpiCard accent="cloudnet" label="Dispositivos online" value={k.devices_online} tone="ok" />
      <KpiCard accent="cloudnet" label="Dispositivos offline" value={k.devices_offline} tone="danger" />
      <KpiCard accent="cloudnet" label="AP totales" value={k.aps_total} />
      <KpiCard accent="cloudnet" label="AP online" value={k.aps_online} tone="ok" />
      <KpiCard accent="cloudnet" label="AP offline" value={k.aps_offline} tone="danger" />
      <KpiCard accent="cloudnet" label="Clientes conectados" value={k.online_clients} tone="cyan" />
      <KpiCard accent="cloudnet" label="Sites sin device" value={k.sites_without_device} tone="warn" />
      <KpiCard accent="cloudnet" label="Sites sin AP" value={k.sites_without_ap} tone="warn" />
    </div>
  )
}
