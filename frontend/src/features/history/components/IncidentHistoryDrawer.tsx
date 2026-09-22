import { useEffect, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { endpoints } from '../../../api/endpoints'
import { ErrorState, LoadingState } from '../../../components/ui/States'
import {
  ClassificationBadge,
  FollowupBadge,
  PrtgStatusBadge,
} from '../../../components/monitoring/StatusBadges'
import { Badge } from '../../../components/ui/SoftBadge'
import { Button } from '../../../components/ui/Button'
import { IncidentTimeline } from './IncidentTimeline'
import { RecoveryReviewPanel } from '../../recoveries/components/RecoveryReviewPanel'
import { FieldDispatchPanel } from '../../incidents/components/FieldDispatchPanel'

export function IncidentHistoryDrawer({
  incidentId,
  onClose,
}: {
  incidentId: number
  onClose: () => void
}) {
  const detail = useQuery({
    queryKey: ['incidents', incidentId, 'history-drawer'],
    queryFn: () => endpoints.incidentDetail(incidentId),
    enabled: Number.isFinite(incidentId) && incidentId > 0,
  })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const data = detail.data
  const schoolSnap = data?.snapshots?.school
  const networkSnap = data?.snapshots?.network

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        className="absolute inset-0 bg-slate-950/40 backdrop-blur-[1px]"
        aria-label="Cerrar detalle"
        onClick={onClose}
      />
      <aside className="relative z-10 flex h-full w-full max-w-xl flex-col border-l border-slate-200 bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Incidencia histórica</p>
            <h2 className="mt-1 text-lg font-bold text-slate-950">
              #{incidentId}
              {data?.antecedentes?.reincidencia?.label ? (
                <span className="ml-2 text-sm font-medium text-slate-500">
                  · {data.antecedentes.reincidencia.label}
                </span>
              ) : null}
            </h2>
            <p className="mt-0.5 truncate text-sm text-slate-600">
              {data?.colegio?.cid ? `CID${data.colegio.cid}` : '—'}
              {data?.colegio?.local_educativo ? ` · ${data.colegio.local_educativo}` : ''}
            </p>
          </div>
          <Button type="button" size="sm" variant="ghost" onClick={onClose} aria-label="Cerrar">
            <X className="h-4 w-4" />
          </Button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {detail.isLoading ? <LoadingState /> : null}
          {detail.isError ? (
            <ErrorState message={detail.error instanceof Error ? detail.error.message : 'Error'} />
          ) : null}

          {data ? (
            <div className="space-y-6">
              <section>
                <h3 className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">Resumen</h3>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Info label="Caída" value={fmt(data.estado.fecha_caida)} />
                  <Info
                    label="Recuperación"
                    value={
                      data.estado.recovered_at ? (
                        <span className="inline-flex flex-col gap-1">
                          <span>{fmt(data.estado.recovered_at)}</span>
                          {data.estado.same_day ? <Badge tone="success">Mismo día</Badge> : null}
                        </span>
                      ) : (
                        <span className="font-semibold text-red-700">Activa</span>
                      )
                    }
                  />
                  <Info label="Duración" value={data.estado.duracion ?? '—'} />
                  <Info
                    label="PRTG"
                    value={
                      <span className="inline-flex items-center gap-2">
                        <PrtgStatusBadge status={data.estado.estado_prtg} />
                        <FollowupBadge status={data.estado.followup_status} />
                      </span>
                    }
                  />
                  <Info
                    label="Clasificación"
                    value={
                      <ClassificationBadge
                        classification={data.gestion.management_classification}
                        label={data.gestion.management_classification_label}
                      />
                    }
                  />
                  <Info label="PEXT / PINT" value={data.gestion.management_scope ?? '—'} />
                </div>
              </section>

              <section>
                <h3 className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">Datos PRTG</h3>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Info label="Sensor" value={data.estado.prtg_sensor_objid ?? data.estado.sensor_id ?? '—'} />
                  <Info label="Dispositivo" value={data.colegio.nombre_prtg ?? '—'} />
                  <Info label="Última comprobación" value={fmt(data.estado.ultima_comprobacion)} />
                  <Info label="Estado texto" value={data.estado.estado_prtg_text ?? '—'} />
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  Ping / LAN / CPU / Memoria históricos: no disponibles si no fueron almacenados en el momento
                  de la incidencia.
                </p>
              </section>

              <section>
                <h3 className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">
                  Snapshot del colegio
                </h3>
                {schoolSnap || networkSnap ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Info label="Local (histórico)" value={str(schoolSnap?.local_educativo)} />
                    <Info label="Código local" value={str(schoolSnap?.codigo_local)} />
                    <Info label="CID (histórico)" value={str(networkSnap?.cid)} />
                    <Info label="Tecnología" value={str(networkSnap?.tecnologia_acceso)} />
                    <Info label="Nodo/POP" value={str(networkSnap?.nodo_pop)} />
                    <Info label="Nombre PRTG" value={str(networkSnap?.prtg_device_name)} />
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">No disponible históricamente.</p>
                )}
              </section>

              {(data.gestion.outage_text || data.gestion.detail_text) && (
                <section>
                  <h3 className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">Gestión actual</h3>
                  {data.gestion.outage_text ? (
                    <p className="text-sm text-slate-700">
                      <span className="font-semibold">Caída: </span>
                      {data.gestion.outage_text}
                    </p>
                  ) : null}
                  {data.gestion.detail_text ? (
                    <p className="mt-1 text-sm text-slate-700">
                      <span className="font-semibold">Detalle: </span>
                      {data.gestion.detail_text}
                    </p>
                  ) : null}
                </section>
              )}

              {data.estado.recovered_at ? (
                <RecoveryReviewPanel
                  incidentId={incidentId}
                  requiresReview={Boolean(data.estado.requires_review)}
                  recoveredWhileManaging={Boolean(data.estado.recovered_while_managing)}
                  reviewStatus={data.estado.recovery_review_status}
                  reviewLabel={data.estado.recovery_review_label}
                  reviewedAt={data.estado.recovery_reviewed_at}
                  hadFieldTech={Boolean(
                    data.estado.active_field_dispatch ||
                      data.estado.had_field_tech ||
                      data.field_dispatch?.is_active,
                  )}
                  hasActiveDispatch={Boolean(
                    data.estado.active_field_dispatch || data.field_dispatch?.is_active,
                  )}
                />
              ) : null}

              <FieldDispatchPanel
                incidentId={incidentId}
                active={Boolean(data.estado.recovered_at)}
                dispatch={data.field_dispatch}
                history={data.field_dispatches ?? []}
                readOnly={false}
              />

              <section>
                <h3 className="mb-3 text-xs font-semibold tracking-wide text-slate-500 uppercase">
                  Timeline operativo
                </h3>
                <IncidentTimeline events={data.timeline ?? []} />
              </section>
            </div>
          ) : null}
        </div>
      </aside>
    </div>
  )
}

function Info({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2">
      <p className="text-[10px] font-semibold tracking-wide text-slate-500 uppercase">{label}</p>
      <div className="mt-0.5 text-sm text-slate-900">{value ?? '—'}</div>
    </div>
  )
}

function fmt(value?: string | null): string {
  if (!value) return '—'
  return new Date(value).toLocaleString('es-PE')
}

function str(value: unknown): string {
  if (value == null || value === '') return '—'
  return String(value)
}
