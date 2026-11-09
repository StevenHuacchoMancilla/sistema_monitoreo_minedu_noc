import type { ReactNode } from 'react'
import { statusTone, type StatusTone } from '../../lib/uiTokens'

export function MetricCard({
  icon,
  label,
  value,
  description,
  tone = 'neutral',
}: {
  icon: ReactNode
  label: string
  value: number | string
  description?: string
  tone?: StatusTone
}) {
  return (
    <article className="min-w-0 rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition-shadow duration-150 hover:shadow-md sm:p-4 dark:border-slate-800 dark:bg-slate-900 dark:hover:shadow-none">
      <div className="flex min-w-0 items-start gap-2.5 sm:gap-3">
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg ${statusTone[tone].iconBg}`}
          aria-hidden
        >
          <span className="pointer-events-none inline-flex h-4 w-4 shrink-0 items-center justify-center [&>svg]:!h-4 [&>svg]:!w-4 [&>svg]:!max-h-4 [&>svg]:!max-w-4 [&>svg]:shrink-0">
            {icon}
          </span>
        </div>
        <div className="min-w-0 flex-1 overflow-hidden">
          <p className="truncate text-[10px] font-semibold tracking-wide text-slate-500 uppercase sm:text-[11px] dark:text-slate-400">
            {label}
          </p>
          <p className="mt-0.5 truncate text-lg font-bold tracking-tight text-slate-950 tabular-nums sm:text-xl dark:text-slate-50">
            {typeof value === 'number' ? value.toLocaleString('es-PE') : value}
          </p>
          {description ? (
            <p className="mt-0.5 truncate text-[11px] font-medium text-slate-500 sm:text-xs dark:text-slate-400">
              {description}
            </p>
          ) : null}
        </div>
      </div>
    </article>
  )
}
