import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  CheckCircle2,
  MessageSquarePlus,
  TriangleAlert,
  Truck,
  Wrench,
} from 'lucide-react'
import { endpoints } from '../../../api/endpoints'
import { Badge } from '../../../components/ui/SoftBadge'
import { Button } from '../../../components/ui/Button'
import { FormField } from '../../../components/ui/FormControls'
import { inputClassName } from '../../../lib/uiTokens'
import type { RecoveryReviewAction } from '../types/recoveries'
import { formatDateTime } from '../../../lib/datetime'

type Props = {
  incidentId: number
  requiresReview: boolean
  recoveredWhileManaging: boolean
  reviewStatus: string | null | undefined
  reviewLabel: string | null | undefined
  reviewedAt?: string | null
  hadFieldTech?: boolean
  hasActiveDispatch?: boolean
}

const ACTIONS: Array<{
  action: RecoveryReviewAction
  label: string
  hint: string
  variant: 'primary' | 'secondary' | 'danger'
  icon: typeof CheckCircle2
  needsObservation?: boolean
  requiresActiveDispatch?: boolean
}> = [
  {
    action: 'ACKNOWLEDGE',
    label: 'Confirmar recuperación',
    hint: 'Cierra la revisión operativa. El estado técnico ya está recuperado.',
    variant: 'primary',
    icon: CheckCircle2,
  },
  {
    action: 'CONTINUE_MONITORING',
    label: 'Seguir en reporte',
    hint: 'Internet intermitente: mantiene el TIPO/gestión en reporte. Si cae otra vez, se reabre la misma incidencia hasta cerrar Tracking.',
    variant: 'secondary',
    icon: Wrench,
  },
  {
    action: 'CONTINUE_ONSITE',
    label: 'Continuar atención en sitio',
    hint: 'El personal debe seguir en campo pese a PRTG operativo.',
    variant: 'secondary',
    icon: Truck,
  },
  {
    action: 'CANCEL_DISPATCH',
    label: 'Cancelar desplazamiento',
    hint: 'Cancela el desplazamiento activo (decisión humana registrada).',
    variant: 'danger',
    icon: TriangleAlert,
    needsObservation: true,
    requiresActiveDispatch: true,
  },
]

export function RecoveryReviewPanel({
  incidentId,
  requiresReview,
  recoveredWhileManaging,
  reviewStatus,
  reviewLabel,
  reviewedAt,
  hadFieldTech = false,
  hasActiveDispatch = false,
}: Props) {
  const qc = useQueryClient()
  const [observation, setObservation] = useState('')
  const [error, setError] = useState<string | null>(null)

  const review = useMutation({
    mutationFn: (payload: { action: RecoveryReviewAction; observation?: string }) =>
      endpoints.recoveryReview(incidentId, payload),
    onSuccess: async () => {
      setError(null)
      setObservation('')
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['incidents', incidentId] }),
        qc.invalidateQueries({ queryKey: ['recoveries'] }),
        qc.invalidateQueries({ queryKey: ['notifications'] }),
        qc.invalidateQueries({ queryKey: ['dashboard'] }),
      ])
    },
    onError: (err: unknown) => {
      setError(err instanceof Error ? err.message : 'No se pudo registrar la revisión.')
    },
  })

  const submit = (action: RecoveryReviewAction, requireObs = false) => {
    const note = observation.trim()
    if ((requireObs || action === 'CANCEL_DISPATCH') && !note) {
      setError(
        action === 'CANCEL_DISPATCH'
          ? 'Indica el motivo de cancelación del desplazamiento.'
          : 'La observación es obligatoria.',
      )
      return
    }
    setError(null)
    review.mutate({ action, observation: note || undefined })
  }

  const visibleActions = ACTIONS.filter(
    (item) => !item.requiresActiveDispatch || hasActiveDispatch,
  )

  return (
    <section className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-xs font-semibold tracking-wide text-amber-900 uppercase">
            Revisión operativa
          </h3>
          <p className="mt-1 text-sm text-amber-950/80">
            PRTG cerró el estado técnico. La gestión humana requiere decisión del operador.
          </p>
        </div>
        {reviewLabel ? (
          <Badge tone={requiresReview ? 'warning' : reviewStatus === 'ACKNOWLEDGED' ? 'success' : 'info'}>
            {reviewLabel}
          </Badge>
        ) : recoveredWhileManaging ? (
          <Badge tone="warning">Pendiente de revisión</Badge>
        ) : null}
      </div>

      {hasActiveDispatch || hadFieldTech ? (
        <p className="mb-3 flex items-start gap-2 text-sm font-medium text-red-800">
          <Truck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {hasActiveDispatch
            ? 'Personal actualmente movilizado — la recuperación no cancela el desplazamiento.'
            : 'Hubo personal movilizado durante esta incidencia.'}
        </p>
      ) : null}

      {reviewedAt && !requiresReview ? (
        <p className="mb-3 text-xs text-slate-600">
          Revisado: {formatDateTime(reviewedAt)}
        </p>
      ) : null}

      {requiresReview ? (
        <div className="mb-3 grid gap-2 sm:grid-cols-2">
          {visibleActions.map((item) => {
            const Icon = item.icon
            return (
              <Button
                key={item.action}
                type="button"
                size="sm"
                variant={item.variant}
                loading={review.isPending && review.variables?.action === item.action}
                disabled={review.isPending}
                className="h-auto min-h-8 flex-col items-stretch gap-0.5 py-2 text-left"
                title={item.hint}
                onClick={() => submit(item.action, Boolean(item.needsObservation))}
              >
                <span className="inline-flex items-center gap-1.5">
                  <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  {item.label}
                </span>
              </Button>
            )
          })}
        </div>
      ) : null}

      <FormField label="Observación">
        <textarea
          className={`${inputClassName} min-h-[72px] resize-y`}
          value={observation}
          placeholder="Detalle opcional (obligatorio al cancelar desplazamiento o agregar observación)…"
          onChange={(e) => setObservation(e.target.value)}
        />
      </FormField>

      <div className="mt-2 flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          loading={review.isPending && review.variables?.action === 'ADD_NOTE'}
          disabled={review.isPending}
          onClick={() => submit('ADD_NOTE', true)}
        >
          <MessageSquarePlus className="h-3.5 w-3.5" aria-hidden />
          Agregar observación
        </Button>
      </div>

      {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
    </section>
  )
}
