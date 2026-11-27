import type { ReactNode } from 'react'
import type { StatusTone } from '../../lib/tokensUi'

const valueTone: Record<StatusTone, string> = {
  success: 'text-noc-success',
  warning: 'text-noc-warning',
  danger: 'text-noc-danger',
  info: 'text-noc-text',
  cyan: 'text-noc-text',
  indigo: 'text-noc-text',
  neutral: 'text-noc-text',
}

export function TarjetaMetrica({
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
    <article className="min-w-0 px-3 py-3 sm:px-4">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <p className="truncate text-[11px] font-medium tracking-[0.08em] text-noc-faint uppercase">{label}</p>
        <span className="text-noc-copper-2 [&>svg]:h-3.5 [&>svg]:w-3.5" aria-hidden>
          {icon}
        </span>
      </div>
      <p className={`mt-1 truncate text-2xl font-semibold tracking-tight tabular-nums ${valueTone[tone]}`}>
        {typeof value === 'number' ? value.toLocaleString('es-PE') : value}
      </p>
      {description ? <p className="mt-0.5 truncate text-[12px] text-noc-faint">{description}</p> : null}
    </article>
  )
}
