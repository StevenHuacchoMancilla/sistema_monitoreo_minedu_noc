import { Fragment, useMemo, useState } from 'react'
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { Link } from 'react-router-dom'
import { SectionCard } from '../../../components/ui/Card'
import { HealthDot, MetricRow, ProgressBar } from '../../../components/ui/KpiCard'
import type { CloudnetDashboard } from '../types/cloudnetDashboard'
import { formatTime } from '../../../lib/datetime'

const tooltipStyle = {
  borderRadius: 8,
  border: '1px solid #e2e8f0',
  fontSize: 12,
  fontWeight: 600,
}

export function CloudnetHealthCard({ data }: { data: CloudnetDashboard }) {
  const sync = data.sync
  return (
    <SectionCard title="Estado de sincronización Cloudnet" accent="cloudnet">
      <HealthDot online={data.health.api} label="API Laravel" />
      <HealthDot online={data.health.database} label="PostgreSQL" />
      <HealthDot online={data.health.cloudnet} label="Cloudnet" />
      <div className="mt-3 border-t border-slate-100 pt-2">
        <MetricRow
          label="Última sincronización"
          value={sync?.last_sync ? formatTime(sync.last_sync) : '—'}
        />
        <MetricRow label="Procesados" value={sync?.processed ?? 0} />
        <MetricRow label="Warnings" value={sync?.warnings ?? 0} tone={(sync?.warnings ?? 0) > 0 ? 'warn' : 'default'} />
        <MetricRow label="Errores" value={sync?.errors ?? 0} tone={(sync?.errors ?? 0) > 0 ? 'danger' : 'default'} />
      </div>
    </SectionCard>
  )
}

