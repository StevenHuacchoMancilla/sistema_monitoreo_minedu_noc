import type { ReactNode } from 'react'
import { ListFilter } from 'lucide-react'

export function TarjetaFiltro({
  title = 'Filtros',
  children,
  actions,
}: {
  title?: string
  children: ReactNode
  actions?: ReactNode
}) {
  return (
    <section className="noc-card min-w-0 rounded-xl border border-noc-border px-3 py-3 sm:px-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex items-center gap-2 text-[13px] font-medium text-noc-text">
          <ListFilter className="h-3.5 w-3.5 text-noc-faint" aria-hidden />
          {title}
        </div>
        {actions}
      </div>
      <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6">
        {children}
      </div>
    </section>
  )
}
