import type { ReactNode } from 'react'
import { ListFilter } from 'lucide-react'

export function FilterCard({
  title = 'Filtros',
  children,
  actions,
}: {
  title?: string
  children: ReactNode
  actions?: ReactNode
}) {
  return (
    <section className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
          <ListFilter className="h-4 w-4 text-slate-500" aria-hidden />
          {title}
        </div>
        {actions}
      </div>
      <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {children}
      </div>
    </section>
  )
}
