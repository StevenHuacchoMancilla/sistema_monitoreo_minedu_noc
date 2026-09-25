import { useEffect, useState } from 'react'
import { Button } from '../../../components/ui/Button'
import { FormField } from '../../../components/ui/FormControls'
import { inputClassName } from '../../../lib/uiTokens'
import { VoiceDictationButton } from '../../voice/components/VoiceDictationButton'

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

export function TrackingCodigoCausaPanel({
  codigoLetters,
  causa,
  lockVersion,
  canWrite,
  saving,
  error,
  onSave,
}: {
  codigoLetters: string[]
  causa: string | null
  lockVersion: number
  canWrite: boolean
  saving?: boolean
  error?: string | null
  onSave: (payload: { codigo: string[]; causa: string; lock_version: number }) => Promise<void>
}) {
  const [letters, setLetters] = useState<string[]>(codigoLetters)
  const [causaText, setCausaText] = useState(causa ?? '')

  useEffect(() => {
    setLetters(codigoLetters)
    setCausaText(causa ?? '')
  }, [codigoLetters, causa, lockVersion])

  const toggle = (letter: string) => {
    setLetters((prev) =>
      prev.includes(letter) ? prev.filter((l) => l !== letter) : [...prev, letter].sort(),
    )
  }

  const dirty =
    letters.join(',') !== [...codigoLetters].sort().join(',') || (causaText ?? '') !== (causa ?? '')

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <h3 className="mb-1 text-[13px] font-semibold text-slate-900 dark:text-slate-100">
        Código y causa
      </h3>
      <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
        Columnas del Tracking General. Podés elegir varias letras (A–Z).
      </p>

      <FormField label="Código (letras)">
        <div className="flex flex-wrap gap-1.5">
          {LETTERS.map((letter) => {
            const on = letters.includes(letter)
            return (
              <button
                key={letter}
                type="button"
                disabled={!canWrite || saving}
                onClick={() => toggle(letter)}
                className={[
                  'inline-flex h-8 w-8 items-center justify-center rounded-md border text-xs font-bold tabular-nums transition',
                  on
                    ? 'border-violet-600 bg-violet-600 text-white'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-violet-300 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200',
                  !canWrite ? 'cursor-not-allowed opacity-60' : '',
                ].join(' ')}
              >
                {letter}
              </button>
            )
          })}
        </div>
        <p className="mt-1.5 text-[11px] text-slate-500">
          Seleccionadas: {letters.length ? letters.join(', ') : '—'}
        </p>
      </FormField>

      <div className="mt-3">
        <FormField
          label="Causa"
          action={
            canWrite ? (
              <VoiceDictationButton
                onTranscript={(t) => setCausaText((prev) => (prev ? `${prev} ${t}` : t))}
              />
            ) : undefined
          }
        >
          <textarea
            className={`${inputClassName} !h-auto min-h-20 resize-y py-2`}
            value={causaText}
            disabled={!canWrite || saving}
            placeholder="Ej. Patchcord dañado / fluido eléctrico / equipos apagados"
            onChange={(e) => setCausaText(e.target.value)}
            maxLength={2000}
          />
        </FormField>
      </div>

      {error ? (
        <p className="mt-2 text-sm text-rose-600 dark:text-rose-400">{error}</p>
      ) : null}

      {canWrite ? (
        <div className="mt-3 flex justify-end">
          <Button
            type="button"
            disabled={!dirty || saving}
            onClick={() =>
              onSave({
                codigo: letters,
                causa: causaText,
                lock_version: lockVersion,
              })
            }
          >
            {saving ? 'Guardando…' : 'Guardar código y causa'}
          </Button>
        </div>
      ) : null}
    </section>
  )
}
