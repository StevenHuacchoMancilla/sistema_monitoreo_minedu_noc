import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, MessageSquarePlus, Wrench } from 'lucide-react'
import { endpoints } from '../../../api/endpoints'
import { Insignia } from '../../../components/ui/InsigniaSuave'
import { Boton } from '../../../components/ui/Boton'
import { FormField } from '../../../components/ui/ControlesFormulario'
import { inputClassName } from '../../../lib/tokensUi'
import type { RecoveryReviewAction } from '../types/recuperaciones'
import { formatDateTime } from '../../../lib/fechaHora'

type Props = {
  incidentId: number
  requiresReview: boolean
  recoveredWhileManaging: boolean
  reviewStatus: string | null | undefined
  reviewLabel: string | null | undefined
  reviewedAt?: string | null
}

const ACTIONS: Array<{
  action: Exclude<RecoveryReviewAction, 'CONTINUE_ONSITE' | 'CANCEL_DISPATCH' | 'ADD_NOTE'>
  label: string
  hint: string
  variant: 'primary' | 'secondary'
  icon: typeof CheckCircle2
}> = [
  {
    action: 'ACKNOWLEDGE',
    label: 'Confirmar recuperación',
    hint: 'Cierra la revisión. El estado técnico ya está recuperado.',
    variant: 'primary',
    icon: CheckCircle2,
  },
  {
    action: 'CONTINUE_MONITORING',
    label: 'Seguir en reporte',
    hint: 'Internet intermitente: mantiene la gestión en el reporte aunque PRTG ya haya subido.',
    variant: 'secondary',
    icon: Wrench,
  },
]

export function PanelRevisionRecuperacion({
  incidentId,
  requiresReview,
  recoveredWhileManaging,
  reviewStatus,
  reviewLabel,
  reviewedAt,
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
    if (requireObs && !note) {
      setError('Escribe una observación antes de guardar.')
      return
    }
    setError(null)
    review.mutate({ action, observation: note || undefined })
  }

  const badgeTone =
    requiresReview || (!reviewStatus && recoveredWhileManaging)
      ? 'warning'
      : reviewStatus === 'ACKNOWLEDGED'
        ? 'success'
        : 'info'

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-[13px] font-semibold text-slate-900 dark:text-slate-100">Pendiente de cierre</h3>
          <p className="mt-1 text-[12px] leading-snug text-slate-500 dark:text-slate-400">
            PRTG ya recuperó el enlace. Confirmá el cierre operativo o dejalo en el reporte si sigue intermitente.
          </p>
        </div>
        {reviewLabel ? (
          <Insignia tone={badgeTone}>{reviewLabel}</Insignia>
        ) : recoveredWhileManaging || requiresReview ? (
          <Insignia tone="warning">Pendiente de revisión</Insignia>
        ) : null}
      </div>

      {reviewedAt && !requiresReview ? (
        <p className="mb-3 text-[12px] text-slate-500 dark:text-slate-400">
          Revisado: {formatDateTime(reviewedAt)}
        </p>
      ) : null}

      {requiresReview ? (
        <div className="mb-3 grid gap-2 sm:grid-cols-2">
          {ACTIONS.map((item) => {
            const Icon = item.icon
            return (
              <Boton
                key={item.action}
                type="button"
                size="sm"
                variant={item.variant}
                loading={review.isPending && review.variables?.action === item.action}
                disabled={review.isPending}
                className="justify-start"
                title={item.hint}
                onClick={() => submit(item.action)}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                {item.label}
              </Boton>
            )
          })}
        </div>
      ) : null}

      <FormField label="Observación">
        <textarea
          className={`${inputClassName} !h-auto min-h-[72px] resize-y py-2`}
          value={observation}
          placeholder="Opcional · queda en el historial del caso"
          onChange={(e) => setObservation(e.target.value)}
        />
      </FormField>

      <div className="mt-2 flex flex-wrap gap-2">
        <Boton
          type="button"
          size="sm"
          variant="secondary"
          loading={review.isPending && review.variables?.action === 'ADD_NOTE'}
          disabled={review.isPending}
          onClick={() => submit('ADD_NOTE', true)}
        >
          <MessageSquarePlus className="h-3.5 w-3.5" aria-hidden />
          Agregar observación
        </Boton>
      </div>

      {error ? <p className="mt-2 text-[12px] font-medium text-red-600 dark:text-red-400">{error}</p> : null}
    </section>
  )
}
