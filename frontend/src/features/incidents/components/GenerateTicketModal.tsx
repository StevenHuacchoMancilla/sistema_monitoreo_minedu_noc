import { useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ImageDown, Ticket } from 'lucide-react'
import { endpoints } from '../../../api/endpoints'
import { Button } from '../../../components/ui/Button'
import { FormField, Input, Select } from '../../../components/ui/FormControls'
import { inputClassName } from '../../../lib/uiTokens'
import { downloadTicketImageFromIncidentId } from '../lib/ticketImage'
import type { TicketKind } from './ManualTicketModal'

const textareaClass = `${inputClassName} !h-auto min-h-20 resize-y py-2`

type Props = {
  open: boolean
  incidentId: number
  schoolLabel?: string | null
  cid?: string | null
  /** Desde Incidencias el default es Correctivo. */
  defaultKind?: TicketKind
  hasTicket?: boolean
  onClose: () => void
  onDone: (incidentId: number) => void
}

export function GenerateTicketModal({
  open,
  incidentId,
  schoolLabel,
  cid,
  defaultKind = 'CORRECTIVO',
  hasTicket = false,
  onClose,
  onDone,
}: Props) {
  const client = useQueryClient()
  const [kind, setKind] = useState<TicketKind>(defaultKind)
  const [arrivedAt, setArrivedAt] = useState('')
  const [technician, setTechnician] = useState('')
  const [phone, setPhone] = useState('')
  const [activities, setActivities] = useState('')
  const [materials, setMaterials] = useState('')
  const [restoredAt, setRestoredAt] = useState('')
  const [departedAt, setDepartedAt] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pngBusy, setPngBusy] = useState(false)

  const showRestored = kind !== 'PREVENTIVO'
  const payload = useMemo(
    () => ({
      kind,
      arrived_at: arrivedAt || null,
      technician_name: technician || null,
      technician_phone: phone || null,
      activities: activities || null,
      materials: materials || null,
      restored_at: showRestored ? restoredAt || null : null,
      departed_at: departedAt || null,
    }),
    [kind, arrivedAt, technician, phone, activities, materials, showRestored, restoredAt, departedAt],
  )

  const save = useMutation({
    mutationFn: () => endpoints.ensureIncidentTicket(incidentId, payload),
    onSuccess: async (res) => {
      setError(null)
      client.setQueryData(['incidents', incidentId], res)
      await client.invalidateQueries({ queryKey: ['maintenance'] })
      await client.invalidateQueries({ queryKey: ['incidents'] })
      await client.invalidateQueries({ queryKey: ['dashboard'] })
      onDone(incidentId)
      onClose()
    },
    onError: (err: unknown) => setError(err instanceof Error ? err.message : 'No se pudo generar el ticket.'),
  })

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
      <form
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl dark:bg-slate-900"
        onSubmit={(e) => {
          e.preventDefault()
          save.mutate()
        }}
      >
        <h2 className="inline-flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
          <Ticket className="h-5 w-5" aria-hidden />
          {hasTicket ? 'Completar detalle de evento' : 'Generar ticket'}
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          {cid ? `CID ${cid}` : 'Caso'}
          {schoolLabel ? ` · ${schoolLabel}` : ''}.
          {' '}El seguimiento normal (Detalle) se agrega en la gestión del caso. Aquí solo el ticket y el detalle de evento.
        </p>

        <div className="mt-4 grid gap-3">
          <FormField label="Tipo de ticket">
            <Select value={kind} onChange={(e) => setKind(e.target.value as TicketKind)}>
              <option value="CORRECTIVO">Correctivo (→ Incidencias)</option>
              <option value="PREVENTIVO">Preventivo (→ Mantenimientos)</option>
              <option value="ASIGNACION_LIBRE">Asignación libre</option>
            </Select>
          </FormField>

          <section className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-700 dark:bg-slate-950/40">
            <h3 className="mb-1 text-[13px] font-semibold text-slate-900 dark:text-slate-100">
              Detalle de evento
            </h3>
            <p className="mb-3 text-[12px] text-slate-500">
              Llénalo si el técnico atiende en campo. Si se soluciona sin visita, déjalo vacío.
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              <FormField label="Hora de inicio">
                <Input type="datetime-local" value={arrivedAt} onChange={(e) => setArrivedAt(e.target.value)} />
              </FormField>
              <FormField label="Datos del técnico">
                <Input value={technician} onChange={(e) => setTechnician(e.target.value)} placeholder="Nombres y apellidos" />
              </FormField>
              <FormField label="Celular">
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="9XXXXXXXX" />
              </FormField>
              {showRestored ? (
                <FormField label="Hora de restablecimiento">
                  <Input type="datetime-local" value={restoredAt} onChange={(e) => setRestoredAt(e.target.value)} />
                </FormField>
              ) : null}
              <FormField label="Hora de salida">
                <Input type="datetime-local" value={departedAt} onChange={(e) => setDepartedAt(e.target.value)} />
              </FormField>
              <FormField label="Actividades ejecutadas" className="md:col-span-2">
                <textarea className={textareaClass} value={activities} onChange={(e) => setActivities(e.target.value)} />
              </FormField>
              <FormField label="Materiales utilizados" className="md:col-span-2">
                <textarea className={textareaClass} value={materials} onChange={(e) => setMaterials(e.target.value)} />
              </FormField>
            </div>
          </section>
        </div>

        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          {hasTicket ? (
            <Button
              type="button"
              variant="secondary"
              loading={pngBusy}
              onClick={() => {
                setPngBusy(true)
                void downloadTicketImageFromIncidentId(incidentId)
                  .catch((err: unknown) => setError(err instanceof Error ? err.message : 'No se pudo generar la imagen.'))
                  .finally(() => setPngBusy(false))
              }}
            >
              <ImageDown className="h-4 w-4" />
              Descargar imagen
            </Button>
          ) : null}
          <Button type="submit" loading={save.isPending}>
            {hasTicket ? 'Guardar evento' : 'Generar ticket'}
          </Button>
        </div>
      </form>
    </div>
  )
}
