import { useState } from 'react'
import type { NetworkAssignmentPayload } from '../types/school'

const inputClass =
  'w-full rounded-xl border border-noc-border bg-white px-3 py-2 text-sm text-noc-text shadow-sm outline-none'

const FIELDS: Array<{ key: keyof NetworkAssignmentPayload; label: string }> = [
  { key: 'cid', label: 'CID' },
  { key: 'prtg_device_name', label: 'Presentación PRTG' },
  { key: 'capacidad_mbps', label: 'Capacidad (Mbps)' },
  { key: 'tecnologia_acceso', label: 'Tecnología' },
  { key: 'nodo_pop', label: 'Nodo / POP' },
  { key: 'ip_publica', label: 'IP pública' },
  { key: 'ip_loopback', label: 'Loopback' },
  { key: 'ip_wan_principal', label: 'WAN' },
  { key: 'ip_lan', label: 'LAN' },
  { key: 'gateway_wan', label: 'Gateway' },
  { key: 'vlan_internet', label: 'VLAN internet' },
  { key: 'vlan_uplink', label: 'VLAN uplink' },
]

export function NetworkAssignmentForm({
  initial,
  saving,
  mode,
  onSubmit,
}: {
  initial: NetworkAssignmentPayload
  saving?: boolean
  mode: 'correct' | 'reassign'
  onSubmit: (data: NetworkAssignmentPayload) => void
}) {
  const [form, setForm] = useState<NetworkAssignmentPayload>(initial)

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit(form)
      }}
    >
      <p className="text-xs text-noc-muted">
        {mode === 'correct'
          ? 'Corrección tipográfica / técnica (audita el mismo assignment).'
          : 'Reasignación histórica: cierra el CID actual y crea uno nuevo.'}
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {FIELDS.map(({ key, label }) => (
          <label key={key} className="text-xs font-semibold text-noc-muted">
            {label}
            <input
              className={`${inputClass} mt-1`}
              value={(form[key] as string | null | undefined) ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
            />
          </label>
        ))}
      </div>
      <button
        type="submit"
        disabled={saving || (mode === 'reassign' && !form.cid)}
        className={`rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 ${
          mode === 'reassign' ? 'bg-amber-600 hover:bg-amber-700' : 'bg-blue-600 hover:bg-blue-700'
        }`}
      >
        {saving
          ? 'Guardando…'
          : mode === 'reassign'
            ? 'Cambiar asignación CID'
            : 'Corregir asignación'}
      </button>
    </form>
  )
}
