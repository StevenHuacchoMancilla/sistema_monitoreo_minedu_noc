import type { ReactNode } from 'react'
import { statusTone, type StatusTone } from '../../lib/uiTokens'

export function Badge({
  children,
  tone = 'neutral',
  className = '',
  title,
}: {
  children: ReactNode
  tone?: StatusTone
  className?: string
  title?: string
}) {
  return (
    <span
      title={title}
      className={`inline-flex max-w-full min-w-0 items-center gap-1 truncate rounded-full px-2 py-0.5 text-[11px] font-semibold [&>svg]:h-3 [&>svg]:w-3 [&>svg]:shrink-0 ${statusTone[tone].badge} ${className}`}
    >
      {children}
    </span>
  )
}
