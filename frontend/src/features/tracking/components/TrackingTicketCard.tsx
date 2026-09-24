import { useState } from 'react'
import { Check, Copy, Ticket } from 'lucide-react'
import { IconButton } from '../../../components/ui/IconButton'
import type { TrackingDetail } from '../types/tracking'

export function TrackingTicketCard({ tracking }: { tracking: TrackingDetail }) {
  const [copied, setCopied] = useState(false)
  const reportTicket = tracking.report_ticket || tracking.ticket
  const caseCode = tracking.case_code

  const copy = async () => {
    if (!reportTicket) return
    try {
      await navigator.clipboard.writeText(reportTicket)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // ignore
    }
  }

  return (
    <section className="mb-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">
            <Ticket className="h-3.5 w-3.5" aria-hidden />
            Ticket del caso
          </p>
          <p
            className="mt-1 break-all font-mono text-sm font-semibold text-slate-950 dark:text-slate-50"
            title={reportTicket || undefined}
          >
            {reportTicket || '—'}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Identificador único generado automáticamente. No editable.
          </p>
          {caseCode ? (
            <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">
              <span className="font-semibold text-slate-700 dark:text-slate-200">Case code (inmutable):</span>{' '}
              <span className="break-all font-mono">{caseCode}</span>
            </p>
          ) : null}
          {tracking.public_id ? (
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              <span className="font-semibold">public_id:</span>{' '}
              <span className="font-mono">{tracking.public_id}</span>
            </p>
          ) : null}
        </div>
        {reportTicket ? (
          <IconButton
            label={copied ? 'Ticket copiado' : 'Copiar ticket'}
            onClick={() => void copy()}
            className={copied ? 'border-emerald-300 text-emerald-700 dark:border-emerald-700 dark:text-emerald-300' : undefined}
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          </IconButton>
        ) : null}
      </div>
      {copied ? (
        <p className="mt-2 text-xs font-medium text-emerald-700 dark:text-emerald-300">Ticket copiado.</p>
      ) : null}

      <dl className="mt-4 grid gap-2 border-t border-slate-100 pt-3 sm:grid-cols-2 dark:border-slate-800">
        <div>
          <dt className="text-[10px] font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">
            Aperturado por
          </dt>
          <dd className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {tracking.opened_by_name || '—'}
          </dd>
          <dd className="text-xs text-slate-500 dark:text-slate-400">{tracking.opened_at_display || '—'}</dd>
        </div>
        <div>
          <dt className="text-[10px] font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">
            Cerrado por
          </dt>
          <dd className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {tracking.closed_by_name || '—'}
          </dd>
          <dd className="text-xs text-slate-500 dark:text-slate-400">
            {tracking.closed_at_display || 'Pendiente de cierre formal'}
          </dd>
        </div>
      </dl>
    </section>
  )
}
