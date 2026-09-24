/** Shared visual tokens for NOC Loreto UI */
export const statusTone = {
  success: {
    badge:
      'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/15 dark:bg-emerald-950/50 dark:text-emerald-300 dark:ring-emerald-500/25',
    iconBg: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-300',
    soft: 'bg-emerald-50 dark:bg-emerald-950/40',
  },
  warning: {
    badge:
      'bg-amber-50 text-amber-700 ring-1 ring-amber-500/20 dark:bg-amber-950/50 dark:text-amber-300 dark:ring-amber-500/25',
    iconBg: 'bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-300',
    soft: 'bg-amber-50 dark:bg-amber-950/40',
  },
  danger: {
    badge:
      'bg-red-50 text-red-700 ring-1 ring-red-500/15 dark:bg-red-950/50 dark:text-red-300 dark:ring-red-500/25',
    iconBg: 'bg-red-50 text-red-600 dark:bg-red-950/60 dark:text-red-300',
    soft: 'bg-red-50 dark:bg-red-950/40',
  },
  info: {
    badge:
      'bg-blue-50 text-blue-700 ring-1 ring-blue-600/15 dark:bg-blue-950/50 dark:text-blue-300 dark:ring-blue-500/25',
    iconBg: 'bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-300',
    soft: 'bg-blue-50 dark:bg-blue-950/40',
  },
  cyan: {
    badge:
      'bg-cyan-50 text-cyan-700 ring-1 ring-cyan-600/15 dark:bg-cyan-950/50 dark:text-cyan-300 dark:ring-cyan-500/25',
    iconBg: 'bg-cyan-50 text-cyan-600 dark:bg-cyan-950/60 dark:text-cyan-300',
    soft: 'bg-cyan-50 dark:bg-cyan-950/40',
  },
  indigo: {
    badge:
      'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-600/15 dark:bg-indigo-950/50 dark:text-indigo-300 dark:ring-indigo-500/25',
    iconBg: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-300',
    soft: 'bg-indigo-50 dark:bg-indigo-950/40',
  },
  neutral: {
    badge:
      'bg-slate-100 text-slate-600 ring-1 ring-slate-500/10 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-500/20',
    iconBg: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
    soft: 'bg-slate-50 dark:bg-slate-800/60',
  },
} as const

export type StatusTone = keyof typeof statusTone

export const techBadgeClass = (tech?: string | null): string => {
  const t = (tech ?? '').toUpperCase()
  if (t.includes('GPON')) return statusTone.cyan.badge
  if (t.includes('P2P') || t.includes('PTP')) return statusTone.indigo.badge
  return statusTone.neutral.badge
}

export const inputClassName =
  'h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-[13px] text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-blue-400 dark:focus:ring-blue-400/20'

export const labelClassName =
  'mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400'
