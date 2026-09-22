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
}: {
  page: number
  lastPage: number
  total: number
  perPage: number
  onPageChange: (page: number) => void
  onPerPageChange?: (perPage: number) => void
}) {
  const from = total === 0 ? 0 : (page - 1) * perPage + 1
  const to = Math.min(page * perPage, total)

  return (
    <div className="flex flex-col gap-3 border-t border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm font-medium text-slate-500">
        Mostrando <span className="tabular-nums text-slate-800">{from}-{to}</span> de{' '}
        <span className="tabular-nums text-slate-800">{total.toLocaleString('es-PE')}</span>
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {onPerPageChange ? (
          <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500">
            Por página
            <Select
              className="h-8 w-[4.5rem] py-0"
              value={String(perPage)}
              onChange={(e) => onPerPageChange(Number(e.target.value))}
            >
              <option value="25">25</option>
              <option value="50">50</option>
              <option value="100">100</option>
            </Select>
          </label>
        ) : null}
        <Button type="button" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          <ChevronLeft className="h-4 w-4" aria-hidden />
          Anterior
        </Button>
        <span className="min-w-[4.5rem] text-center text-sm font-semibold tabular-nums text-slate-700">
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
