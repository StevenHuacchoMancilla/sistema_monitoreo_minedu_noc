import { useMemo, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Ticket, Wrench } from 'lucide-react'
import { endpoints } from '../../../api/endpoints'
import { Button } from '../../../components/ui/Button'
import { FormField, Input, Select } from '../../../components/ui/FormControls'
import { inputClassName } from '../../../lib/uiTokens'
import type { MineduReason } from '../../reports/types/operationalReport'
import { RootCausePicker } from './RootCausePicker'

export type TicketKind = 'CORRECTIVO' | 'PREVENTIVO' | 'ASIGNACION_LIBRE'

type OpenCase = {
  incident_id: number
  followup_status?: string | null
  followup_label?: string | null
  ticket_code?: string | null
  location: string
  is_grave?: boolean
  is_requirement?: boolean
  is_maintenance?: boolean
  message: string
}

type Found = {
  cid: string | null
  tss: number | null
  local_educativo: string | null
  codigo_local: string | null
  provincia: string | null
  distrito: string | null
  open_case?: OpenCase | null
}

const textareaClass = `${inputClassName} !h-auto min-h-20 resize-y py-2`

function kindHelp(kind: TicketKind): string {
  if (kind === 'PREVENTIVO') {
    return 'Preventivo → Mantenimientos. Colegio operativo. Puedes completar el detalle de evento ahora o después.'
  }
  if (kind === 'ASIGNACION_LIBRE') {
    return 'Asignación libre: ticket sin denominación correctivo/preventivo. Seguimiento normal en Detalle; Detalle de evento solo si va técnico.'
  }
  return 'Correctivo → Incidencias. Si el colegio ya tiene caso abierto, se reutiliza ese ticket. Queja / Caída de enlace → Incidencias; Requerimiento → Requerimientos; causa GS01 → Mantenimientos.'
}

