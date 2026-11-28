import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react'
import { Loader2 } from 'lucide-react'

const variants = {
  primary:
    'bg-noc-copper-deep text-white hover:bg-noc-copper',
  secondary:
    'border border-noc-border bg-transparent text-noc-text hover:bg-noc-interactive',
  ghost:
    'text-noc-muted hover:bg-noc-interactive hover:text-noc-text',
  danger: 'bg-[#D64545] text-white hover:bg-[#E25555]',
} as const

const sizes = {
  sm: 'h-8 gap-1.5 rounded-lg px-2.5 text-xs',
  md: 'h-9 gap-2 rounded-lg px-3.5 text-[13px]',
  lg: 'h-10 gap-2 rounded-lg px-4 text-sm',
} as const

export function Boton({
  children,
  variant = 'secondary',
  size = 'md',
  loading = false,
  className = '',
  disabled,
  ref,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode
  variant?: keyof typeof variants
  size?: keyof typeof sizes
  loading?: boolean
  ref?: Ref<HTMLButtonElement>
}) {
  return (
    <button
      ref={ref}
      className={`inline-flex items-center justify-center font-medium tracking-tight transition duration-150 disabled:pointer-events-none disabled:opacity-45 ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
      {children}
    </button>
  )
}
