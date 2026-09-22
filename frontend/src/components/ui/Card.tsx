import type { ReactNode } from 'react'

export function Card({
  children,
  className = '',
  tone = 'default',
}: {
  children: ReactNode
  className?: string
  tone?: 'default' | 'ok' | 'danger' | 'warn' | 'info' | 'cyan'
}) {
  const tones = {
    default: 'border-slate-200',
    ok: 'border-noc-success/30',
    danger: 'border-noc-danger/30',
    warn: 'border-noc-warning/30',
    info: 'border-noc-info/30',
    cyan: 'border-noc-cyan/30',
  } as const

  return (
    <div className={`rounded-xl border bg-white p-4 shadow-sm md:p-5 ${tones[tone]} ${className}`}>
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
  accent?: 'prtg' | 'cloudnet'
}) {
  const bar = accent === 'prtg' ? 'border-l-blue-500' : accent === 'cloudnet' ? 'border-l-cyan-500' : 'border-l-slate-200'

  return (
    <section className={`min-w-0 rounded-xl border border-slate-200 border-l-4 bg-white p-4 shadow-sm md:p-5 ${bar}`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight text-slate-950">{title}</h2>
        {action}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  )
}
