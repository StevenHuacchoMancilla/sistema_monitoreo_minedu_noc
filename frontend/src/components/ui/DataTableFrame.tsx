import type { ReactNode } from 'react'
import { formatDate, formatDateTime, formatTime } from '../../lib/datetime'

/**
 * Contenedor de tabla: card + overflow local (nunca scroll horizontal global).
 * Requiere ancestros con min-w-0 (AppLayout ya lo tiene).
 */
export function DataTableContainer({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={`min-w-0 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 ${className}`}
    >
      <div className="w-full max-w-full overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch]">
        {children}
      </div>
    </div>
  )
}

/** Alias retrocompatible. */
export function DataTableFrame(props: { children: ReactNode; className?: string }) {
  return <DataTableContainer {...props} />
}

export const tableClassName =
  'w-full min-w-0 border-collapse text-left text-[13px] text-slate-800 dark:text-slate-200'

export const theadClassName =
  'sticky top-0 z-10 border-b border-slate-200 bg-slate-50/95 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90'

export const thClassName =
  'px-2.5 py-2 text-left text-[10.5px] font-semibold tracking-wide whitespace-nowrap text-slate-500 uppercase dark:text-slate-400'

export const tdClassName = 'px-2.5 py-2 align-middle text-[13px] leading-snug text-slate-700 dark:text-slate-300'

export const trClassName =
  'border-b border-slate-100 bg-white last:border-0 hover:bg-slate-50/80 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800/60'

export function Truncate({
  children,
  title,
  className = '',
  lines = 1,
}: {
  children: ReactNode
  title?: string | null
  className?: string
  lines?: 1 | 2
}) {
  const clamp = lines === 2 ? 'line-clamp-2' : 'truncate'
  return (
    <span className={`block min-w-0 ${clamp} ${className}`} title={title ?? undefined}>
      {children}
    </span>
  )
}

/** Fecha + hora en dos líneas cuando ahorra ancho. */
export function DateTimeCell({ value }: { value: string | null | undefined }) {
  if (!value) {
    return <span className="text-slate-400">—</span>
  }
  const parts = value.trim().split(/\s+/)
  if (parts.length >= 2) {
    return (
      <span className="block leading-tight">
        <span className="block tabular-nums text-slate-800 dark:text-slate-200">{parts[0]}</span>
        <span className="block text-xs tabular-nums text-slate-500">{parts.slice(1).join(' ')}</span>
      </span>
    )
  }
  return <span className="tabular-nums">{value}</span>
}

/** ISO → fecha arriba, hora AM/PM abajo (zona Lima). */
export function IsoDateTimeCell({
  value,
  hint,
  dateClassName = 'text-slate-800 dark:text-slate-200',
}: {
  value: string | null | undefined
  hint?: ReactNode
  dateClassName?: string
}) {
  if (!value) {
    return <span className="text-slate-400">—</span>
  }
  return (
    <span className="block whitespace-nowrap leading-tight" title={formatDateTime(value)}>
      <span className={`block tabular-nums ${dateClassName}`}>{formatDate(value)}</span>
      <span className="block text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
        {formatTime(value)}
        {hint ? <span className="ml-1">{hint}</span> : null}
      </span>
    </span>
  )
}

/** Nombre corto + tooltip con completo. */
export function ShortName({ name }: { name: string | null | undefined }) {
  if (!name) return <span className="text-slate-400">—</span>
  const short = name.trim().split(/\s+/)[0] || name
  return (
    <span className="block max-w-[6.5rem] truncate" title={name}>
      {short}
    </span>
  )
}
