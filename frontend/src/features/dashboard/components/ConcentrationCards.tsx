import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { SectionCard } from '../../../components/ui/Card'
import { EmptyState } from '../../../components/ui/States'
import type { Concentration } from '../../../types/api'

function ZoneCard({ item }: { item: Concentration }) {
  const pct = item.porcentaje_caidos ?? 0
  return (
    <article className="flex h-full flex-col rounded-2xl border border-noc-border/80 bg-noc-surface p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.04)]">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-[15px] font-semibold tracking-tight text-noc-text">{item.label}</h3>
          <p className="mt-1 text-xs text-noc-muted">Nodo/POP: {item.nodo_pop ?? '—'}</p>
        </div>
        <span className="shrink-0 rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold tabular-nums text-noc-danger">
          {pct}%
        </span>
      </div>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
        <div>
          <dt className="text-[11px] uppercase tracking-wide text-noc-muted">Total</dt>
          <dd className="font-semibold tabular-nums">{item.total ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-wide text-noc-muted">Monitoreados</dt>
          <dd className="font-semibold tabular-nums">{item.monitoreados ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-wide text-noc-muted">Caídos</dt>
          <dd className="font-semibold tabular-nums text-noc-danger">{item.caidos}</dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-wide text-noc-muted">Operativos</dt>
          <dd className="font-semibold tabular-nums text-noc-success">{item.operativos ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-wide text-noc-muted">Sin monitoreo</dt>
          <dd className="font-semibold tabular-nums">{item.sin_monitoreo ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-wide text-noc-muted">Afectados</dt>
          <dd className="font-semibold tabular-nums">{item.afectados ?? item.caidos}</dd>
        </div>
      </dl>

      {item.oldest_started_at ? (
        <p className="mt-3 text-[11px] text-noc-muted">
          Más antigua: {new Date(item.oldest_started_at).toLocaleString()}
        </p>
      ) : null}

      <div className="mt-auto pt-4">
        <Link
          to={`/incidents/active?provincia=${encodeURIComponent(item.provincia ?? '')}&distrito=${encodeURIComponent(item.distrito ?? '')}`}
          className="text-sm font-medium text-noc-info hover:underline"
        >
          Ver colegios de la zona →
        </Link>
      </div>
    </article>
  )
}

export function ConcentrationCards({
  items,
  title = 'Concentraciones zonales',
  subtitle,
  action,
  limit,
}: {
  items: Concentration[]
  title?: string
  subtitle?: string
  action?: ReactNode
  limit?: number
}) {
  const rows = typeof limit === 'number' ? items.slice(0, limit) : items

  return (
    <SectionCard title={title} action={action}>
      {subtitle ? <p className="mb-4 text-sm text-noc-muted">{subtitle}</p> : null}
      {rows.length === 0 ? (
        <EmptyState title="Sin concentraciones" description="No hay zonas con 2 o más caídas activas." />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {rows.map((item) => (
            <ZoneCard key={`${item.provincia}-${item.distrito}-${item.label}`} item={item} />
          ))}
        </div>
      )}
      <p className="mt-4 text-xs text-noc-muted">
        Comparación entre colegios caídos, operativos y sin monitoreo dentro de cada zona. No se afirma causa
        de nodo automáticamente.
      </p>
    </SectionCard>
  )
}
