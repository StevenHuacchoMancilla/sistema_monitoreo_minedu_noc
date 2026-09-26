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
    <header className="mb-5 flex min-w-0 flex-col gap-3 border-b border-slate-200 pb-4 lg:flex-row lg:items-start lg:justify-between dark:border-slate-800">
      <div className="min-w-0">
        {breadcrumb ? <div className="mb-2">{breadcrumb}</div> : null}
        <div className="flex items-start gap-3">
          {icon ? (
            <div className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 sm:h-10 sm:w-10 dark:bg-blue-950/50 dark:text-blue-300">
              {icon}
            </div>
          ) : null}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-slate-950 sm:text-2xl dark:text-slate-50">
                {title}
              </h1>
              {badges}
            </div>
            {description ? (
              <p className="mt-0.5 max-w-2xl text-[13px] font-medium text-slate-500 dark:text-slate-400">{description}</p>
            ) : null}
          </div>
        </div>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  )
}

export function MasterSourceBadge() {
  return (
    <span title="Estos datos solo se modifican mediante CRUD o importación; PRTG no los sobrescribe.">
      <Badge tone="neutral">
        <Info className="h-3 w-3" aria-hidden />
        Fuente maestra
      </Badge>
    </span>
  )
}
