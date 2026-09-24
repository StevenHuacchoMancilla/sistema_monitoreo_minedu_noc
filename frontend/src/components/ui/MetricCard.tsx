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
    <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow duration-150 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:shadow-none">
      <div className="flex items-start gap-3">
        <div className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${statusTone[tone].iconBg}`}>
          {icon}
        </div>
        <div className="min-w-0">
          <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
          <p className="mt-0.5 text-xl font-bold tracking-tight text-slate-950 tabular-nums dark:text-slate-50">
            {typeof value === 'number' ? value.toLocaleString('es-PE') : value}
          </p>
          {description ? (
            <p className="mt-0.5 text-xs font-medium text-slate-500 dark:text-slate-400">{description}</p>
          ) : null}
        </div>
      </div>
    </article>
  )
}
