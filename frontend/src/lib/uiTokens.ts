/** Shared visual tokens for NOC Loreto UI */
export const statusTone = {
  success: {
    badge: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/15',
    iconBg: 'bg-emerald-50 text-emerald-600',
    soft: 'bg-emerald-50',
  },
  warning: {
    badge: 'bg-amber-50 text-amber-700 ring-1 ring-amber-500/20',
    iconBg: 'bg-amber-50 text-amber-600',
    soft: 'bg-amber-50',
  },
  danger: {
    badge: 'bg-red-50 text-red-700 ring-1 ring-red-500/15',
    iconBg: 'bg-red-50 text-red-600',
    soft: 'bg-red-50',
  },
  info: {
    badge: 'bg-blue-50 text-blue-700 ring-1 ring-blue-600/15',
    iconBg: 'bg-blue-50 text-blue-600',
    soft: 'bg-blue-50',
  },
  cyan: {
    badge: 'bg-cyan-50 text-cyan-700 ring-1 ring-cyan-600/15',
    iconBg: 'bg-cyan-50 text-cyan-600',
    soft: 'bg-cyan-50',
  },
  indigo: {
    badge: 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-600/15',
    iconBg: 'bg-indigo-50 text-indigo-600',
    soft: 'bg-indigo-50',
  },
  neutral: {
    badge: 'bg-slate-100 text-slate-600 ring-1 ring-slate-500/10',
    iconBg: 'bg-slate-100 text-slate-600',
    soft: 'bg-slate-50',
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
  'h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20'

export const labelClassName = 'mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500'
