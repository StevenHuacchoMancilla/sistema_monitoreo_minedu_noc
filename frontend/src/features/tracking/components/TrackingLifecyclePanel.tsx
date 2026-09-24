import { useState } from 'react'
import { CircleCheck, Lock, RotateCcw, ShieldCheck } from 'lucide-react'
import { Button } from '../../../components/ui/Button'
import type { TrackingDetail } from '../types/tracking'

const noteClass =
  'mt-3 w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500'

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
  const [confirmClose, setConfirmClose] = useState(false)

  if (!canWrite) {
    return null
  }

  const run = async (action: () => Promise<void>) => {
    setError(null)
    try {
      await action()
      setNote('')
      setConfirmClose(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo completar la acción')
    }
  }

  if (tracking.can_reopen) {
    return (
      <section className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-900/60">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
              <Lock className="h-4 w-4 text-slate-500 dark:text-slate-400" aria-hidden />
              Tracking cerrado
            </h3>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
              Cerrado por <span className="font-semibold text-slate-800 dark:text-slate-100">{tracking.closed_by_name || '—'}</span>
              {tracking.closed_at_display ? ` · ${tracking.closed_at_display}` : ''}
            </p>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Aperturado por {tracking.opened_by_name || '—'}
              {tracking.opened_at_display ? ` · ${tracking.opened_at_display}` : ''}
            </p>
            {tracking.closing_note ? (
              <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">{tracking.closing_note}</p>
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
          className={noteClass}
        />
        {error ? <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p> : null}
      </section>
    )
  }

  if (!tracking.can_close) {
    return null
  }

  return (
    <section className="rounded-xl border border-violet-200 bg-violet-50/40 p-4 dark:border-violet-900/50 dark:bg-violet-950/30">
      <h3 className="inline-flex items-center gap-1.5 text-sm font-semibold text-violet-950 dark:text-violet-100">
        <CircleCheck className="h-4 w-4" aria-hidden />
        Cierre operativo
      </h3>
      <p className="mt-1 text-xs text-violet-900/80 dark:text-violet-200/80">
        Solo desde Tracking Detail. Queda registrado quién cierra (puede ser distinto de quien abrió). PRTG no
        cierra automáticamente.
      </p>
      <div className="mt-2 grid gap-1 text-xs text-violet-900/90 sm:grid-cols-2 dark:text-violet-200/90">
        <p>
          Aperturado por: <span className="font-semibold">{tracking.opened_by_name || '—'}</span>
        </p>
        <p className="text-violet-800/70 dark:text-violet-300/70">Al confirmar, tú serás el cerrador auditado.</p>
      </div>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        disabled={busy}
        placeholder="Nota de cierre (opcional)"
        className={`${noteClass} border-violet-200 dark:border-violet-800`}
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

        {!confirmClose ? (
          <Button
            type="button"
            variant="primary"
            size="sm"
            loading={busy}
            className="bg-violet-600 hover:bg-violet-700"
            onClick={() => setConfirmClose(true)}
          >
            <Lock className="h-3.5 w-3.5" aria-hidden />
            Cerrar Tracking
          </Button>
        ) : (
          <>
            <Button
              type="button"
              variant="primary"
              size="sm"
              loading={busy}
              className="bg-violet-700 hover:bg-violet-800"
              onClick={() =>
                void run(() =>
                  onClose({
                    lock_version: tracking.lock_version,
                    closing_note: note.trim() || undefined,
                  }),
                )
              }
            >
              <CircleCheck className="h-3.5 w-3.5" aria-hidden />
              Confirmar cierre formal
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => setConfirmClose(false)}
            >
              Cancelar
            </Button>
          </>
        )}
      </div>
      {confirmClose ? (
        <p className="mt-2 text-xs font-medium text-violet-900 dark:text-violet-200">
          Se fijará closed_at / closed_by con tu usuario y se actualizará el ticket de reporte.
        </p>
      ) : null}
      {error ? <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p> : null}
    </section>
  )
}
