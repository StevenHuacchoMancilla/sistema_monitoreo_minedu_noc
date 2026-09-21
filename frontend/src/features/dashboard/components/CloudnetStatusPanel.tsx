import { SectionCard } from '../../../components/ui/Card'
import type { DashboardSummary } from '../../../types/api'

export function CloudnetStatusPanel({
  cloudnet,
  kpis,
}: {
  cloudnet: DashboardSummary['cloudnet']
  kpis: DashboardSummary['kpis']
}) {
  return (
    <SectionCard title="Estado Cloudnet">
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-noc-muted">Sites vinculados</dt>
          <dd className="text-lg font-semibold">{cloudnet.sites}</dd>
        </div>
        <div>
          <dt className="text-noc-muted">Asociados</dt>
          <dd className="text-lg font-semibold">{cloudnet.matched}</dd>
        </div>
        <div>
          <dt className="text-noc-muted">Sin asociación</dt>
          <dd className="text-lg font-semibold">{kpis.sites_sin_asociacion}</dd>
        </div>
        <div>
          <dt className="text-noc-muted">Devices online</dt>
          <dd className="text-lg font-semibold">{kpis.cloudnet_online_devices}</dd>
        </div>
        <div>
          <dt className="text-noc-muted">Devices offline</dt>
          <dd className="text-lg font-semibold">{kpis.cloudnet_offline_devices}</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-noc-muted">Última sincronización</dt>
          <dd className="text-sm">
            {cloudnet.last_synced_at
              ? new Date(cloudnet.last_synced_at).toLocaleString()
              : '—'}
          </dd>
        </div>
      </dl>
      {(cloudnet.preview ?? []).length > 0 ? (
        <ul className="mt-4 space-y-2 text-sm">
          {cloudnet.preview?.map((site) => (
            <li key={String(site.shop_id)} className="rounded-xl border border-noc-border/70 px-3 py-2">
              <p className="truncate font-medium" title={site.site_name ?? ''}>
                {site.site_name ?? site.shop_id}
              </p>
              <p className="text-xs text-noc-muted">{site.address || 'Sin dirección'}</p>
              <p className="text-xs text-noc-muted">Shop {site.shop_id} · {site.match_status ?? '—'}</p>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="mt-3 text-xs text-noc-muted">
        Sites vinculados a la plataforma. El conteo de devices online/offline sale de equipos Cloudnet;
        si está en 0, el sync de shops ya está, pero aún no hay inventario de equipos.
      </p>
    </SectionCard>
  )
}
