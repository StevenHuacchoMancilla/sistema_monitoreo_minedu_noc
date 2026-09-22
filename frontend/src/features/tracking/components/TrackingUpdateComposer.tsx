import { useState, type FormEvent, type KeyboardEvent } from 'react'
import { MessageSquareText, Send } from 'lucide-react'
import { Button } from '../../../components/ui/Button'
import { VoiceDictationButton } from '../../voice/components/VoiceDictationButton'

function appendTranscript(current: string, chunk: string): string {
  const next = chunk.trim()
  if (!next) return current
  if (!current.trim()) return next
  const needsSpace = !/\s$/.test(current)
  return `${current}${needsSpace ? ' ' : ''}${next}`
}

export function TrackingUpdateComposer({
  disabled,
  submitting,
  onSubmit,
}: {
  disabled?: boolean
  submitting?: boolean
  onSubmit: (body: string) => Promise<void> | void
}) {
  const [body, setBody] = useState('')
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    const trimmed = body.trim()
    if (!trimmed || disabled || submitting) return
    setError(null)
    try {
      await onSubmit(trimmed)
      setBody('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar el seguimiento')
    }
  }

  const onForm = (e: FormEvent) => {
    e.preventDefault()
    void submit()
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      void submit()
    }
  }

  return (
    <form onSubmit={onForm} className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 sm:p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          <MessageSquareText className="h-4 w-4 text-violet-600" aria-hidden />
          Nuevo seguimiento
        </div>
        <VoiceDictationButton
          disabled={disabled || submitting}
          onFinalTranscript={(text) => setBody((prev) => appendTranscript(prev, text))}
        />
      </div>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={onKeyDown}
        disabled={disabled || submitting}
        rows={3}
        placeholder="Registrar diagnóstico, contacto, intervención o avance…"
        className="w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 disabled:opacity-60"
      />
      {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-500">
          {disabled
            ? 'Tracking cerrado: no se pueden agregar seguimientos.'
            : 'Revisa el texto dictado antes de guardar · Ctrl/Cmd + Enter'}
        </p>
        <Button
          type="submit"
          variant="primary"
          size="sm"
          loading={submitting}
          disabled={disabled || !body.trim()}
          className="bg-violet-600 hover:bg-violet-700"
        >
          <Send className="h-3.5 w-3.5" aria-hidden />
          Agregar seguimiento
        </Button>
      </div>
    </form>
  )
}
