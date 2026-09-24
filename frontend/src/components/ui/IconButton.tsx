import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react'

export function IconButton({
  label,
  children,
  className = '',
  ref,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string
  children: ReactNode
  ref?: Ref<HTMLButtonElement>
}) {
  return (
    <button
      ref={ref}
      type="button"
      title={label}
      aria-label={label}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-50 ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}
