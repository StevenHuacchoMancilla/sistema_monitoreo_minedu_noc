import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ClipboardList } from 'lucide-react'
import { endpoints } from '../../../api/endpoints'
import { Button } from '../../../components/ui/Button'
import { FormField, Input } from '../../../components/ui/FormControls'
import { inputClassName } from '../../../lib/uiTokens'
import type { IncidentDetail } from '../../../types/api'

type Ticket = NonNullable<IncidentDetail['ticket']>

function limaInput(iso: string | null | undefined): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const pick = (type: string) => parts.find((part) => part.type === type)?.value ?? ''
  return `${pick('year')}-${pick('month')}-${pick('day')}T${pick('hour')}:${pick('minute')}`
}

const textareaClass = `${inputClassName} !h-auto min-h-20 resize-y py-2`

export function VisitReportPanel({
  incidentId,
  ticket,
  schoolName,
  tss,
  readOnly,
  onSaved,
}: {
  incidentId: number
  ticket: Ticket | null | undefined
  schoolName: string | null
  tss: number | null
  readOnly: boolean
  onSaved: (detail: IncidentDetail) => void
}) {
  const client = useQueryClient()
  const preventive = ticket?.kind === 'PREVENTIVO'
  const [openedAt, setOpenedAt] = useState('')
  const [restoredAt, setRestoredAt] = useState('')
  const [closedAt, setClosedAt] = useState('')
  const [arrivedAt, setArrivedAt] = useState('')
  const [departedAt, setDepartedAt] = useState('')
  const [technician, setTechnician] = useState('')
  const [polygon, setPolygon] = useState('')
  const [reason, setReason] = useState('')
  const [activities, setActivities] = useState('')
  const [materials, setMaterials] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setOpenedAt(limaInput(ticket?.opened_at))
    setRestoredAt(limaInput(ticket?.restored_at))
    setClosedAt(limaInput(ticket?.closed_at))
    setArrivedAt(limaInput(ticket?.arrived_at))
    setDepartedAt(limaInput(ticket?.departed_at))
    setTechnician(ticket?.technician_name ?? '')
    setPolygon(ticket?.polygon ?? '')
    setReason(ticket?.visit_reason ?? '')
    setActivities(ticket?.activities ?? '')
    setMaterials(ticket?.materials ?? '')
  }, [ticket])

  const save = useMutation({
    mutationFn: () =>
      endpoints.saveVisit(incidentId, {
        opened_at: undefined,
        restored_at: preventive ? undefined : restoredAt || null,
        closed_at: closedAt || null,
        arrived_at: arrivedAt || null,
        departed_at: departedAt || null,
        technician_name: technician || null,
        polygon: polygon || null,
        visit_reason: reason || null,
        activities: activities || null,
        materials: materials || null,
      }),
    onSuccess: async (detail) => {
      setError(null)
      client.setQueryData(['incidents', incidentId], detail)
      await client.invalidateQueries({ queryKey: ['ticketera'] })
      onSaved(detail)
    },
    onError: (err: unknown) => setError(err instanceof Error ? err.message : 'No se pudo guardar la visita.'),
  })

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <h3 className="mb-1 inline-flex items-center gap-1.5 text-[13px] font-semibold text-slate-900 dark:text-slate-100">
        <ClipboardList className="h-4 w-4" aria-hidden />
        Reporte de visita técnica
      </h3>
      <p className="mb-3 text-[12px] leading-snug text-slate-500">
        {ticket?.ticket_code ? (
          <>
            Ticket <strong className="text-slate-800 dark:text-slate-100">{ticket.ticket_code}</strong>
            {' · '}
            {ticket.kind_label}
            {' · '}
            {ticket.status === 'CERRADO' ? 'Cerrado' : 'Abierto'}
            {ticket.opened_at ? ' · la hora de generación ya quedó registrada' : ''}
          </>
        ) : (
          'La hora de generación queda registrada al crear el ticket.'
        )}
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        <FormField label="Institución educativa">
          <Input value={schoolName ?? ''} readOnly />
        </FormField>
        <FormField label="TSS">
          <Input value={tss != null ? String(tss) : ''} readOnly />
        </FormField>
        <FormField label="Polígono">
          <Input value={polygon} disabled={readOnly} onChange={(event) => setPolygon(event.target.value)} />
        </FormField>
        <FormField label="Técnico">
          <Input value={technician} disabled={readOnly} onChange={(event) => setTechnician(event.target.value)} placeholder="Nombres y apellidos" />
        </FormField>
        <FormField label="Motivo de la visita" className="md:col-span-2">
          <Input value={reason} disabled={readOnly} onChange={(event) => setReason(event.target.value)} />
        </FormField>
        <FormField label="Hora de generación">
          <Input type="datetime-local" value={openedAt} readOnly />
        </FormField>
        {preventive ? null : (
          <FormField label="Hora de restablecimiento">
            <Input type="datetime-local" value={restoredAt} disabled={readOnly} onChange={(event) => setRestoredAt(event.target.value)} />
          </FormField>
        )}
        <FormField label="Hora de cierre">
          <Input type="datetime-local" value={closedAt} disabled={readOnly} onChange={(event) => setClosedAt(event.target.value)} />
        </FormField>
        <FormField label="Hora de llegada">
          <Input type="datetime-local" value={arrivedAt} disabled={readOnly} onChange={(event) => setArrivedAt(event.target.value)} />
        </FormField>
        <FormField label="Hora de salida">
          <Input type="datetime-local" value={departedAt} disabled={readOnly} onChange={(event) => setDepartedAt(event.target.value)} />
        </FormField>
        <FormField label="Actividades ejecutadas" className="md:col-span-2">
          <textarea className={textareaClass} value={activities} disabled={readOnly} onChange={(event) => setActivities(event.target.value)} />
        </FormField>
        <FormField label="Materiales utilizados" className="md:col-span-2">
          <textarea className={textareaClass} value={materials} disabled={readOnly} onChange={(event) => setMaterials(event.target.value)} />
        </FormField>
      </div>
      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
      {!readOnly ? (
        <div className="mt-3 flex justify-end">
          <Button type="button" variant="secondary" loading={save.isPending} onClick={() => save.mutate()}>
            Guardar visita
          </Button>
        </div>
      ) : null}
    </section>
  )
}
