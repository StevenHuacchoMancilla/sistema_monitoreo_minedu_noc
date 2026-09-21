import type { ReactNode } from 'react'

export function Card({
  children,
  className = '',
  tone = 'default',
}: {
  children: ReactNode
  className?: string
  tone?: 'default' | 'ok' | 'danger' | 'warn' | 'info'
}) {
  const tones = {
    default: 'border-noc-border/80',
    ok: 'border-noc-success/30',
    danger: 'border-noc-danger/30',
    warn: 'border-noc-warning/30',
    info: 'border-noc-info/30',
  } as const

  return (
    <div
      className={`rounded-2xl border bg-noc-surface p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.04)] ${tones[tone]} ${className}`}
    >
      {children}
    </div>
  )
}

export function SectionCard({
  title,
  children,
  action,
}: {
  title: string
  children: ReactNode
  action?: ReactNode
}) {
  return (
    <section className="rounded-2xl border border-noc-border/80 bg-noc-surface p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.04)] md:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[17px] font-semibold tracking-tight text-noc-text">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}
