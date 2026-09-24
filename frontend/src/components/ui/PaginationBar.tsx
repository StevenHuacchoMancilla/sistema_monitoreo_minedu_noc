import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from './Button'
import { Select } from './FormControls'

export function PaginationBar({
  page,
  lastPage,
  total,
  perPage,
  onPageChange,
  onPerPageChange,
  pageSizeOptions = [25, 50, 100],
}: {
  page: number
  lastPage: number
  total: number
  perPage: number
  onPageChange: (page: number) => void
  onPerPageChange?: (perPage: number) => void
  pageSizeOptions?: number[]
}) {
  const from = total === 0 ? 0 : (page - 1) * perPage + 1
  const to = Math.min(page * perPage, total)

  return (
    <div className="flex flex-col gap-3 border-t border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800">
      <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
        Mostrando <span className="tabular-nums text-slate-800 dark:text-slate-200">{from}-{to}</span> de{' '}
        <span className="tabular-nums text-slate-800 dark:text-slate-200">{total.toLocaleString('es-PE')}</span>
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {onPerPageChange ? (
          <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
            Por página
            <Select
              className="h-8 w-[4.5rem] py-0"
              value={String(perPage)}
              onChange={(e) => onPerPageChange(Number(e.target.value))}
            >
              {pageSizeOptions.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>
          </label>
        ) : null}
        <Button type="button" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          <ChevronLeft className="h-4 w-4" aria-hidden />
          Anterior
        </Button>
        <span className="min-w-[4.5rem] text-center text-sm font-semibold tabular-nums text-slate-700 dark:text-slate-300">
          {page} / {Math.max(1, lastPage)}
        </span>
        <Button type="button" size="sm" disabled={page >= lastPage} onClick={() => onPageChange(page + 1)}>
          Siguiente
          <ChevronRight className="h-4 w-4" aria-hidden />
        </Button>
      </div>
    </div>
  )
}
