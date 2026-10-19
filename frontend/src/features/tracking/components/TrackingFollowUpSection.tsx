import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '../../../api/client'
import { useAuth } from '../../auth/context/AuthContext'
import { SectionCard } from '../../../components/ui/Card'
import { EmptyState, ErrorState, LoadingState } from '../../../components/ui/States'
import {
  acknowledgeTrackingRecovery,
  closeTracking,
  deleteTrackingUpdate,
  fetchTrackingDetail,
  postTrackingUpdate,
  reopenTracking,
  updateTrackingCodigoCausa,
} from '../api/trackingApi'
import { TrackingCodigoCausaPanel } from './TrackingCodigoCausaPanel'
import { TrackingLifecyclePanel } from './TrackingLifecyclePanel'
import { TrackingTimeline } from './TrackingTimeline'
import { TrackingUpdateComposer } from './TrackingUpdateComposer'

type LifecycleAction =
  | { type: 'close'; payload: { lock_version: number; closing_note?: string } }
  | { type: 'reopen'; payload: { lock_version: number; note?: string } }
  | { type: 'ack'; payload: { lock_version: number; note?: string } }

/**
 * Seguimiento operativo embebible (En gestión / Incidencias).
 * Reutiliza los paneles del Tracking Detail.
 */
export function TrackingFollowUpSection({
  trackingId,
  onChanged,
}: {
  trackingId: number
  onChanged?: () => void
}) {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const detail = useQuery({
    queryKey: ['tracking', 'detail', trackingId],
    queryFn: () => fetchTrackingDetail(trackingId),
    enabled: Number.isFinite(trackingId) && trackingId > 0,
    refetchInterval: (q) => {
      const status = q.state.data?.data?.status
      return status && status !== 'CLOSED' ? 15_000 : false
    },
  })

  const bump = (res: Awaited<ReturnType<typeof fetchTrackingDetail>>) => {
    queryClient.setQueryData(['tracking', 'detail', trackingId], res)
    void queryClient.invalidateQueries({ queryKey: ['tracking', 'list'], refetchType: 'active' })
    onChanged?.()
  }

  const addUpdate = useMutation({
    mutationFn: (body: string) => postTrackingUpdate(trackingId, { body }),
    onSuccess: bump,
  })

  const removeUpdate = useMutation({
    mutationFn: (updateId: number) => deleteTrackingUpdate(trackingId, updateId),
    onSuccess: bump,
  })

  const saveCodigoCausa = useMutation({
    mutationFn: (payload: { codigo: string[]; causa: string; lock_version: number }) =>
      updateTrackingCodigoCausa(trackingId, payload),
    onSuccess: bump,
  })

  const lifecycle = useMutation({
    mutationFn: async (action: LifecycleAction) => {
      if (action.type === 'close') return closeTracking(trackingId, action.payload)
      if (action.type === 'reopen') return reopenTracking(trackingId, action.payload)
      return acknowledgeTrackingRecovery(trackingId, action.payload)
    },
    onSuccess: bump,
  })

  const applyLifecycle = async (action: LifecycleAction) => {
    try {
      await lifecycle.mutateAsync(action)
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.status === 409 && typeof e.body === 'object' && e.body && 'data' in e.body) {
          queryClient.setQueryData(['tracking', 'detail', trackingId], {
            data: (e.body as { data: unknown }).data,
          })
        }
        throw new Error(e.message)
      }
      throw e
    }
  }

  const data = detail.data?.data
  const canWrite = Boolean(user?.permissions?.includes('tracking.manage'))
  const canClose = Boolean(user?.permissions?.includes('tracking.close'))
  const canReopen = Boolean(user?.permissions?.includes('tracking.reopen'))

  if (detail.isLoading) return <LoadingState />
  if (detail.isError) {
    return (
      <ErrorState
        message={detail.error instanceof Error ? detail.error.message : 'No se pudo cargar el seguimiento'}
      />
    )
  }
  if (!data) {
    return <EmptyState title="Sin Tracking" description="Guarda una gestión TIPO 1/2/3 para abrir el seguimiento." />
  }

  return (
    <div className="grid gap-4">
      {data.status === 'TECHNICALLY_RECOVERED' ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-100">
          <p className="font-semibold">PRTG recuperó el enlace (recuperación técnica).</p>
          <p className="mt-0.5 text-emerald-800/90 dark:text-emerald-200/80">
            El ticket permanece abierto hasta el cierre operativo. No se cierra automáticamente.
          </p>
        </div>
      ) : null}

      <TrackingLifecyclePanel
        tracking={data}
        canWrite={canWrite}
        canClose={canClose}
        canReopen={canReopen}
        busy={lifecycle.isPending}
        onClose={(payload) => applyLifecycle({ type: 'close', payload })}
        onReopen={(payload) => applyLifecycle({ type: 'reopen', payload })}
        onAcknowledge={(payload) => applyLifecycle({ type: 'ack', payload })}
      />
      <TrackingCodigoCausaPanel
        codigoLetters={data.codigo_letters ?? []}
        causa={data.causa ?? null}
        lockVersion={data.lock_version}
        canWrite={canWrite}
        saving={saveCodigoCausa.isPending}
        error={
          saveCodigoCausa.isError
            ? saveCodigoCausa.error instanceof ApiError
              ? saveCodigoCausa.error.message
              : 'No se pudo guardar'
            : null
        }
        onSave={async (payload) => {
          await saveCodigoCausa.mutateAsync(payload)
        }}
      />
      <SectionCard title="Timeline de seguimiento" accent="prtg">
        <TrackingTimeline
          updates={data.updates}
          canDelete={canWrite}
          deletingId={removeUpdate.isPending ? removeUpdate.variables ?? null : null}
          onDelete={(updateId) => removeUpdate.mutate(updateId)}
        />
      </SectionCard>
      <TrackingUpdateComposer
        disabled={!data.can_add_update || !canWrite}
        submitting={addUpdate.isPending}
        onSubmit={async (body) => {
          try {
            await addUpdate.mutateAsync(body)
          } catch (e) {
            if (e instanceof ApiError) {
              const msg =
                typeof e.body === 'object' &&
                e.body &&
                'errors' in e.body &&
                typeof (e.body as { errors?: { body?: string[] } }).errors?.body?.[0] === 'string'
                  ? (e.body as { errors: { body: string[] } }).errors.body[0]
                  : e.message
              throw new Error(msg)
            }
            throw e
          }
        }}
      />
    </div>
  )
}
