import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react'
import { Search } from 'lucide-react'
import { inputClassName, labelClassName } from '../../lib/uiTokens'

export function FormField({
  label,
  htmlFor,
  children,
  className = '',
  action,
}: {
  label: string
  htmlFor?: string
  children: ReactNode
  className?: string
  action?: ReactNode
}) {
  return (
    <label htmlFor={htmlFor} className={`block ${className}`}>
      <span className="mb-1.5 flex items-center justify-between gap-2">
        <span className={labelClassName.replace(/^mb-1\.5\s+/, '')}>{label}</span>
        {action}
      </span>
      {children}
    </label>
  )
}

export function Input({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${inputClassName} ${className}`} {...props} />
}

export function Select({ className = '', children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={`${inputClassName} ${className}`} {...props}>
      {children}
    </select>
  )
}

export function SearchField({
  label = 'Buscar',
  className = '',
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className={labelClassName}>{label}</span>
      <span className="relative block">
        <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
        <input className={`${inputClassName} pl-9`} {...props} />
      </span>
    </label>
  )
}
