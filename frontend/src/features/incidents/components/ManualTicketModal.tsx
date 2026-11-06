import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { endpoints } from '../../../api/endpoints'
import { Button } from '../../../components/ui/Button'
import { FormField, Input, Select } from '../../../components/ui/FormControls'
import type { MineduReason } from '../../reports/types/operationalReport'
import rootCauseLegend from '../data/rootCauseLegend.json' with { type: 'json' }

type TicketKind = 'CORRECTIVO' | 'PREVENTIVO'

type Found = {
  cid: string | null
  tss: number | null
  local_educativo: string | null
  codigo_local: string | null
  provincia: string | null
  distrito: string | null
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
  const [openedAt, setOpenedAt] = useState('')
  const [detail, setDetail] = useState('')
  const [reason, setReason] = useState<'' | MineduReason>('')
  const [causeGroup, setCauseGroup] = useState('')
  const [causeCode, setCauseCode] = useState('')
  const [found, setFound] = useState<Found | null>(null)
  const [error, setError] = useState<string | null>(null)

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
            opened_at: openedAt || null,
            minedu_reason: reason || null,
            root_cause_group_code: causeGroup,
            root_cause_code: causeCode,
          })
        : endpoints.createManualTicket({
            q: q.trim(),
            detail: detail || null,
            minedu_reason: reason || null,
            root_cause_group_code: causeGroup,
            root_cause_code: causeCode,
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
          if (!causeGroup || !causeCode) {
            setError('Elige el grupo y el código de causa raíz.')
            return
          }
          create.mutate()
        }}
      >
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Registrar ticket</h2>
        <p className="mt-1 text-sm text-slate-500">
          {kind === 'PREVENTIVO'
            ? 'Mantenimiento preventivo con el colegio operativo. Se genera un código TGS y pasa a gestión, sin aparecer en caídas.'
            : 'Correctivo: caída que no llegó por PRTG. Si el colegio ya está caído, se continúa ese ticket.'}
        </p>
        <div className="mt-4 grid gap-3">
          <FormField label="Tipo de ticket">
            <Select value={kind} onChange={(event) => setKind(event.target.value as TicketKind)}>
              <option value="CORRECTIVO">Correctivo</option>
              <option value="PREVENTIVO">Preventivo</option>
            </Select>
          </FormField>
          <FormField label="CID o TSS">
            <Input value={q} onChange={(event) => { setQ(event.target.value); setFound(null) }} placeholder="258394 o 90" required />
          </FormField>
          <FormField label="Grupo de causa raíz">
            <Select
              value={causeGroup}
              onChange={(event) => {
                setCauseGroup(event.target.value)
                setCauseCode('')
              }}
            >
              <option value="">— Elige el grupo —</option>
              {Array.from(new Map(rootCauseLegend.map((row) => [row.group_code, row.group_name])).entries()).map(
                ([code, name]) => (
                  <option key={code} value={code}>
                    {code} · {name}
                  </option>
                ),
              )}
            </Select>
          </FormField>
          <FormField label="Código y causa raíz">
            <Select value={causeCode} disabled={!causeGroup} onChange={(event) => setCauseCode(event.target.value)}>
              <option value="">— Elige el código —</option>
              {rootCauseLegend
                .filter((row) => row.group_code === causeGroup)
                .map((row) => (
                  <option key={row.code} value={row.code}>
                    {row.code} · {row.cause}
                  </option>
                ))}
            </Select>
          </FormField>
          <FormField label="Razón MINEDU">
            <Select value={reason} onChange={(event) => setReason(event.target.value as '' | MineduReason)}>
              <option value="">— No aplica / sin razón —</option>
              <option value="CAIDA_ENLACE">Caída de enlace</option>
              <option value="CAIDA_ENERGIA">Caída de energía</option>
              <option value="REQUERIMIENTO">Requerimiento</option>
            </Select>
          </FormField>
          {kind === 'PREVENTIVO' ? (
            <FormField label="Hora de inicio">
              <Input type="datetime-local" value={openedAt} onChange={(event) => setOpenedAt(event.target.value)} />
            </FormField>
          ) : null}
          <FormField label="Detalle">
            <Input value={detail} onChange={(event) => setDetail(event.target.value)} placeholder={kind === 'PREVENTIVO' ? 'Motivo del mantenimiento' : 'Cómo se enteraron de la caída'} />
          </FormField>
        </div>
        {found ? (
          <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700 dark:bg-slate-950 dark:text-slate-200">
            CID {found.cid ?? '—'} · TSS {found.tss ?? '—'} · {found.local_educativo ?? 'Sin nombre'}
            {found.provincia ? ` · ${found.provincia}` : ''}
          </p>
        ) : null}
        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          {!found ? (
            <Button type="submit" loading={lookup.isPending}>Buscar colegio</Button>
          ) : (
            <Button type="submit" loading={create.isPending}>
              {kind === 'PREVENTIVO' ? 'Generar ticket preventivo' : 'Crear ticket'}
            </Button>
          )}
        </div>
      </form>
    </div>
  )
}
