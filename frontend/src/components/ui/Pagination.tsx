export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
}: {
  page: number
  pageSize: number
  total: number
  onPageChange: (page: number) => void
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  return (
    <div className="mt-3 flex items-center justify-between gap-3 text-sm text-noc-muted">
      <span>
        {total} registros · página {page} / {pages}
      </span>
      <div className="flex gap-2">
        <button
          type="button"
          className="rounded-lg border border-noc-border px-3 py-1 disabled:opacity-40"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          Anterior
        </button>
        <button
          type="button"
          className="rounded-lg border border-noc-border px-3 py-1 disabled:opacity-40"
          disabled={page >= pages}
          onClick={() => onPageChange(page + 1)}
        >
          Siguiente
        </button>
      </div>
    </div>
  )
}
