import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react'

export function BotonIcono({
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
      className={`inline-flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md text-noc-muted transition hover:bg-noc-interactive hover:text-noc-text disabled:opacity-45 [&>svg]:!h-4 [&>svg]:!w-4 [&>svg]:shrink-0 ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}
