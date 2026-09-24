import { useMemo, useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import {
  Activity,
  CalendarClock,
  ClipboardList,
  GraduationCap,
  History,
  TriangleAlert,
} from 'lucide-react'
import { AppLayout } from '../../../layouts/AppLayout'
import { PageHeader } from '../../../components/ui/PageHeader'
import { SectionCard } from '../../../components/ui/Card'
import { Badge } from '../../../components/ui/SoftBadge'
import { EmptyState, ErrorState, LoadingState } from '../../../components/ui/States'
import { techBadgeClass } from '../../../lib/uiTokens'
import { useAuth } from '../../auth/context/AuthContext'
import { ApiError } from '../../../api/client'
import { fetchTrackingDetail, postTrackingUpdate, closeTracking, reopenTracking, acknowledgeTrackingRecovery } from '../api/trackingApi'
import { TrackingTimeline } from '../components/TrackingTimeline'
import { TrackingUpdateComposer } from '../components/TrackingUpdateComposer'
import { TrackingLifecyclePanel } from '../components/TrackingLifecyclePanel'
import { TrackingTicketCard } from '../components/TrackingTicketCard'
import { formatDuration } from '../lib/format'
import { trackingStatusTone } from '../lib/trackingStatus'

export function TrackingDetailPage() {
  const { id } = useParams()
  const trackingId = Number(id)
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<'seguimiento' | 'actividad'>('seguimiento')

  const detail = useQuery({
    queryKey: ['tracking', 'detail', trackingId],
    queryFn: () => fetchTrackingDetail(trackingId),
    enabled: Number.isFinite(trackingId) && trackingId > 0,
    refetchInterval: (q) => {
      const status = q.state.data?.data?.status
      return status && status !== 'CLOSED' ? 12_000 : false
    },
  })

  const addUpdate = useMutation({
    mutationFn: (body: string) => postTrackingUpdate(trackingId, { body }),
    onSuccess: (res) => {
      queryClient.setQueryData(['tracking', 'detail', trackingId], res)
      void queryClient.invalidateQueries({ queryKey: ['tracking', 'list'] })
    },
  })

  const lifecycle = useMutation({
    mutationFn: async (
      action:
        | { type: 'close'; payload: { lock_version: number; closing_note?: string } }
        | { type: 'reopen'; payload: { lock_version: number; note?: string } }
        | { type: 'ack'; payload: { lock_version: number; note?: string } },
    ) => {
      if (action.type === 'close') return closeTracking(trackingId, action.payload)
      if (action.type === 'reopen') return reopenTracking(trackingId, action.payload)
      return acknowledgeTrackingRecovery(trackingId, action.payload)
    },
    onSuccess: (res) => {
      queryClient.setQueryData(['tracking', 'detail', trackingId], res)
      void queryClient.invalidateQueries({ queryKey: ['tracking', 'list'] })
    },
  })

  const applyLifecycle = async (
    action:
      | { type: 'close'; payload: { lock_version: number; closing_note?: string } }
      | { type: 'reopen'; payload: { lock_version: number; note?: string } }
      | { type: 'ack'; payload: { lock_version: number; note?: string } },
  ) => {
    try {
      await lifecycle.mutateAsync(action)
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.status === 409 && typeof e.body === 'object' && e.body && 'data' in e.body) {
          queryClient.setQueryData(['tracking', 'detail', trackingId], {
            data: (e.body as { data: typeof data }).data,
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

  const prtgTone = useMemo(() => {
    const s = data?.prtg?.normalized_status
    if (s === 'CAIDO') return 'danger' as const
    if (s === 'OPERATIVO') return 'success' as const
    return 'neutral' as const
  }, [data?.prtg?.normalized_status])

  if (!Number.isFinite(trackingId) || trackingId <= 0) {
    return (
      <AppLayout bare>
        <EmptyState title="Tracking inválido" description="El identificador no es válido." />
      </AppLayout>
    )
  }

  return (
    <AppLayout
      bare
      onRefresh={() => void detail.refetch()}
      syncing={detail.isFetching}
    >
      {detail.isLoading ? <LoadingState /> : null}
      {detail.isError ? (
        <ErrorState
          message={detail.error instanceof Error ? detail.error.message : 'No se pudo cargar el Tracking'}
        />
      ) : null}

      {data ? (
        <>
          <PageHeader
            icon={<ClipboardList className="h-5 w-5" aria-hidden />}
            title={`Tracking #${data.incident_number ?? data.id}`}
            description={data.description || 'Seguimiento operativo'}
            breadcrumb={
              <Link to="/tracking" className="text-sm font-medium text-violet-700 hover:underline">
                ← Tracking General
              </Link>
            }
            badges={
              <>
                <Badge tone={trackingStatusTone(data.status)}>{data.status_label || data.status}</Badge>
                <Badge tone={prtgTone}>{data.prtg.status_label || 'PRTG sin dato'}</Badge>
                {data.network_assignment?.tecnologia_acceso ? (
                  <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${techBadgeClass(data.network_assignment.tecnologia_acceso)}`}>
                    {data.network_assignment.tecnologia_acceso}
                  </span>
                ) : null}
              </>
            }
          />

          <div className="mb-4 flex flex-wrap gap-2 text-sm">
            {data.school ? (
              <Link
                to={`/schools/${data.school.id}`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <GraduationCap className="h-3.5 w-3.5" aria-hidden />
                Ver ficha maestra
              </Link>
            ) : null}
            {data.incident_id ? (
              <Link
                to={`/incidents/active`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                title={`Incidencia #${data.incident_id}`}
              >
                <TriangleAlert className="h-3.5 w-3.5" aria-hidden />
                Incidencia PRTG #{data.incident_id}
              </Link>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-slate-200 px-2.5 py-1.5 text-slate-500 dark:border-slate-700 dark:text-slate-400">
                Sin incidencia PRTG vinculada
              </span>
            )}
          </div>

          {data.status === 'TECHNICALLY_RECOVERED' ? (
            <div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50/80 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-100">
              <p className="font-semibold">PRTG recuperó el enlace (recuperación técnica).</p>
              <p className="mt-0.5 text-emerald-800/90 dark:text-emerald-200/80">
                El Tracking permanece abierto hasta el cierre operativo del NOC. No se cierra automáticamente.
              </p>
            </div>
          ) : null}

          <TrackingTicketCard tracking={data} />

          <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryTile label="TSS" value={data.tss_snapshot || '—'} />
            <SummaryTile label="CID" value={data.cid_snapshot || '—'} />
            <SummaryTile label="Duración" value={formatDuration(data.duration_seconds)} />
            <SummaryTile
              label="Estado técnico PRTG"
              value={data.prtg.status_label || '—'}
              hint={data.school?.local_educativo || undefined}
            />
            <SummaryTile label="Apertura" value={data.opened_at_display || '—'} hint={data.opened_by_name || undefined} />
            <SummaryTile
              label="Cierre"
              value={data.closed_at_display || '—'}
              hint={data.closed_by_name || undefined}
            />
            <SummaryTile
              label="Local educativo"
              value={data.school?.local_educativo || '—'}
              hint={
                [data.network_assignment?.prtg_province, data.network_assignment?.prtg_district]
                  .filter(Boolean)
                  .join(' · ') || undefined
              }
            />
            <SummaryTile label="N°" value={String(data.incident_number ?? data.id)} />
          </div>

          <div className="mb-4 flex gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1 w-fit dark:border-slate-700 dark:bg-slate-900">
            <TabButton active={tab === 'seguimiento'} onClick={() => setTab('seguimiento')} icon={<Activity className="h-3.5 w-3.5" />}>
              Seguimiento
            </TabButton>
            <TabButton active={tab === 'actividad'} onClick={() => setTab('actividad')} icon={<History className="h-3.5 w-3.5" />}>
              Actividad
            </TabButton>
          </div>

          {tab === 'seguimiento' ? (
            <div className="grid gap-4 lg:grid-cols-[1fr]">
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
              <SectionCard title="Timeline de seguimiento" accent="prtg">
                <TrackingTimeline updates={data.updates} />
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
          ) : (
            <SectionCard title="Actividad" action={<CalendarClock className="h-4 w-4 text-slate-400" />}>
              <ul className="space-y-3">
                {data.activity.map((item, i) => (
                  <li key={`${item.kind}-${i}`} className="rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2.5 dark:border-slate-800 dark:bg-slate-900/50">
                    <div className="flex flex-wrap gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <span className="font-semibold tabular-nums">{item.display || '—'}</span>
                      <span className="font-medium text-slate-800 dark:text-slate-200">{item.actor || 'Sistema'}</span>
                      <span className="rounded bg-white px-1.5 py-0.5 font-semibold text-slate-600 ring-1 ring-slate-200 dark:bg-slate-950 dark:text-slate-300 dark:ring-slate-700">
                        {item.label}
                      </span>
                    </div>
                    {item.body ? (
                      <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300">{item.body}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </SectionCard>
          )}
        </>
      ) : null}
    </AppLayout>
  )
}

function SummaryTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <p className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">{label}</p>
      <p className="mt-1 truncate text-sm font-bold text-slate-950 dark:text-slate-50" title={value}>
        {value}
      </p>
      {hint ? (
        <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400" title={hint}>
          {hint}
        </p>
      ) : null}
    </article>
  )
}

function TabButton({
  active,
  onClick,
  children,
  icon,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
  icon: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition',
        active
          ? 'bg-white text-violet-700 shadow-sm dark:bg-slate-800 dark:text-violet-300'
          : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100',
      ].join(' ')}
    >
      {icon}
      {children}
    </button>
  )
}
