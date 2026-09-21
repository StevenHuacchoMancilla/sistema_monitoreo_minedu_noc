import { SectionCard } from '../../../components/ui/Card'
import type { DashboardSummary } from '../../../types/api'

function Dot({ ok, warn }: { ok: boolean; warn?: boolean }) {
  const color = !ok ? 'bg-noc-danger' : warn ? 'bg-noc-warning' : 'bg-noc-success'
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${color}`} />
}

function fmt(iso?: string | null) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleTimeString()
  } catch {
    return iso
  }
}

export function SystemHealthPanel({ data }: { data: DashboardSummary }) {
  const prtg = data.sync.prtg
  const cloud = data.sync.cloudnet
  const prtgWarn = (prtg?.warning_count ?? 0) > 0 || (prtg?.error_count ?? 0) > 0
  const cloudWarn = (cloud?.warning_count ?? 0) > 0 || (cloud?.error_count ?? 0) > 0

  return (
    <SectionCard title="Salud del sistema">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex items-center gap-2 text-sm">
          <Dot ok={data.health.api === 'online'} />
          <span>API · Online</span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Dot ok={data.health.database === 'online'} />
          <span>
            PostgreSQL · {data.health.database === 'online' ? 'Online' : 'Offline'}
          </span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Dot ok={Boolean(prtg?.finished_at)} warn={prtgWarn} />
          <span>
            PRTG · {prtg?.finished_at ? (prtgWarn ? 'Sync con advertencias' : 'Sincronizado') : 'Sin sync'}
          </span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Dot ok={Boolean(cloud?.finished_at)} warn={cloudWarn} />
          <span>
            Cloudnet · {cloud?.finished_at ? (cloudWarn ? 'Sync con advertencias' : 'Sincronizado') : 'Sin sync'}
          </span>
        </div>
      </div>
      <div className="mt-3 grid gap-1 text-xs text-noc-muted sm:grid-cols-2">
        <p>Último sync PRTG: {fmt(prtg?.finished_at)}</p>
        <p>Último sync Cloudnet: {fmt(cloud?.finished_at)}</p>
        <p>
          PRTG procesados: {prtg?.processed_count ?? 0} · warnings: {prtg?.warning_count ?? 0} · errores:{' '}
          {prtg?.error_count ?? 0}
        </p>
        <p>
          Cloudnet procesados: {cloud?.processed_count ?? 0} · warnings: {cloud?.warning_count ?? 0} · errores:{' '}
          {cloud?.error_count ?? 0}
        </p>
      </div>
    </SectionCard>
  )
}
