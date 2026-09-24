import { useState } from 'react'
import { Check, Copy } from 'lucide-react'

/** Ticket largo truncado + copiar (tooltip = código completo). */
export function TicketCell({ ticket }: { ticket: string | null | undefined }) {
  const [copied, setCopied] = useState(false)
  const value = ticket?.trim() || ''

  if (!value) {
    return <span className="text-slate-400">—</span>
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      // ignore
    }
  }

  return (
    <div className="flex min-w-0 max-w-[11rem] items-center gap-1">
      <span className="min-w-0 truncate font-mono text-xs text-slate-800 dark:text-slate-200" title={value}>
        {value}
      </span>
      <button
        type="button"
        onClick={() => void copy()}
        title={copied ? 'Ticket copiado' : 'Copiar ticket'}
        aria-label={copied ? 'Ticket copiado' : 'Copiar ticket'}
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </div>
  )
}
