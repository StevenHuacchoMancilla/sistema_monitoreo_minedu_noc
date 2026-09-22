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
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${statusTone[tone].badge} ${className}`}
    >
      {children}
    </span>
  )
}
