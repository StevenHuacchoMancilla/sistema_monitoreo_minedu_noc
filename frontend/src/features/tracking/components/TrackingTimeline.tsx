import { Trash2 } from 'lucide-react'
import type { TrackingUpdate } from '../types/tracking'
import { initials } from '../lib/format'
import { formatDateTime24 } from '../../../lib/datetime'
import { IconButton } from '../../../components/ui/IconButton'

export function TrackingTimeline({
  updates,
  canDelete = false,
  deletingId = null,
  onDelete,
}: {
  updates: TrackingUpdate[]
  canDelete?: boolean
  deletingId?: number | null
  onDelete?: (updateId: number) => void
}) {
  if (updates.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-400">
        Aún no hay seguimientos. Agrega el primero abajo.
      </p>
    )
  }

  return (
    <ol className="space-y-0">
      {updates.map((item, idx) => {
        const system = item.is_system
        const showDelete = canDelete && item.can_delete !== false && !system && onDelete
        return (
          <li key={item.id} className="relative flex gap-3 pb-6 last:pb-0">
            {idx < updates.length - 1 ? (
              <span
                className="absolute top-10 left-4 h-[calc(100%-2rem)] w-px bg-slate-200 dark:bg-slate-700"
                aria-hidden
              />
            ) : null}
            <span
              className={[
                'relative z-10 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-bold',
                system
                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
                  : 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900',
              ].join(' ')}
            >
              {system ? 'PR' : initials(item.actor_name)}
            </span>
            <div className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3.5 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <time className="text-xs font-semibold tabular-nums text-slate-500 dark:text-slate-400">
                    {item.occurred_at
                      ? formatDateTime24(item.occurred_at)
                      : item.occurred_on
                        ? item.occurred_on.slice(0, 10).split('-').reverse().join('/')
                        : '—'}
                  </time>
                  <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {system ? 'Sistema · PRTG' : item.actor_name}
                  </span>
                  {item.event_type_label && item.event_type !== 'COMMENT' ? (
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      {item.event_type_label}
                    </span>
                  ) : null}
                </div>
                {showDelete ? (
                  <IconButton
                    type="button"
                    label="Eliminar seguimiento"
                    className="!h-8 !w-8 shrink-0 text-slate-400 hover:border-red-200 hover:bg-red-50 hover:text-red-600 dark:hover:border-red-900 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                    disabled={deletingId === item.id}
                    onClick={() => {
                      if (window.confirm('¿Eliminar este seguimiento? Esta acción no se puede deshacer.')) {
                        onDelete(item.id)
                      }
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </IconButton>
                ) : null}
              </div>
              <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                {item.body}
              </p>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