export function ManualTicketModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: (incidentId: number) => void
}) {
  const [q, setQ] = useState('')
  const [kind, setKind] = useState<TicketKind>('CORRECTIVO')
  const [detail, setDetail] = useState('')
  const [reason, setReason] = useState<'' | MineduReason>('')
  const [causeGroup, setCauseGroup] = useState('')
  const [causeCode, setCauseCode] = useState('')
  const [found, setFound] = useState<Found | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [arrivedAt, setArrivedAt] = useState('')
  const [technician, setTechnician] = useState('')
  const [phone, setPhone] = useState('')
  const [activities, setActivities] = useState('')
  const [materials, setMaterials] = useState('')
  const [restoredAt, setRestoredAt] = useState('')
  const [departedAt, setDepartedAt] = useState('')

  const showEventFields = true
  const showRestored = kind !== 'PREVENTIVO'

  const visitPayload = useMemo(
    () => ({
      arrived_at: arrivedAt || null,
      technician_name: technician || null,
      technician_phone: phone || null,
      activities: activities || null,
      materials: materials || null,
      restored_at: showRestored ? restoredAt || null : null,
      departed_at: departedAt || null,
    }),
    [arrivedAt, technician, phone, activities, materials, showRestored, restoredAt, departedAt],
  )

  const lookup = useMutation({
    mutationFn: () => endpoints.lookupSchool(q.trim()),
    onSuccess: (res) => {
      setFound(res.data)
      setError(res.data ? null : 'No hay un colegio activo con ese CID o TSS.')
    },
    onError: (err: unknown) => setError(err instanceof Error ? err.message : 'No se pudo buscar.'),
  })

  const create = useMutation({
    mutationFn: () =>
      kind === 'PREVENTIVO'
        ? endpoints.createPreventiveTicket({
            q: q.trim(),
            detail: detail || null,
            minedu_reason: reason || null,
            root_cause_group_code: causeGroup || null,
            root_cause_code: causeCode || null,
            ...visitPayload,
          })
        : endpoints.createManualTicket({
            q: q.trim(),
            kind,
            detail: detail || null,
            minedu_reason: reason || null,
            root_cause_group_code: causeGroup || null,
            root_cause_code: causeCode || null,
            ...visitPayload,
          }),
    onSuccess: (detailResponse) => {
      onCreated(detailResponse.incident.id)
      onClose()
    },
    onError: (err: unknown) => setError(err instanceof Error ? err.message : 'No se pudo crear el ticket.'),
  })

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
      <form
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl dark:bg-slate-900"
        onSubmit={(event) => {
          event.preventDefault()
          if (!found) {
            lookup.mutate()
            return
          }
          if ((causeGroup && !causeCode) || (!causeGroup && causeCode)) {
            setError('Completa grupo y causa raíz, o déjalos vacíos (opcional en Requerimientos).')
            return
          }
          create.mutate()
        }}
      >
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Registrar ticket</h2>
        <p className="mt-1 text-sm text-slate-500">{kindHelp(kind)}</p>
        <div className="mt-4 grid gap-3">
          <FormField label="Tipo de ticket">
            <Select value={kind} onChange={(event) => setKind(event.target.value as TicketKind)}>
              <option value="CORRECTIVO">Correctivo</option>
              <option value="PREVENTIVO">Preventivo</option>
              <option value="ASIGNACION_LIBRE">Asignación libre</option>
            </Select>
          </FormField>
          <FormField label="CID o TSS">
            <Input value={q} onChange={(event) => { setQ(event.target.value); setFound(null) }} placeholder="CID o TSS" required />
          </FormField>
          <RootCausePicker
            groupCode={causeGroup}
            causeCode={causeCode}
            onGroupChange={(next) => {
              setCauseGroup(next)
              setCauseCode('')
            }}
            onCauseChange={(next) => setCauseCode(next)}
          />
          <FormField label="Razón MINEDU">
            <Select value={reason} onChange={(event) => setReason(event.target.value as '' | MineduReason)}>
              <option value="">— No aplica / sin razón —</option>
              <option value="CAIDA_ENLACE">Caída de enlace</option>
              <option value="REQUERIMIENTO">Requerimiento</option>
              <option value="QUEJA">Queja</option>
            </Select>
          </FormField>
          <FormField label="Detalle">
            <Input
              value={detail}
              onChange={(event) => setDetail(event.target.value)}
              placeholder={
                kind === 'PREVENTIVO'
                  ? 'Motivo del mantenimiento'
                  : kind === 'ASIGNACION_LIBRE'
                    ? 'Seguimiento / contexto del ticket'
                    : 'Cómo se enteraron de la caída'
              }
            />
          </FormField>

          {showEventFields ? (
            <section className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-700 dark:bg-slate-950/40">
              <h3 className="mb-1 inline-flex items-center gap-1.5 text-[13px] font-semibold text-slate-900 dark:text-slate-100">
                {kind === 'PREVENTIVO' ? <Wrench className="h-4 w-4" aria-hidden /> : <Ticket className="h-4 w-4" aria-hidden />}
                Detalle de evento (opcional ahora)
              </h3>
              <p className="mb-3 text-[12px] text-slate-500">
                Si va técnico, completa aquí. Si se resuelve solo con seguimiento, deja vacío y usa solo Detalle.
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
                  <textarea
                    className={textareaClass}
                    value={activities}
                    onChange={(e) => setActivities(e.target.value)}
                    placeholder="Una actividad por línea"
                  />
                </FormField>
                <FormField label="Materiales utilizados" className="md:col-span-2">
                  <textarea
                    className={textareaClass}
                    value={materials}
                    onChange={(e) => setMaterials(e.target.value)}
                    placeholder="Un material por línea"
                  />
                </FormField>
              </div>
            </section>
          ) : null}
        </div>
        {found ? (
          <div className="mt-3 space-y-2">
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700 dark:bg-slate-950 dark:text-slate-200">
              CID {found.cid ?? '—'} · TSS {found.tss ?? '—'} · {found.local_educativo ?? 'Sin nombre'}
              {found.provincia ? ` · ${found.provincia}` : ''}
            </p>
            {found.open_case ? (
              <div
                className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100"
                role="status"
              >
                <p className="font-semibold">Ya está en {found.open_case.location}</p>
                <p className="mt-0.5 text-[13px] leading-snug">{found.open_case.message}</p>
                {found.open_case.followup_label ? (
                  <p className="mt-1 text-[12px] text-amber-800 dark:text-amber-200">
                    Estado actual: {found.open_case.followup_label}
                    {found.open_case.ticket_code ? ` · ${found.open_case.ticket_code}` : ''}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          {!found ? (
            <Button type="submit" loading={lookup.isPending}>Buscar colegio</Button>
          ) : (
            <Button type="submit" loading={create.isPending}>
              {found.open_case ? 'Continuar en el caso abierto' : 'Generar ticket'}
            </Button>
          )}
        </div>
      </form>
    </div>
  )
}
