import { Link } from 'react-router-dom'
import { SectionCard } from '../../../components/ui/Card'
import { HealthDot, MetricRow } from '../../../components/ui/KpiCard'
import type { PrtgDashboard } from '../types/prtgDashboard'
import { formatTime } from '../../../lib/datetime'

export function PrtgHealthCard({ data }: { data: PrtgDashboard }) {
  const sync = data.sync
  return (
    <SectionCard title="Estado del monitoreo PRTG" accent="prtg">
      <HealthDot online={data.health.api} label="API Laravel" />
      <HealthDot online={data.health.database} label="PostgreSQL" />
      <HealthDot online={data.health.prtg} label="PRTG" />
      <div className="mt-3 border-t border-slate-100 pt-2">
        <MetricRow label="Scope activo" value={data.monitoring.source_scope ?? data.inventory?.source_scope ?? '—'} />
        <MetricRow
          label="Última sincronización"
          value={sync?.last_sync ? formatTime(sync.last_sync) : '—'}
        />
        <MetricRow label="Colegios procesados" value={sync?.processed ?? 0} />
        <MetricRow label="Warnings" value={sync?.warnings ?? 0} tone={(sync?.warnings ?? 0) > 0 ? 'warn' : 'default'} />
        <MetricRow label="Errores" value={sync?.errors ?? 0} tone={(sync?.errors ?? 0) > 0 ? 'danger' : 'default'} />
        <MetricRow label="Dispositivos asociados" value={data.monitoring.associated_devices} tone="ok" />
        <MetricRow label="Sin asociación" value={data.monitoring.unassociated_devices} tone="warn" />
        <MetricRow label="Sensores Ping" value={data.monitoring.ping_sensors} />
        <MetricRow label="Sensores LAN COLEGIO" value={data.monitoring.lan_sensors ?? 0} />
        <MetricRow label="Sensores totales sync" value={data.monitoring.sensors_total ?? 0} />
        <MetricRow label="Colegios Ping con problema" value={data.monitoring.problem_sensors} tone="danger" />
      </div>
    </SectionCard>
  )
}

export function PrtgStatusDistribution({ data }: { data: PrtgDashboard }) {
  const d = data.status_distribution
  const max = Math.max(1, d.operational + d.down + d.partial + d.paused + d.without_monitoring)
  const rows = [
    { label: 'Operativos (Ping)', value: d.operational, tone: 'ok' as const },
    { label: 'Caídos (Ping)', value: d.down, tone: 'danger' as const },
    { label: 'Parciales (Ping)', value: d.partial, tone: 'warn' as const },
    { label: 'Pausados (Ping)', value: d.paused, tone: 'default' as const },
    { label: 'Sin monitoreo', value: d.without_monitoring, tone: 'warn' as const },
  ]

  return (
    <SectionCard title="Estado general PRTG" accent="prtg">
      <p className="mb-3 text-xs font-medium text-slate-500">
        Disponibilidad operativa: <span className="font-bold text-slate-950">{d.operational_pct}%</span>
      </p>
      <div className="space-y-3">
        {rows.map((row) => (
          <div key={row.label}>
            <div className="mb-1 flex justify-between text-sm">
              <span className="font-medium text-slate-700">{row.label}</span>
              <span className="font-bold tabular-nums text-slate-950">{row.value.toLocaleString('es-PE')}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-full rounded-full ${
                  row.tone === 'ok'
                    ? 'bg-noc-success'
                    : row.tone === 'danger'
                      ? 'bg-noc-danger'
                      : row.tone === 'warn'
                        ? 'bg-noc-warning'
                        : 'bg-slate-400'
                }`}
                style={{ width: `${(row.value / max) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-4 text-xs font-semibold">
        <Link to="/incidents/active" className="text-noc-info hover:underline">
          Caídos: {d.down} · Ver todos →
        </Link>
        <Link to="/concentrations" className="text-noc-info hover:underline">
          Concentraciones detectadas: {data.kpis.concentrations} · Ver análisis →
        </Link>
      </div>
    </SectionCard>
  )
}

export function PrtgCoverageCard({ data }: { data: PrtgDashboard }) {
  const c = data.coverage
  const withoutPing = c.without_ping ?? c.unassociated
  const samples = c.without_ping_samples ?? []
  return (
    <SectionCard
      title="Cobertura PRTG"
      accent="prtg"
      action={
        <Link to={data.links.diagnostics} className="text-xs font-semibold text-noc-info hover:underline">
          Ver diagnóstico →
        </Link>
      }
    >
      <MetricRow label="Locales con CID válido" value={c.valid_cid} />
      <MetricRow label="Elegibles de monitoreo" value={c.eligible ?? c.valid_cid} />
      <MetricRow label="Con sensor Ping" value={c.with_ping ?? c.associated} tone="ok" />
      <MetricRow
        label="Sin sensor Ping"
        value={withoutPing}
        tone={withoutPing > 0 ? 'warn' : 'default'}
      />
      <MetricRow label="CIDs duplicados detectados" value={c.duplicate_cids} tone={c.duplicate_cids > 0 ? 'danger' : 'default'} />
      <MetricRow
        label="Sensores Ping duplicados"
        value={c.duplicate_ping_sensors}
        tone={c.duplicate_ping_sensors > 0 ? 'danger' : 'default'}
      />
      <MetricRow label="Advertencias de sincronización" value={c.sync_warnings} tone={c.sync_warnings > 0 ? 'warn' : 'default'} />
      {samples.length > 0 ? (
        <div className="mt-3 border-t border-slate-100 pt-3 dark:border-slate-800">
          <p className="mb-2 text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
            Colegios sin Ping ({samples.length}
            {withoutPing > samples.length ? ` de ${withoutPing}` : ''})
          </p>
          <ul className="space-y-1.5">
            {samples.map((row) => (
              <li
                key={`${row.cid ?? 'x'}-${row.codigo_local ?? ''}`}
                className="rounded-lg bg-amber-50/80 px-2.5 py-1.5 text-[12px] text-amber-950 dark:bg-amber-950/30 dark:text-amber-100"
              >
                <span className="font-semibold tabular-nums">CID {row.cid ?? '—'}</span>
                <span className="text-amber-800/80 dark:text-amber-200/80"> · </span>
                <span className="font-medium">{row.local_educativo ?? '—'}</span>
                {row.codigo_local ? (
                  <span className="block truncate text-[11px] text-amber-800/70 dark:text-amber-200/70">
                    Código {row.codigo_local}
                    {row.provincia || row.distrito
                      ? ` · ${[row.provincia, row.distrito].filter(Boolean).join(' / ')}`
                      : ''}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-slate-500">
            El dispositivo existe en PRTG pero no tiene sensor Ping asociado. Crear/vincular Ping en PRTG y
            resincronizar.
          </p>
        </div>
      ) : null}
    </SectionCard>
  )
}
