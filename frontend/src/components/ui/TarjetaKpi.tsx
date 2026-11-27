import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { formatDateTime } from '../../lib/fechaHora'

export function TarjetaKpi({
  label,
  value,
  hint,
  tone = 'default',
  to,
  linkLabel,
  accent,
}: {
  label: string
  value: number | string
  hint?: string
  tone?: 'default' | 'ok' | 'danger' | 'warn' | 'info' | 'cyan'
  to?: string
  linkLabel?: string
  accent?: 'prtg'
}) {
  const valueColor =
    tone === 'ok'
      ? 'text-noc-success'
      : tone === 'danger'
        ? 'text-noc-danger'
        : tone === 'warn'
          ? 'text-noc-warning'
          : tone === 'info'
            ? 'text-noc-info'
            : tone === 'cyan'
              ? 'text-noc-info'
              : 'text-noc-text'

  void accent

  return (
    <article className="noc-card p-3.5">
      <p className="text-[11px] font-medium tracking-[0.08em] text-noc-faint uppercase">{label}</p>
      <p className={`mt-1.5 text-[28px] font-semibold tabular-nums tracking-tight ${valueColor}`}>
        {typeof value === 'number' ? value.toLocaleString('es-PE') : value}
      </p>
      {hint ? <p className="mt-1 text-[12px] text-noc-faint">{hint}</p> : null}
      {to ? (
        <Link
          to={to}
          className="mt-2 inline-block text-[12px] font-medium text-noc-copper hover:text-noc-copper-2"
        >
          {linkLabel ?? 'Ver detalle →'}
        </Link>
      ) : null}
    </article>
  )
}

export function MetricRow({
  label,
  value,
  tone = 'default',
}: {
  label: string
  value: number | string
  tone?: 'default' | 'ok' | 'danger' | 'warn'
}) {
  const color =
    tone === 'ok'
      ? 'text-noc-success'
      : tone === 'danger'
        ? 'text-noc-danger'
        : tone === 'warn'
          ? 'text-noc-warning'
          : 'text-noc-text'

  return (
    <div className="flex items-start justify-between gap-3 border-b border-noc-line py-2 last:border-0">
      <span className="shrink-0 text-[13px] text-noc-muted">{label}</span>
      <span
        className={`max-w-[65%] text-right text-sm font-bold tabular-nums ${color} ${typeof value === 'string' ? 'break-words leading-snug' : ''}`}
        title={typeof value === 'string' ? value : undefined}
      >
        {typeof value === 'number' ? value.toLocaleString('es-PE') : value}
      </span>
    </div>
  )
}

export function ProgressBar({
  value,
  max,
  tone = 'info',
}: {
  value: number
  max: number
  tone?: 'ok' | 'danger' | 'warn' | 'info' | 'cyan'
}) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 1000) / 10) : 0
  const bar =
    tone === 'ok'
      ? 'bg-noc-success'
      : tone === 'danger'
        ? 'bg-noc-danger'
        : tone === 'warn'
          ? 'bg-noc-warning'
          : tone === 'cyan'
            ? 'bg-noc-info'
            : 'bg-noc-copper'

  return (
    <div className="h-1 w-full overflow-hidden rounded-sm bg-noc-interactive">
      <div className={`h-full rounded-full ${bar}`} style={{ width: `${pct}%` }} />
    </div>
  )
}

export function SyncStatusBadge({
  status,
  warningCount,
}: {
  status?: string | null
  warningCount?: number | null
}) {
  const normalized = (status ?? '').toUpperCase()
  let label = 'Sin sincronización'
  let className = 'text-noc-faint'

  if (normalized === 'SUCCESS') {
    label = 'Sincronizado'
    className = 'text-noc-success'
  } else if (normalized === 'IN_PROGRESS') {
    label = 'Sincronizando…'
    className = 'text-noc-copper'
  } else if (normalized.includes('WARN')) {
    const n = warningCount && warningCount > 0 ? ` (${warningCount})` : ''
    label = `Datos OK · advertencias de calidad${n}`
    className = 'text-noc-warning'
  } else if (normalized.includes('FAIL') || normalized.includes('ERROR')) {
    label = 'Error de sincronización'
    className = 'text-noc-danger'
  }

  return (
    <span className={`inline-flex items-center gap-1.5 text-[12px] font-medium ${className}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {label}
    </span>
  )
}

export function HealthDot({ online, label }: { online: boolean; label: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-[13px] text-noc-muted">{label}</span>
      <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${online ? 'text-noc-success' : 'text-noc-danger'}`}>
        <span className={`h-2 w-2 rounded-full ${online ? 'bg-noc-success' : 'bg-noc-danger'}`} />
        {online ? 'En línea' : 'Fuera de línea'}
      </span>
    </div>
  )
}

export function SectionSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="animate-pulse space-y-3 rounded-md border border-noc-border bg-noc-surface p-4">
      <div className="h-4 w-40 rounded-sm bg-noc-interactive" />
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-3 w-full rounded-sm bg-noc-raised" />
      ))}
    </div>
  )
}

export function DashboardHeader({
  title,
  subtitle,
  accent = 'prtg',
  lastSync,
  status,
  warningCount,
  children,
}: {
  title: string
  subtitle: string
  accent?: 'prtg'
  lastSync?: string | null
  status?: string | null
  warningCount?: number | null
  children?: ReactNode
}) {
  return (
    <div className="mb-5 border-b border-noc-line pb-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-3">
            <SyncStatusBadge status={status} warningCount={warningCount} />
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-noc-text">{title}</h1>
          <p className="mt-1 max-w-xl text-[13px] text-noc-muted">{subtitle}</p>
          <div className={`mt-3 h-px w-16 ${accent === 'prtg' ? 'bg-noc-copper' : 'bg-noc-border'}`} />
          {lastSync ? (
            <p className="mt-2 font-mono text-[11px] text-noc-faint tabular-nums">
              Última sincronización {formatDateTime(lastSync)}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">{children}</div>
      </div>
    </div>
  )
}
