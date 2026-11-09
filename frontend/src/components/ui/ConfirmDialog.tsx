import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { TriangleAlert } from 'lucide-react'
import { Button } from './Button'

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  tone = 'danger',
  loading = false,
  onConfirm,
  onClose,
}: {
  open: boolean
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  tone?: 'danger' | 'primary'
  loading?: boolean
  onConfirm: () => void
  onClose: () => void
}) {
  const titleId = useId()
  const confirmRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const prev = document.activeElement
    confirmRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      if (prev instanceof HTMLElement) prev.focus()
    }
  }, [open, loading, onClose])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 cursor-default bg-slate-950/50 backdrop-blur-[1px]"
        aria-label="Cerrar diálogo"
        disabled={loading}
        onClick={() => {
          if (!loading) onClose()
        }}
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
      >
        <div className="flex gap-3 px-5 pt-5 pb-4">
          <span
            className={`mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
              tone === 'danger'
                ? 'bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-300'
                : 'bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300'
            }`}
            aria-hidden
          >
            <TriangleAlert className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-bold text-slate-950 dark:text-slate-50">
              {title}
            </h2>
            {description ? (
              <p className="mt-1.5 text-[13px] leading-snug text-slate-600 dark:text-slate-300">{description}</p>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 bg-slate-50 px-5 py-3.5 dark:border-slate-800 dark:bg-slate-950/60">
          <Button variant="secondary" size="sm" disabled={loading} onClick={onClose}>
            {cancelLabel}
          </Button>
          <Button
            ref={confirmRef}
            variant={tone === 'danger' ? 'danger' : 'primary'}
            size="sm"
            loading={loading}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
