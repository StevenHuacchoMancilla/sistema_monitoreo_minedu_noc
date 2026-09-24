import { CalendarDays } from 'lucide-react'
import { limaDateKey, shiftDateKey, todayLimaKey } from '../../lib/datetime'
import { FormField } from './FormControls'

const dateInputClass =
  'h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100'

export function DateRangeFields({
  title,
  from,
  to,
  onFromChange,
  onToChange,
  error,
}: {
  title: string
  from: string
  to: string
  onFromChange: (value: string) => void
  onToChange: (value: string) => void
  error?: string | null
}) {
  return (
    <div className="col-span-full rounded-lg border border-slate-100 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-900/40 sm:col-span-2 xl:col-span-3">
      <p className="mb-2 inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
        <CalendarDays className="h-3.5 w-3.5" aria-hidden />
        {title}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="Desde">
          <input
            type="date"
            value={from}
            onChange={(e) => onFromChange(e.target.value)}
            className={dateInputClass}
          />
        </FormField>
        <FormField label="Hasta">
          <input type="date" value={to} onChange={(e) => onToChange(e.target.value)} className={dateInputClass} />
        </FormField>
      </div>
      {error ? <p className="mt-2 text-xs font-medium text-red-600">{error}</p> : null}
    </div>
  )
}

/** YYYY-MM-DD en calendario America/Lima, independiente de la zona del navegador. */
export function toYmd(d: Date): string {
  return limaDateKey(d) ?? todayLimaKey()
}

export function quickApertureRange(kind: 'today' | 'yesterday' | 'last7' | 'month'): {
  from: string
  to: string
} {
  const today = todayLimaKey()

  if (kind === 'today') return { from: today, to: today }
  if (kind === 'yesterday') {
    const y = shiftDateKey(today, -1)
    return { from: y, to: y }
  }
  if (kind === 'last7') return { from: shiftDateKey(today, -6), to: today }
  return { from: `${today.slice(0, 8)}01`, to: today }
}
