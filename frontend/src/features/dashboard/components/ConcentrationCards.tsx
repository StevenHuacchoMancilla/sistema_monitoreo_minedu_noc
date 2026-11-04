import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, MapPin, Radio, Server } from 'lucide-react'
import { SectionCard } from '../../../components/ui/Card'
import { EmptyState } from '../../../components/ui/States'
import { Badge } from '../../../components/ui/SoftBadge'
import type { Concentration } from '../../../types/api'
import { formatDateTime } from '../../../lib/datetime'
import { techBadgeClass } from '../../../lib/uiTokens'

export function concentrationZonePath(item: Pick<Concentration, 'provincia' | 'distrito'>): string {
  const params = new URLSearchParams()
  if (item.provincia) params.set('provincia', item.provincia)
  if (item.distrito) params.set('distrito', item.distrito)
  return `/concentrations/zone?${params.toString()}`
}

type Severity = 'critical' | 'elevated' | 'watch'

function severityOf(item: Concentration): Severity {
  const pct = item.porcentaje_caidos ?? 0
  const down = item.caidos ?? 0
  if (pct >= 20 || down >= 5) return 'critical'
  if (pct >= 10 || down >= 3) return 'elevated'
  return 'watch'
}

const severityUi: Record<
  Severity,
  { bar: string; accent: string; badge: 'danger' | 'warning' | 'info'; label: string }
> = {
  critical: {
    bar: 'bg-red-500',
    accent: 'border-l-red-500',
    badge: 'danger',
    label: 'Crítica',
  },
  elevated: {
    bar: 'bg-amber-500',
    accent: 'border-l-amber-500',
    badge: 'warning',
    label: 'Elevada',
  },
  watch: {
    bar: 'bg-orange-400',
    accent: 'border-l-orange-400',
    badge: 'warning',
    label: 'Atención',
  },
}

function splitLabel(label: string): { province: string; district: string | null } {
  const parts = label.split(/\s*>\s*/)
  if (parts.length >= 2) {
    return { province: parts[0]!.trim(), district: parts.slice(1).join(' > ').trim() }
  }
  return { province: label, district: null }
}

function popChips(nodo: string | null | undefined): string[] {
  if (!nodo?.trim()) return []
  return nodo
    .split(/[,;/|]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function ZoneCard({ item }: { item: Concentration }) {
  const pct = item.porcentaje_caidos ?? 0
  const techs = item.tecnologias_caidas ?? []
  const severity = severityOf(item)
  const ui = severityUi[severity]
  const { province, district } = splitLabel(item.label)
  const pops = popChips(item.nodo_pop)
  const total = item.total ?? 0
  const operativos = item.operativos ?? 0
  const sinMon = item.sin_monitoreo ?? 0

  return (
    <Link
      to={concentrationZonePath(item)}
      className={`group flex h-full flex-col rounded-xl border border-slate-200 border-l-4 bg-white p-4 shadow-sm transition duration-150 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700 dark:hover:shadow-none ${ui.accent}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone={ui.badge}>{ui.label}</Badge>
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">
              <MapPin className="h-3 w-3 shrink-0" aria-hidden />
              Zona PRTG
            </span>
          </div>
          <h3 className="mt-2 text-[15px] font-semibold leading-snug tracking-tight text-slate-950 dark:text-slate-50">
            {district ? (
              <>
                <span className="text-slate-500 dark:text-slate-400">{province}</span>
                <span className="mx-1.5 text-slate-300 dark:text-slate-600">/</span>
                <span>{district}</span>
              </>
            ) : (
              province
            )}
          </h3>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-2xl font-bold tabular-nums leading-none text-red-600 dark:text-red-400">{pct}%</p>
          <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">caídos</p>
        </div>
      </div>

      <div className="mt-4 flex items-end gap-2.5">
        <p className="text-4xl font-bold tabular-nums leading-none tracking-tight text-slate-950 dark:text-slate-50">
          {item.caidos}
        </p>
        <div className="pb-0.5 text-sm leading-tight text-slate-500 dark:text-slate-400">
          <span className="font-medium text-slate-700 dark:text-slate-300">
            {item.caidos === 1 ? 'colegio caído' : 'colegios caídos'}
          </span>
          <span className="mt-0.5 block text-xs">
            de {total > 0 ? total.toLocaleString('es-PE') : '—'} en la zona
          </span>
        </div>
      </div>

      <div className="mt-3">
        <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
          <div
            className={`h-full rounded-full transition-[width] ${ui.bar}`}
            style={{ width: `${Math.min(100, Math.max(2, pct))}%` }}
          />
        </div>
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">
          <span className="text-emerald-600 dark:text-emerald-400">{operativos} operativos</span>
          {sinMon > 0 ? (
            <span className="text-amber-600 dark:text-amber-400">{sinMon} sin monitoreo</span>
          ) : (
            <span>0 sin monitoreo</span>
          )}
        </div>
      </div>

      {techs.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {techs.map((tech) => (
            <span
              key={tech.tecnologia}
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${techBadgeClass(tech.tecnologia)}`}
            >
              <Radio className="h-3 w-3 opacity-70" aria-hidden />
              {tech.tecnologia} · {tech.caidos}
            </span>
          ))}
        </div>
      ) : null}

      {pops.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <Server className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
          {pops.map((pop) => (
            <Badge key={pop} tone="neutral" className="!rounded-md !normal-case">
              {pop}
            </Badge>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-xs text-slate-400">Nodo/POP: —</p>
      )}

      {item.oldest_started_at ? (
        <p className="mt-3 text-[11px] text-slate-500 dark:text-slate-400">
          Caída más antigua:{' '}
          <span className="font-medium text-slate-700 dark:text-slate-300">
            {formatDateTime(item.oldest_started_at)}
          </span>
        </p>
      ) : null}

      <div className="mt-auto flex items-center justify-between gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
        <span className="text-sm font-medium text-blue-600 group-hover:underline dark:text-blue-400">
          Ver colegios de la zona
        </span>
        <ArrowRight
          className="h-4 w-4 text-blue-600 transition group-hover:translate-x-0.5 dark:text-blue-400"
          aria-hidden
        />
      </div>
    </Link>
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
  const sorted = [...items].sort((a, b) => {
    const pct = (b.porcentaje_caidos ?? 0) - (a.porcentaje_caidos ?? 0)
    if (pct !== 0) return pct
    return (b.caidos ?? 0) - (a.caidos ?? 0)
  })
  const rows = typeof limit === 'number' ? sorted.slice(0, limit) : sorted

  return (
    <SectionCard title={title} action={action}>
      {subtitle ? <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p> : null}
      {rows.length === 0 ? (
        <EmptyState title="Sin concentraciones" description="No hay zonas con 2 o más caídas activas." />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((item) => (
            <ZoneCard key={`${item.provincia}-${item.distrito}-${item.label}`} item={item} />
          ))}
        </div>
      )}
    </SectionCard>
  )
}
