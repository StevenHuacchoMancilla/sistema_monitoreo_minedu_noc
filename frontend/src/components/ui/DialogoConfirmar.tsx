import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { TriangleAlert } from 'lucide-react'
import { Boton } from './Boton'

export function DialogoConfirmar({
  open,
  title,
  description,
  children,
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
  children?: ReactNode
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
        className="absolute inset-0 cursor-default bg-[#0b0d0f]/72"
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
        className="relative z-10 w-full max-w-md overflow-hidden rounded-md border border-noc-border bg-noc-surface"
      >
        <div className="flex gap-3 px-5 pt-5 pb-4">
          <span
            className={`mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-noc-raised ${
              tone === 'danger' ? 'text-noc-danger' : 'text-noc-copper'
            }`}
            aria-hidden
          >
            <TriangleAlert className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h2 id={titleId} className="text-[15px] font-semibold text-noc-text">
              {title}
            </h2>
            {description ? (
              <p className="mt-1.5 text-[13px] leading-snug text-noc-muted">{description}</p>
            ) : null}
            {children ? <div className="mt-3">{children}</div> : null}
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-2 border-t border-noc-line bg-noc-surface-2 px-5 py-3">
          <Boton variant="secondary" size="sm" disabled={loading} onClick={onClose}>
            {cancelLabel}
          </Boton>
          <Boton
            ref={confirmRef}
            variant={tone === 'danger' ? 'danger' : 'primary'}
            size="sm"
            loading={loading}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Boton>
        </div>
      </div>
    </div>,
    document.body,
  )
}
