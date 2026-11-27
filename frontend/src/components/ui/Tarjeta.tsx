import type { ReactNode } from 'react'

export function Tarjeta({
  children,
  className = '',
  tone = 'default',
}: {
  children: ReactNode
  className?: string
  tone?: 'default' | 'ok' | 'danger' | 'warn' | 'info' | 'cyan'
}) {
  void tone
  return (
    <div className={`noc-card rounded-xl border border-noc-border p-4 md:p-5 ${className}`}>
      {children}
    </div>
  )
}

export function SectionCard({
  title,
  children,
  action,
  accent,
}: {
  title: string
  children: ReactNode
  action?: ReactNode
  accent?: 'prtg'
}) {
  const bar = accent === 'prtg' ? 'before:bg-noc-copper' : 'before:bg-transparent'

  return (
    <section
      className={`noc-card relative min-w-0 overflow-hidden rounded-xl border border-noc-border p-4 before:absolute before:inset-x-0 before:top-0 before:h-px md:p-5 ${bar}`}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[15px] font-semibold tracking-tight text-noc-text">{title}</h2>
        {action}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  )
}
