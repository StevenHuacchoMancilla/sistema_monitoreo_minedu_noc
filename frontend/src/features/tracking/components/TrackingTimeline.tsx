import type { TrackingUpdate } from '../types/tracking'
import { initials } from '../lib/format'

export function TrackingTimeline({ updates }: { updates: TrackingUpdate[] }) {
  if (updates.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
        Aún no hay seguimientos. Agrega el primero abajo.
      </p>
    )
  }

  return (
    <ol className="space-y-0">
      {updates.map((item, idx) => {
        const system = item.is_system
        return (
          <li key={item.id} className="relative flex gap-3 pb-6 last:pb-0">
            {idx < updates.length - 1 ? (
              <span className="absolute top-10 left-4 h-[calc(100%-2rem)] w-px bg-slate-200" aria-hidden />
            ) : null}
            <span
              className={[
                'relative z-10 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-bold',
                system ? 'bg-blue-100 text-blue-700' : 'bg-slate-900 text-white',
              ].join(' ')}
            >
              {system ? 'PR' : initials(item.actor_name)}
            </span>
            <div className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3.5 py-3 shadow-sm">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <time className="text-xs font-semibold tabular-nums text-slate-500">
                  {item.occurred_at
                    ? new Date(item.occurred_at).toLocaleString('es-PE', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : item.occurred_on
                      ? new Date(item.occurred_on + 'T12:00:00').toLocaleDateString('es-PE')
                      : '—'}
                </time>
                <span className="text-sm font-semibold text-slate-900">
                  {system ? 'Sistema · PRTG' : item.actor_name}
                </span>
                {item.event_type_label && item.event_type !== 'COMMENT' ? (
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                    {item.event_type_label}
                  </span>
                ) : null}
              </div>
              <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{item.body}</p>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
