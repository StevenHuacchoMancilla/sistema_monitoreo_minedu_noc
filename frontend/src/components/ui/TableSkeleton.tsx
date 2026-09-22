export function TableSkeleton({ rows = 8, cols = 8 }: { rows?: number; cols?: number }) {
  return (
    <div className="animate-pulse overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="border-b border-slate-100 bg-slate-50 px-4 py-3">
        <div className="h-4 w-48 rounded bg-slate-200" />
      </div>
      <div className="space-y-0">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex gap-3 border-b border-slate-50 px-4 py-4">
            {Array.from({ length: cols }).map((__, c) => (
              <div key={c} className="h-3 flex-1 rounded bg-slate-100" />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
