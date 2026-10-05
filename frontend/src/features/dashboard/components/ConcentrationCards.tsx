import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { SectionCard } from '../../../components/ui/Card'
import { EmptyState } from '../../../components/ui/States'
import type { Concentration } from '../../../types/api'
import { formatDateTime } from '../../../lib/datetime'

export function concentrationZonePath(item: Pick<Concentration, 'provincia' | 'distrito'>): string {
  const params = new URLSearchParams()
  if (item.provincia) params.set('provincia', item.provincia)
  if (item.distrito) params.set('distrito', item.distrito)
  return `/concentrations/zone?${params.toString()}`
}

function ZoneCard({ item }: { item: Concentration }) {
  const pct = item.porcentaje_caidos ?? 0
  const techs = item.tecnologias_caidas ?? []

  return (
    <article className="flex h-full flex-col rounded-2xl border border-noc-border/80 bg-noc-surface p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.04)]">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-base font-semibold leading-snug tracking-tight text-noc-text">{item.label}</h3>
          <p className="mt-1 text-xs leading-relaxed text-noc-muted">Nodo/POP: {item.nodo_pop ?? '—'}</p>
        </div>
        <span className="shrink-0 rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold tabular-nums text-noc-danger dark:bg-red-950/40">
          {pct}%
        </span>
      </div>

      <div className="mt-5 flex items-end gap-3">
        <p className="text-4xl font-semibold tabular-nums leading-none text-noc-danger">{item.caidos}</p>
        <p className="pb-0.5 text-sm leading-tight text-noc-muted">
          {item.caidos === 1 ? 'colegio caído' : 'colegios caídos'}
          <span className="mt-0.5 block text-xs">de {item.total ?? '—'} en esta zona PRTG</span>
        </p>
      </div>

      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div
          className="h-full rounded-full bg-red-500"
          style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
        />
      </div>

      {techs.length > 0 ? (
        <p className="mt-4 text-sm font-medium text-noc-text">
          {techs.map((tech) => `${tech.tecnologia} ${tech.caidos}`).join(' · ')}
        </p>
      ) : null}

      <p className="mt-2 text-xs text-noc-muted">
        {item.operativos ?? 0} operativos · {item.sin_monitoreo ?? 0} sin monitoreo
      </p>

      {item.oldest_started_at ? (
        <p className="mt-2 text-[11px] text-noc-muted">
          Caída más antigua de la zona: {formatDateTime(item.oldest_started_at)}
        </p>
      ) : null}

      <div className="mt-auto pt-4">
        <Link
          to={concentrationZonePath(item)}
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
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {rows.map((item) => (
            <ZoneCard key={`${item.provincia}-${item.distrito}-${item.label}`} item={item} />
          ))}
        </div>
      )}
      <p className="mt-4 text-xs text-noc-muted">
        Cada tarjeta es una zona de la rama PRTG (provincia &gt; distrito). El número grande son los colegios
        caídos ahora. El detalle lista todos los locales de esa zona, con hora de esta caída y tecnología.
      </p>
    </SectionCard>
  )
}
