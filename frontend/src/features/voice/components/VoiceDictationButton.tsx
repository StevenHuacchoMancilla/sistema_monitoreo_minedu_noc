import { Mic, MicOff } from 'lucide-react'
import { useVoiceDictation, type VoiceDictationLang } from '../hooks/useVoiceDictation'

export function VoiceDictationButton({
  lang = 'es-PE',
  disabled,
  onFinalTranscript,
  className = '',
}: {
  lang?: VoiceDictationLang
  disabled?: boolean
  /** Texto final reconocido (no interim). El caller lo inserta en el campo. */
  onFinalTranscript: (text: string) => void
  className?: string
}) {
  const { supported, listening, error, toggle, clearError } = useVoiceDictation({
    lang,
    onTranscript: (text, isFinal) => {
      if (isFinal) onFinalTranscript(text)
    },
  })

  const title = !supported
    ? 'El dictado por voz no está disponible en este navegador.'
    : listening
      ? 'Detener dictado'
      : 'Dictar por voz (requiere HTTPS y permiso de micrófono en producción)'

  return (
    <div className={`inline-flex flex-col items-start gap-1 ${className}`}>
      <button
        type="button"
        onClick={() => {
          clearError()
          toggle()
        }}
        disabled={disabled || !supported}
        title={title}
        aria-label={title}
        aria-pressed={listening}
        className={[
          'inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold transition',
          listening
            ? 'border-violet-300 bg-violet-50 text-violet-700'
            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
          disabled || !supported ? 'cursor-not-allowed opacity-50' : '',
        ].join(' ')}
      >
        {listening ? (
          <MicOff className="h-3.5 w-3.5 animate-pulse" aria-hidden />
        ) : (
          <Mic className="h-3.5 w-3.5" aria-hidden />
        )}
        {listening ? 'Escuchando…' : 'Micrófono'}
      </button>
      {error ? <p className="max-w-[16rem] text-[11px] text-red-600">{error}</p> : null}
    </div>
  )
}
