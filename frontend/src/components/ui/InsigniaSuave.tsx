import type { ReactNode } from 'react'
import { statusTone, type StatusTone } from '../../lib/tokensUi'

export function Insignia({
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
      className={`inline-flex max-w-full min-w-0 items-center gap-1.5 truncate text-[12px] font-medium [&>svg]:h-3 [&>svg]:w-3 [&>svg]:shrink-0 ${statusTone[tone].badge} ${className}`}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden />
      {children}
    </span>
  )
}
