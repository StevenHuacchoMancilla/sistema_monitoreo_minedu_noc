import type { InputHTMLAttributes } from 'react'

export function SearchInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full min-w-0 rounded-xl border border-noc-border bg-white px-3 py-2 text-sm text-noc-text shadow-sm placeholder:text-noc-muted outline-none focus:border-noc-info ${props.className ?? ''}`}
    />
  )
}
