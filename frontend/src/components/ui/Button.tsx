import type { ButtonHTMLAttributes, ReactNode } from 'react'

const variants = {
  primary: 'bg-noc-info hover:brightness-110 text-white shadow-sm',
  ghost: 'bg-white hover:bg-black/[0.03] text-noc-text border border-noc-border shadow-sm',
  danger: 'bg-noc-danger hover:brightness-110 text-white shadow-sm',
} as const

export function Button({
  children,
  variant = 'ghost',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode
  variant?: keyof typeof variants
}) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium transition disabled:opacity-50 ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}
