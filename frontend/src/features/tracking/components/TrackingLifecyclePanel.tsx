import { useState } from 'react'
import { Lock, RotateCcw, ShieldCheck } from 'lucide-react'
import { Button } from '../../../components/ui/Button'
import type { TrackingDetail } from '../types/tracking'

export function TrackingLifecyclePanel({
  tracking,
  canWrite,
  busy,
  onClose,
  onReopen,
  onAcknowledge,
}: {
  tracking: TrackingDetail
  canWrite: boolean
  busy?: boolean
  onClose: (payload: { lock_version: number; closing_note?: string }) => Promise<void>
  onReopen: (payload: { lock_version: number; note?: string }) => Promise<void>
  onAcknowledge: (payload: { lock_version: number; note?: string }) => Promise<void>
}) {
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  if (!canWrite) {
    return null
  }

  const run = async (action: () => Promise<void>) => {
    setError(null)
    try {
      await action()
      setNote('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo completar la acción')
    }
  }

  if (tracking.can_reopen) {
    return (
      <section className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-900">
              <Lock className="h-4 w-4 text-slate-500" aria-hidden />
              Tracking cerrado
            </h3>
            <p className="mt-1 text-xs text-slate-600">
              Cerrado por {tracking.closed_by_name || '—'}
              {tracking.closed_at_display ? ` · ${tracking.closed_at_display}` : ''}
            </p>
            {tracking.closing_note ? (
              <p className="mt-1 text-sm text-slate-700">{tracking.closing_note}</p>
            ) : null}
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            loading={busy}
            onClick={() =>
              void run(() =>
                onReopen({
                  lock_version: tracking.lock_version,
                  note: note.trim() || undefined,
                }),
              )
            }
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden />
            Reabrir Tracking
          </Button>
        </div>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          disabled={busy}
          placeholder="Motivo de reapertura (opcional)"
          className="mt-3 w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20"
        />
        {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
      </section>
    )
  }

  if (!tracking.can_close) {
    return null
  }

  return (
    <section className="rounded-xl border border-violet-200 bg-violet-50/40 p-4">
      <h3 className="text-sm font-semibold text-violet-950">Cierre operativo</h3>
      <p className="mt-1 text-xs text-violet-900/80">
        El cierre es humano y queda auditado. PRTG no cierra el Tracking automáticamente.
      </p>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        disabled={busy}
        placeholder="Nota de cierre (opcional)"
        className="mt-3 w-full resize-y rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20"
      />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {tracking.can_acknowledge_recovery ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            loading={busy}
            onClick={() =>
              void run(() =>
                onAcknowledge({
                  lock_version: tracking.lock_version,
                  note: note.trim() || undefined,
                }),
              )
            }
          >
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
            Confirmar recuperación PRTG
          </Button>
        ) : null}
        <Button
          type="button"
          variant="primary"
          size="sm"
          loading={busy}
          className="bg-violet-600 hover:bg-violet-700"
          onClick={() =>
            void run(() =>
              onClose({
                lock_version: tracking.lock_version,
                closing_note: note.trim() || undefined,
              }),
            )
          }
        >
          <Lock className="h-3.5 w-3.5" aria-hidden />
          Cerrar Tracking
        </Button>
      </div>
      {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
    </section>
  )
}
