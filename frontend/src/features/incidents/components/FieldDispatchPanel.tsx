import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { MapPin, Truck } from 'lucide-react'
import { endpoints } from '../../../api/endpoints'
import { Badge } from '../../../components/ui/SoftBadge'
import { Button } from '../../../components/ui/Button'
import { FormField, Input } from '../../../components/ui/FormControls'
import { inputClassName } from '../../../lib/uiTokens'
import type { FieldDispatch, FieldDispatchAction, IncidentDetail } from '../../../types/api'
import { formatDateTime } from '../../../lib/datetime'

type Props = {
  incidentId: number
  active: boolean
  dispatch: FieldDispatch | null | undefined
  history?: FieldDispatch[]
  readOnly?: boolean
}

const ACTION_BUTTONS: Array<{
  action: FieldDispatchAction
  label: string
  variant: 'primary' | 'secondary' | 'danger'
  when: (d: FieldDispatch | null | undefined) => boolean
}> = [
  {
    action: 'PLAN',
    label: 'Planificar desplazamiento',
    variant: 'primary',
    when: (d) => !d || !d.is_active,
  },
  {
    action: 'DISPATCH',
    label: 'Despachar',
    variant: 'secondary',
    when: (d) => d?.status === 'PLANNED',
  },
  {
    action: 'ARRIVE',
    label: 'Reportar en sitio',
    variant: 'secondary',
    when: (d) => d?.status === 'PLANNED' || d?.status === 'DISPATCHED',
  },
  {
    action: 'COMPLETE',
    label: 'Completar',
    variant: 'secondary',
    when: (d) => Boolean(d?.is_active),
  },
  {
    action: 'CANCEL',
    label: 'Cancelar desplazamiento',
    variant: 'danger',
    when: (d) => Boolean(d?.is_active),
  },
]

export function FieldDispatchPanel({
  incidentId,
  active,
  dispatch,
  history = [],
  readOnly = false,
}: Props) {
  const qc = useQueryClient()
  const [technician, setTechnician] = useState(dispatch?.technician_name ?? '')
  const [observation, setObservation] = useState('')
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: (payload: {
      action: FieldDispatchAction
      technician_name?: string
      observation?: string
    }) => endpoints.fieldDispatch(incidentId, payload),
    onSuccess: async (data: IncidentDetail) => {
      setError(null)
      setObservation('')
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['incidents', incidentId] }),
        qc.invalidateQueries({ queryKey: ['recoveries'] }),
        qc.invalidateQueries({ queryKey: ['dashboard'] }),
        qc.invalidateQueries({ queryKey: ['notifications'] }),
      ])
      qc.setQueryData(['incidents', incidentId], data)
      qc.setQueryData(['incidents', incidentId, 'history-drawer'], data)
    },
    onError: (err: unknown) => {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar el desplazamiento.')
    },
  })

  const submit = (action: FieldDispatchAction) => {
    const note = observation.trim()
    if (action === 'CANCEL' && !note) {
      setError('Indica el motivo de cancelación.')
      return
    }
    setError(null)
    mutation.mutate({
      action,
      technician_name: technician.trim() || undefined,
      observation: note || undefined,
    })
  }

  return (
    <section
      className={`rounded-xl border p-4 ${
        dispatch?.is_active
          ? 'border-cyan-200 bg-cyan-50/50'
          : 'border-slate-200 bg-slate-50/60'
      }`}
    >
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="inline-flex items-center gap-1.5 text-xs font-semibold tracking-wide text-slate-600 uppercase">
            <Truck className="h-3.5 w-3.5" aria-hidden />
            Desplazamiento a campo
          </h3>
          <p className="mt-1 text-sm text-slate-600">
            {active
              ? 'La recuperación técnica no cancela el personal movilizado.'
              : 'Planifica y sigue el estado del técnico sin confundirlo con PRTG.'}
          </p>
        </div>
        {dispatch?.status_label ? (
          <Badge tone={dispatch.is_active ? 'cyan' : dispatch.status === 'CANCELLED' ? 'danger' : 'neutral'}>
            {dispatch.status_label}
          </Badge>
        ) : (
          <Badge tone="neutral">Sin desplazamiento</Badge>
        )}
      </div>

      {dispatch?.is_active ? (
        <p className="mb-3 flex items-start gap-2 text-sm font-medium text-cyan-900">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          Personal movilizado · {dispatch.status_label}
          {dispatch.technician_name ? ` · ${dispatch.technician_name}` : ''}
        </p>
      ) : null}

      {!readOnly ? (
        <>
          <div className="mb-3 grid gap-3 sm:grid-cols-2">
            <FormField label="Técnico / cuadrilla">
              <Input
                value={technician}
                placeholder="Opcional"
                onChange={(e) => setTechnician(e.target.value)}
              />
            </FormField>
            <FormField label="Observación / motivo">
              <textarea
                className={`${inputClassName} min-h-[40px] resize-y`}
                value={observation}
                placeholder={dispatch?.is_active ? 'Obligatorio al cancelar…' : 'Opcional…'}
                onChange={(e) => setObservation(e.target.value)}
              />
            </FormField>
          </div>

          <div className="flex flex-wrap gap-2">
            {ACTION_BUTTONS.filter((b) => b.when(dispatch)).map((b) => (
              <Button
                key={b.action}
                type="button"
                size="sm"
                variant={b.variant}
                loading={mutation.isPending && mutation.variables?.action === b.action}
                disabled={mutation.isPending}
                onClick={() => submit(b.action)}
              >
                {b.label}
              </Button>
            ))}
          </div>
        </>
      ) : null}

      {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}

      {history.length > 1 ? (
        <ul className="mt-3 space-y-1 border-t border-slate-200/80 pt-3 text-xs text-slate-600">
          {history.slice(0, 5).map((item) => (
            <li key={item.id} className="flex flex-wrap gap-x-2">
              <span className="font-semibold">{item.status_label}</span>
              <span className="tabular-nums text-slate-400">
                {item.updated_at ? formatDateTime(item.updated_at) : ''}
              </span>
              {item.cancellation_reason ? <span>· {item.cancellation_reason}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}