export function DeviceStatusCard({ data }: { data: CloudnetDashboard }) {
  const d = data.device_status
  const chart = (data.charts?.devices ?? []).filter((x) => x.value > 0)
  return (
    <SectionCard title="Dispositivos" accent="cloudnet">
      {d.total === 0 ? (
        <p className="text-sm font-medium text-slate-500">
          Aún no hay devices en PostgreSQL. El sync de sites por CID está activo; el API `/shop/device` de esta apikey
          responde error de parámetros/permiso. Cuando H3C lo habilite, los seriales aparecerán automáticamente.
        </p>
      ) : (
        <>
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Online</p>
              <p className="text-2xl font-bold tabular-nums text-noc-success">
                {d.online} / {d.total}
              </p>
            </div>
            <p className="text-lg font-bold text-slate-950">{d.availability_pct ?? 0}%</p>
          </div>
          <ProgressBar value={d.online} max={Math.max(1, d.total)} tone="cyan" />
          {chart.length > 0 ? (
            <div className="mt-3 h-40">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={chart} dataKey="value" nameKey="label" innerRadius={40} outerRadius={60} paddingAngle={2}>
                    {chart.map((entry) => (
                      <Cell key={entry.key} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : null}
          <div className="mt-3">
            <MetricRow label="Online" value={d.online} tone="ok" />
            <MetricRow label="Offline" value={d.offline} tone="danger" />
            <MetricRow label="Unknown" value={d.unknown} />
          </div>
        </>
      )}
    </SectionCard>
  )
}

export function ApStatusCard({ data }: { data: CloudnetDashboard }) {
  const a = data.ap_status
  return (
    <SectionCard title="Access Points" accent="cloudnet">
      {a.total === 0 ? (
        <p className="text-sm font-medium text-slate-500">
          Sin APs sincronizados todavía. Depende del mismo API de inventario Cloudnet por shop/CID.
        </p>
      ) : (
        <>
          <MetricRow label="AP online" value={a.online} tone="ok" />
          <MetricRow label="AP offline" value={a.offline} tone="danger" />
          <MetricRow label="AP sin información" value={a.unknown} />
          <MetricRow label="Sites sin AP" value={a.sites_without_ap} tone="warn" />
        </>
      )}
    </SectionCard>
  )
}

export function ClientStatusCard({ data }: { data: CloudnetDashboard }) {
  const c = data.clients
  return (
    <SectionCard title="Clientes conectados" accent="cloudnet">
      {!c.data_available ? (
        <p className="text-sm font-medium text-slate-500">
          No hay información de clientes todavía (depende de sync de APs).
        </p>
      ) : (
        <>
          <MetricRow label="Clientes online actuales" value={c.online} tone="ok" />
          <MetricRow label="Sites con clientes" value={c.sites_with_clients} />
          <MetricRow label="Sites sin clientes" value={c.sites_without_clients} />
          <MetricRow label="Promedio clientes por site" value={c.avg_per_site} />
          {c.top_sites.length > 0 ? (
            <div className="mt-3 border-t border-slate-100 pt-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Top sites por clientes</p>
              <ul className="space-y-1.5">
                {c.top_sites.map((site) => (
                  <li key={`${site.shop_id}-${site.cid_detected}`} className="flex justify-between text-sm">
                    <span className="font-medium text-slate-700">
                      {site.cid_detected ? `CID${site.cid_detected}` : site.site_name ?? site.shop_id}
                    </span>
                    <span className="font-bold tabular-nums text-slate-950">{site.clients}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      )}
    </SectionCard>
  )
}

export function CloudnetCoverageCard({ data }: { data: CloudnetDashboard }) {
  const c = data.coverage
  return (
    <SectionCard
      title="Cobertura de integración"
      accent="cloudnet"
      action={
        <Link to={data.links.unlinked} className="text-xs font-semibold text-noc-cyan hover:underline">
          Ver no asociados →
        </Link>
      }
    >
      <MetricRow label="Locales actuales" value={c.total_schools} />
      <MetricRow label="Sites Cloudnet" value={c.sites} />
      <MetricRow label="Sites vinculados" value={c.linked_sites} tone="ok" />
      <MetricRow label="Sites sin asociación" value={c.unlinked_sites} tone="warn" />
      <MetricRow label="Locales sin site Cloudnet" value={c.schools_without_site} tone="warn" />
      <MetricRow label="Sites con CID detectado" value={c.sites_with_cid} />
      <MetricRow label="Sites con código local detectado" value={c.sites_with_codigo_local} />
    </SectionCard>
  )
}

export function CloudnetCorrelationCard({ data }: { data: CloudnetDashboard }) {
  const c = data.correlation
  return (
    <SectionCard title="Correlación con PRTG" accent="cloudnet">
      <p className="mb-3 text-xs font-medium text-slate-500">{c.note}</p>
      <MetricRow label="PRTG caído + Cloudnet offline" value={c.prtg_down_cloudnet_offline} tone="danger" />
      <MetricRow label="PRTG caído + Cloudnet online" value={c.prtg_down_cloudnet_online} tone="warn" />
      <MetricRow label="PRTG operativo + Cloudnet offline" value={c.prtg_operational_cloudnet_offline} tone="warn" />
    </SectionCard>
  )
}

export function CloudnetInventoryPanel({ data }: { data: CloudnetDashboard }) {
  const inventory = data.inventory
  const [q, setQ] = useState('')
  const [openCid, setOpenCid] = useState<string | null>(null)

  const rows = useMemo(() => {
    if (!inventory) return []
    const term = q.trim().toLowerCase()
    if (!term) return inventory.rows
    return inventory.rows.filter((row) => {
      const hay = [
        row.cid,
        row.codigo_local,
        row.site_name,
        row.school,
        row.provincia,
        row.distrito,
        row.address,
        ...row.devices.map((d) => `${d.serial} ${d.model} ${d.ip}`),
        ...row.aps.map((a) => `${a.serial} ${a.model}`),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return hay.includes(term)
    })
  }, [inventory, q])

  if (!inventory) {
    return null
  }

  return (
    <SectionCard title="Inventario Cloudnet por CID" accent="cloudnet">
      <p className="mb-3 text-xs font-medium text-slate-500">{inventory.note}</p>
      <div className="mb-3 grid gap-2 sm:grid-cols-4">
        <MetricRow label="Sites con CID" value={inventory.total_sites_with_cid} />
        <MetricRow label="Con equipos" value={inventory.sites_with_devices} tone="ok" />
        <MetricRow label="Con APs" value={inventory.sites_with_aps} />
        <MetricRow label="Equipos offline" value={inventory.offline_devices} tone="danger" />
      </div>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar CID, colegio, serial, IP, distrito…"
        className="mb-3 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 outline-none ring-cyan-600/30 focus:ring"
      />
      <div className="max-h-[34rem] overflow-auto rounded-lg border border-slate-100">
        <table className="min-w-full text-left text-sm">
          <thead className="sticky top-0 bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">CID</th>
              <th className="px-3 py-2">Local / Ubicación</th>
              <th className="px-3 py-2">Equipos</th>
              <th className="px-3 py-2">APs</th>
              <th className="px-3 py-2">Clientes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const key = String(row.cid ?? row.shop_id)
              const open = openCid === key
              return (
                <Fragment key={key}>
                  <tr
                    className="cursor-pointer border-t border-slate-100 hover:bg-slate-50"
                    onClick={() => setOpenCid(open ? null : key)}
                  >
                    <td className="px-3 py-2 font-semibold tabular-nums text-slate-950">
                      {row.cid ? `CID${row.cid}` : '—'}
                      <div className="text-[11px] font-medium text-slate-500">{row.codigo_local ?? ''}</div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium text-slate-800">{row.school ?? row.site_name ?? '—'}</div>
                      <div className="text-[11px] text-slate-500">
                        {[row.provincia, row.distrito].filter(Boolean).join(' · ') || row.address || '—'}
                      </div>
                    </td>
                    <td className="px-3 py-2 tabular-nums font-semibold">{row.devices_total}</td>
                    <td className="px-3 py-2 tabular-nums font-semibold">{row.aps_total}</td>
                    <td className="px-3 py-2 tabular-nums font-semibold">{row.clients}</td>
                  </tr>
                  {open ? (
                    <tr className="bg-slate-50/80">
                      <td colSpan={5} className="px-3 py-3">
                        <div className="grid gap-3 md:grid-cols-2">
                          <div>
                            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                              Equipos
                            </p>
                            {row.devices.length === 0 ? (
                              <p className="text-xs text-slate-500">Sin equipos sincronizados</p>
                            ) : (
                              <ul className="space-y-1.5">
                                {row.devices.map((d, i) => (
                                  <li
                                    key={`${d.serial}-${i}`}
                                    className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs"
                                  >
                                    <span className="font-semibold text-slate-900">{d.serial ?? 's/n'}</span>
                                    <span className="text-slate-500"> · {d.model ?? '—'}</span>
                                    <div className="text-slate-600">
                                      {d.status ?? '—'} · {d.ip ?? 'sin IP'} · {d.mac ?? 'sin MAC'}
                                    </div>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                          <div>
                            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">APs</p>
                            {row.aps.length === 0 ? (
                              <p className="text-xs text-slate-500">Sin APs sincronizados</p>
                            ) : (
                              <ul className="space-y-1.5">
                                {row.aps.map((a, i) => (
                                  <li
                                    key={`${a.serial}-${i}`}
                                    className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs"
                                  >
                                    <span className="font-semibold text-slate-900">{a.serial ?? 's/n'}</span>
                                    <span className="text-slate-500"> · {a.model ?? '—'}</span>
                                    <div className="text-slate-600">
                                      {a.status ?? '—'} · clientes {a.clients} · {a.ip ?? 'sin IP'}
                                    </div>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              )
            })}
          </tbody>
        </table>
        {rows.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm font-medium text-slate-500">Sin resultados para “{q}”</p>
        ) : null}
      </div>
    </SectionCard>
  )
}
