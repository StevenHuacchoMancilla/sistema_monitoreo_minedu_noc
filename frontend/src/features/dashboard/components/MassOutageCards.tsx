import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Camera, FileSpreadsheet, Network } from 'lucide-react'
import { SectionCard } from '../../../components/ui/Card'
import { EmptyState } from '../../../components/ui/States'
import type { Concentration } from '../../../types/api'
import { formatDateTime } from '../../../lib/datetime'

export function massOutageNodoPath(nodo: string): string {
  const params = new URLSearchParams()
  params.set('nodo', nodo)
  return `/mass-outages/nodo?${params.toString()}`
}

function NodoCard({ item }: { item: Concentration }) {
  const pct = item.porcentaje_caidos ?? 0
  const techs = item.tecnologias_caidas ?? []
  const nodo = item.nodo_pop || item.label

  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-red-500/20 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-5 shadow-[0_12px_40px_rgba(0,0,0,0.25)] ring-1 ring-white/5">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-red-500 via-orange-400 to-transparent opacity-80" />

      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-red-500/15 px-2.5 py-1 text-[10px] font-bold tracking-wide text-red-300 uppercase ring-1 ring-red-500/25">
            <Network className="h-3 w-3" aria-hidden />
            Nodo / POP
          </div>
          <h3 className="truncate text-lg font-bold tracking-tight text-white">{nodo}</h3>
          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-400">
            Distritos: {item.distrito ?? '—'}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-red-500/20 px-2.5 py-1 text-xs font-bold tabular-nums text-red-300 ring-1 ring-red-500/30">
          {pct}%
        </span>
      </div>

      <div className="mt-5 flex items-end gap-3">
        <p className="text-5xl font-bold tabular-nums leading-none text-red-400">{item.caidos}</p>
        <p className="pb-1 text-sm leading-tight text-slate-400">
          {item.caidos === 1 ? 'colegio caído' : 'colegios caídos'}
          <span className="mt-0.5 block text-xs text-slate-500">de {item.total ?? '—'} en este Nodo/POP</span>
        </p>
      </div>

      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-slate-800">
        <div className="h-full rounded-full bg-gradient-to-r from-red-500 to-orange-400" style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
      </div>

      {techs.length > 0 ? (
        <p className="mt-4 text-sm font-semibold text-slate-200">
          {techs.map((tech) => `${tech.tecnologia} ${tech.caidos}`).join(' · ')}
        </p>
      ) : null}

      <p className="mt-2 text-xs text-slate-500">
        {item.operativos ?? 0} operativos · {item.sin_monitoreo ?? 0} sin monitoreo
      </p>

      {item.oldest_started_at ? (
        <p className="mt-2 text-[11px] text-slate-500">
          Caída más antigua: {formatDateTime(item.oldest_started_at)}
        </p>
      ) : null}

      <div className="mt-auto flex flex-wrap gap-2 pt-5">
        <Link
          to={massOutageNodoPath(nodo)}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-red-500/15 px-3 py-2.5 text-sm font-semibold text-red-200 ring-1 ring-red-500/25 transition hover:bg-red-500/25"
        >
          Ver caídos →
        </Link>
        <Link
          to={`/mass-outages/report?nodo=${encodeURIComponent(nodo)}`}
          className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-slate-800 px-3 py-2.5 text-sm font-semibold text-slate-200 ring-1 ring-slate-700 transition hover:bg-slate-700"
          title="Vista Excel"
        >
          <FileSpreadsheet className="h-4 w-4" aria-hidden />
        </Link>
        <Link
          to={massOutageNodoPath(nodo)}
          className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-slate-800 px-3 py-2.5 text-sm font-semibold text-slate-200 ring-1 ring-slate-700 transition hover:bg-slate-700"
          title="Foto de caídos"
        >
          <Camera className="h-4 w-4" aria-hidden />
        </Link>
      </div>
    </article>
  )
}

export function MassOutageCards({
  items,
  title = 'Caídas masivas por Nodo/POP',
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
        <EmptyState
          title="Sin caídas masivas"
          description="No hay Nodo/POP con 2 o más colegios caídos a la vez."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {rows.map((item) => (
            <NodoCard key={item.nodo_pop || item.label} item={item} />
          ))}
        </div>
      )}
      <p className="mt-4 text-xs text-noc-muted">
        Agrupa por Nodo/POP (posible fallo de agregación). Concentraciones sigue siendo por distrito de la rama PRTG.
        En cada nodo puedes sacar foto de los caídos (eligiendo filas) o armar el Excel quitando los ya reportados.
      </p>
    </SectionCard>
  )
}
