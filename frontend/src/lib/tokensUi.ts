/** Copper Operations — estados discretos, sin pastillas saturadas. */

const quiet = {
  success:
    'bg-transparent text-[#3e6b52] dark:text-[#779b83]',
  warning:
    'bg-transparent text-[#8a6a32] dark:text-[#d5a253]',
  danger:
    'bg-transparent text-[#a84e47] dark:text-[#c7655d]',
  info:
    'bg-transparent text-[#5c6b73] dark:text-[#84949d]',
  neutral:
    'bg-transparent text-[#6e777c] dark:text-[#a2a5a2]',
} as const

export const statusTone = {
  success: { badge: quiet.success, iconBg: 'bg-noc-raised text-noc-success', soft: 'bg-noc-raised' },
  warning: { badge: quiet.warning, iconBg: 'bg-noc-raised text-noc-warning', soft: 'bg-noc-raised' },
  danger: { badge: quiet.danger, iconBg: 'bg-noc-raised text-noc-danger', soft: 'bg-noc-raised' },
  info: { badge: quiet.info, iconBg: 'bg-noc-raised text-noc-info', soft: 'bg-noc-raised' },
  cyan: { badge: quiet.info, iconBg: 'bg-noc-raised text-noc-info', soft: 'bg-noc-raised' },
  indigo: { badge: quiet.neutral, iconBg: 'bg-noc-raised text-noc-faint', soft: 'bg-noc-raised' },
  neutral: { badge: quiet.neutral, iconBg: 'bg-noc-raised text-noc-faint', soft: 'bg-noc-surface-2' },
} as const

export type StatusTone = keyof typeof statusTone

export const techBadgeClass = (tech?: string | null): string => {
  const t = (tech ?? '').toUpperCase()
  if (t.includes('GPON')) return quiet.info
  if (t.includes('P2P') || t.includes('PTP')) return 'bg-transparent text-noc-copper-2'
  return quiet.neutral
}

export const inputClassName =
  'h-9 w-full min-w-0 rounded-md border border-noc-border bg-noc-nav px-3 text-[13px] text-noc-text outline-none transition placeholder:text-noc-disabled focus:border-noc-copper focus:ring-2 focus:ring-noc-copper/20 disabled:cursor-not-allowed disabled:text-noc-disabled'

export const labelClassName =
  'mb-1.5 block text-[11px] font-medium tracking-[0.08em] text-noc-faint uppercase'
