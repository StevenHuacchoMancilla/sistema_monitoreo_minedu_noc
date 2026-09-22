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
    <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow duration-150 hover:shadow-md">
      <div className="flex items-start gap-3">
        <div className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${statusTone[tone].iconBg}`}>
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
          <p className="mt-1 text-2xl font-bold tracking-tight text-slate-950 tabular-nums">
            {typeof value === 'number' ? value.toLocaleString('es-PE') : value}
          </p>
          {description ? <p className="mt-0.5 text-xs font-medium text-slate-500">{description}</p> : null}
        </div>
      </div>
    </article>
  )
}
