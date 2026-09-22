import { useState } from 'react'
import type { SchoolGeneralPayload } from '../types/school'

const inputClass =
  'w-full rounded-xl border border-noc-border bg-white px-3 py-2 text-sm text-noc-text shadow-sm outline-none'

const FIELDS: Array<{ key: keyof SchoolGeneralPayload; label: string }> = [
  { key: 'current_sequence', label: 'N° (secuencia)' },
  { key: 'legacy_reference', label: 'Referencia legacy' },
  { key: 'codigo_local', label: 'Código local' },
  { key: 'codigo_modular', label: 'Código modular' },
  { key: 'local_educativo', label: 'Local educativo' },
  { key: 'departamento', label: 'Departamento' },
  { key: 'provincia', label: 'Provincia' },
  { key: 'distrito', label: 'Distrito' },
  { key: 'centro_poblado', label: 'Centro poblado' },
  { key: 'clasificacion', label: 'Clasificación' },
  { key: 'nivel_iiee', label: 'Nivel IIEE' },
]

export function SchoolGeneralForm({
  initial,
  saving,
  onSubmit,
}: {
  initial: SchoolGeneralPayload
  saving?: boolean
  onSubmit: (data: SchoolGeneralPayload) => void
}) {
  const [form, setForm] = useState<SchoolGeneralPayload>(initial)

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit(form)
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {FIELDS.map(({ key, label }) => (
          <label key={key} className="text-xs font-semibold text-noc-muted">
            {label}
            <input
              className={`${inputClass} mt-1`}
              value={form[key] == null ? '' : String(form[key])}
              onChange={(e) => {
                const raw = e.target.value
                setForm((f) => ({
                  ...f,
                  [key]: key === 'current_sequence' ? (raw === '' ? null : Number(raw)) : raw,
                }))
              }}
            />
          </label>
        ))}
      </div>
      <button
        type="submit"
        disabled={saving}
        className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {saving ? 'Guardando…' : 'Guardar datos generales'}
      </button>
    </form>
  )
}
