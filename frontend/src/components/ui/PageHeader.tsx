import type { ReactNode } from 'react'
import { Info } from 'lucide-react'
import { Badge } from './SoftBadge'

export function PageHeader({
  icon,
  title,
  description,
  actions,
  badges,
  breadcrumb,
}: {
  icon?: ReactNode
  title: string
  description?: string
  actions?: ReactNode
  badges?: ReactNode
  breadcrumb?: ReactNode
}) {
  return (
    <header className="mb-6 flex min-w-0 flex-col gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-start lg:justify-between">
      <div className="min-w-0">
        {breadcrumb ? <div className="mb-2">{breadcrumb}</div> : null}
        <div className="flex items-start gap-3">
          {icon ? (
            <div className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 sm:h-11 sm:w-11">
              {icon}
            </div>
          ) : null}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">{title}</h1>
              {badges}
            </div>
            {description ? <p className="mt-1 max-w-2xl text-sm font-medium text-slate-500">{description}</p> : null}
          </div>
        </div>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  )
}

export function MasterSourceBadge() {
  return (
    <span title="Estos datos solo se modifican mediante CRUD o importación; PRTG y Cloudnet no los sobrescriben.">
      <Badge tone="neutral">
        <Info className="h-3 w-3" aria-hidden />
        Fuente maestra
      </Badge>
    </span>
  )
}
