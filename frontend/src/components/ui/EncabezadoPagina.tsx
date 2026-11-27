import type { ReactNode } from 'react'
import { Info } from 'lucide-react'
import { Insignia } from './InsigniaSuave'

export function EncabezadoPagina({
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
    <header className="mb-4 flex min-w-0 flex-col gap-3 border-b border-noc-line pb-4 lg:flex-row lg:items-start lg:justify-between">
      <div className="min-w-0">
        {breadcrumb ? <div className="mb-2">{breadcrumb}</div> : null}
        <div className="flex items-start gap-3">
          {icon ? (
            <div className="inline-flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-noc-raised text-noc-faint">
              <span className="pointer-events-none inline-flex h-5 w-5 shrink-0 items-center justify-center [&>svg]:!h-5 [&>svg]:!w-5 [&>svg]:!max-h-5 [&>svg]:!max-w-5">
                {icon}
              </span>
            </div>
          ) : null}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight text-noc-text">
                {title}
              </h1>
              {badges}
            </div>
            {description ? (
              <p className="mt-0.5 max-w-2xl text-[13px] leading-relaxed text-noc-muted">{description}</p>
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
      <Insignia tone="neutral">
        <Info className="h-3 w-3" aria-hidden />
        Fuente maestra
      </Insignia>
    </span>
  )
}
