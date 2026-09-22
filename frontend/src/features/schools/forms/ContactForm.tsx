import { useState } from 'react'
import type { ContactPayload } from '../types/school'

const inputClass =
  'w-full rounded-xl border border-noc-border bg-white px-3 py-2 text-sm text-noc-text shadow-sm outline-none'

export function ContactForm({
  initial,
  saving,
  onSubmit,
  onDeactivate,
}: {
  initial: ContactPayload & { id?: number }
  saving?: boolean
  onSubmit: (data: ContactPayload) => void
  onDeactivate?: () => void
}) {
  const [form, setForm] = useState<ContactPayload>({
    position: initial.position,
    name: initial.name ?? '',
    role: initial.role ?? '',
    phone: initial.phone ?? '',
    validation_status: initial.validation_status ?? '',
  })

  return (
    <form
      className="space-y-3 rounded-xl border border-noc-border/70 bg-[#f5f5f7]/50 p-3"
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit({
          ...form,
          phone: form.phone == null ? null : String(form.phone),
        })
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-semibold text-noc-muted">
          Orden (1–3)
          <select
            className={`${inputClass} mt-1`}
            value={form.position}
            onChange={(e) => setForm((f) => ({ ...f, position: Number(e.target.value) }))}
          >
            <option value={1}>1</option>
            <option value={2}>2</option>
            <option value={3}>3</option>
          </select>
        </label>
        <label className="text-xs font-semibold text-noc-muted">
          Teléfono (texto)
          <input
            className={`${inputClass} mt-1`}
            value={form.phone ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            inputMode="tel"
          />
        </label>
        <label className="text-xs font-semibold text-noc-muted">
          Nombre
          <input
            className={`${inputClass} mt-1`}
            value={form.name ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
        </label>
        <label className="text-xs font-semibold text-noc-muted">
          Cargo
          <input
            className={`${inputClass} mt-1`}
            value={form.role ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
          />
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={saving}
          className="rounded-xl bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Guardando…' : initial.id ? 'Actualizar contacto' : 'Crear contacto'}
        </button>
        {onDeactivate ? (
          <button
            type="button"
            onClick={onDeactivate}
            className="rounded-xl border border-noc-border px-3 py-1.5 text-xs font-semibold text-noc-muted hover:text-noc-danger"
          >
            Desactivar
          </button>
        ) : null}
      </div>
    </form>
  )
}
