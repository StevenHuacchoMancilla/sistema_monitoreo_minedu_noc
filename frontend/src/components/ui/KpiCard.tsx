import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { formatDateTime } from '../../lib/datetime'

export function KpiCard({
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
  accent?: 'prtg' | 'cloudnet'
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
              ? 'text-noc-cyan'
              : 'text-slate-950 dark:text-slate-50'

  const bar =
    accent === 'prtg'
      ? 'border-t-blue-500'
      : accent === 'cloudnet'
        ? 'border-t-cyan-500'
        : 'border-t-transparent'

  return (
    <article
      className={`rounded-xl border border-slate-200 bg-white p-4 shadow-sm border-t-2 dark:border-slate-800 dark:bg-slate-900 ${bar}`}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
      <p className={`mt-2 text-3xl font-bold tabular-nums tracking-tight ${valueColor}`}>
        {typeof value === 'number' ? value.toLocaleString('es-PE') : value}
      </p>
      {hint ? <p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">{hint}</p> : null}
      {to ? (
        <Link
          to={to}
          className="mt-2 inline-block text-xs font-semibold text-noc-info hover:underline"
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
          : 'text-slate-950 dark:text-slate-50'

  return (
    <div className="flex items-start justify-between gap-3 border-b border-slate-100 py-2 last:border-0 dark:border-slate-800">
      <span className="shrink-0 text-sm font-medium text-slate-700 dark:text-slate-300">{label}</span>
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
            ? 'bg-noc-cyan'
            : 'bg-noc-info'

  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
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
  let className = 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'

  if (normalized === 'SUCCESS') {
    label = 'Sincronizado'
    className = 'bg-green-50 text-noc-success dark:bg-emerald-950/50'
  } else if (normalized.includes('WARN')) {
    const n = warningCount && warningCount > 0 ? ` (${warningCount})` : ''
    label = `Datos OK · advertencias de calidad${n}`
    className = 'bg-amber-50 text-noc-warning dark:bg-amber-950/50'
  } else if (normalized.includes('FAIL') || normalized.includes('ERROR')) {
    label = 'Error de sincronización'
    className = 'bg-red-50 text-noc-danger dark:bg-red-950/50'
  }

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${className}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {label}
    </span>
  )
}

export function HealthDot({ online, label }: { online: boolean; label: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{label}</span>
      <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${online ? 'text-noc-success' : 'text-noc-danger'}`}>
        <span className={`h-2 w-2 rounded-full ${online ? 'bg-noc-success' : 'bg-noc-danger'}`} />
        {online ? 'En línea' : 'Fuera de línea'}
      </span>
    </div>
  )
}

export function SourceSwitcher({ active }: { active: 'prtg' | 'cloudnet' }) {
  return (
    <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs font-semibold dark:border-slate-700 dark:bg-slate-900">
      <Link
        to="/dashboard/prtg"
        className={`rounded-md px-3 py-1.5 transition ${
          active === 'prtg'
            ? 'bg-blue-600 text-white shadow-sm'
            : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-50'
        }`}
      >
        PRTG
      </Link>
      <Link
        to="/dashboard/cloudnet"
        className={`rounded-md px-3 py-1.5 transition ${
          active === 'cloudnet'
            ? 'bg-cyan-600 text-white shadow-sm'
            : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-50'
        }`}
      >
        Cloudnet
      </Link>
    </div>
  )
}

export function SectionSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="animate-pulse space-y-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="h-4 w-40 rounded bg-slate-200 dark:bg-slate-700" />
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-3 w-full rounded bg-slate-100 dark:bg-slate-800" />
      ))}
    </div>
  )
}

export function DashboardHeader({
  title,
  subtitle,
  accent,
  lastSync,
  status,
  warningCount,
  children,
}: {
  title: string
  subtitle: string
  accent: 'prtg' | 'cloudnet'
  lastSync?: string | null
  status?: string | null
  warningCount?: number | null
  children?: ReactNode
}) {
  const line = accent === 'prtg' ? 'bg-blue-500' : 'bg-cyan-500'

  return (
    <div className="mb-6 border-b border-slate-200 pb-5 dark:border-slate-800">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-3">
            <SourceSwitcher active={accent} />
            <SyncStatusBadge status={status} warningCount={warningCount} />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-950 dark:text-slate-50">{title}</h1>
          <p className="mt-1 text-sm font-medium text-slate-500 dark:text-slate-400">{subtitle}</p>
          <div className={`mt-3 h-1 w-28 rounded-full ${line}`} />
          {lastSync ? (
            <p className="mt-3 text-xs font-medium text-slate-500 dark:text-slate-400">
              Última sincronización: {formatDateTime(lastSync)}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">{children}</div>
      </div>
    </div>
  )
}
