import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Bell, CheckCircle2, ClipboardList, FileSpreadsheet, Truck } from 'lucide-react'
import { AppLayout } from '../../../layouts/AppLayout'
import { PageHeader } from '../../../components/ui/PageHeader'
import { SectionCard } from '../../../components/ui/Card'
import { Button } from '../../../components/ui/Button'
import { Badge } from '../../../components/ui/SoftBadge'
import { EmptyState, ErrorState, LoadingState } from '../../../components/ui/States'
import { endpoints } from '../../../api/endpoints'
import { useAuth } from '../../auth/context/AuthContext'
import { useOperationalAlerts } from '../hooks/useOperationalAlerts'
import type { OperationalAlert } from '../types/alerts'
import { formatDateTime } from '../../../lib/datetime'

const DISMISS_KEY = 'noc.alerts.dismissed'

function loadDismissed(): Set<string> {
  try {
    const raw = sessionStorage.getItem(DISMISS_KEY)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw) as string[]
    return new Set(Array.isArray(parsed) ? parsed : [])
  } catch {
    return new Set()
  }
}

function saveDismissed(ids: Set<string>) {
  try {
    sessionStorage.setItem(DISMISS_KEY, JSON.stringify([...ids]))
  } catch {
    /* ignore */
  }
}

/**
 * Centro de notificaciones: recuperaciones que requieren decisión del NOC.
 * Incluye “Seguir en reporte” para internet intermitente.
 */
export function NotificationsPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const canManage = Boolean(user?.permissions?.includes('recoveries.manage'))
  const alerts = useOperationalAlerts(30_000)
  const client = useQueryClient()
  const [dismissed, setDismissed] = useState<Set<string>>(() => loadDismissed())
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const rows = useMemo(
    () => (alerts.data?.data ?? []).filter((a) => !dismissed.has(a.id)),
    [alerts.data?.data, dismissed],
  )

  const review = useMutation({
    mutationFn: (payload: { incidentId: number; action: 'CONTINUE_MONITORING' | 'ACKNOWLEDGE' }) =>
      endpoints.recoveryReview(payload.incidentId, { action: payload.action }),
    onSuccess: async () => {
      setError(null)
      await Promise.all([
        client.invalidateQueries({ queryKey: ['notifications'] }),
        client.invalidateQueries({ queryKey: ['recoveries'] }),
        client.invalidateQueries({ queryKey: ['dashboard'] }),
        client.invalidateQueries({ queryKey: ['reports'] }),
        client.invalidateQueries({ queryKey: ['tracking'] }),
      ])
    },
    onError: (err: unknown) => {
      setError(err instanceof Error ? err.message : 'No se pudo registrar la acción.')
    },
    onSettled: () => setBusyId(null),
  })

  const dismiss = (id: string) => {
    setDismissed((prev) => {
      const next = new Set(prev)
      next.add(id)
      saveDismissed(next)
      return next
    })
  }

  const runAction = (alert: OperationalAlert, action: 'CONTINUE_MONITORING' | 'ACKNOWLEDGE') => {
    if (!canManage) return
    setBusyId(`${alert.id}:${action}`)
    setError(null)
    review.mutate(
      { incidentId: alert.incident_id, action },
      {
        onSuccess: () => dismiss(alert.id),
      },
    )
  }

  return (
    <AppLayout bare>
      <PageHeader
        title="Notificaciones"
        description="Recuperaciones que requieren decisión del NOC. Usa “Seguir en reporte” si el colegio puede seguir inestable."
        icon={<Bell className="h-5 w-5" aria-hidden />}
        actions={
          <Badge tone={rows.length > 0 ? 'warning' : 'neutral'}>
            {rows.length} pendiente{rows.length === 1 ? '' : 's'}
          </Badge>
        }
      />

      {error ? <p className="mb-3 text-sm text-red-600 dark:text-red-400">{error}</p> : null}

      {alerts.isLoading ? <LoadingState /> : null}
      {alerts.isError ? (
        <ErrorState message={alerts.error instanceof Error ? alerts.error.message : 'Error al cargar'} />
      ) : null}

      {!alerts.isLoading && !alerts.isError && rows.length === 0 ? (
        <EmptyState
          title="Sin notificaciones pendientes"
          description="No hay recuperaciones esperando revisión operativa."
        />
      ) : null}

      {rows.length > 0 ? (
        <SectionCard title="Alertas operativas" accent="prtg">
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {rows.map((alert) => (
              <li key={alert.id} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${
                        alert.severity === 'danger' ? 'bg-red-500' : 'bg-amber-400'
                      }`}
                    />
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{alert.title}</p>
                    {alert.management_classification_label ? (
                      <Badge tone="neutral">{alert.management_classification_label}</Badge>
                    ) : null}
                    {alert.active_field_dispatch ? (
                      <Badge tone="danger">
                        <span className="inline-flex items-center gap-1">
                          <Truck className="h-3 w-3" aria-hidden />
                          Despacho activo
                        </span>
                      </Badge>
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{alert.body}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {alert.cid ? `CID ${alert.cid}` : 'Sin CID'}
                    {alert.recovered_at ? ` · Recuperado ${formatDateTime(alert.recovered_at)}` : ''}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 sm:justify-end">
                  {canManage ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      loading={busyId === `${alert.id}:CONTINUE_MONITORING`}
                      disabled={review.isPending}
                      title="Mantener TIPO/gestión en reporte. Si cae otra vez, se reabre la misma incidencia hasta cerrar Tracking."
                      onClick={() => runAction(alert, 'CONTINUE_MONITORING')}
                    >
                      <FileSpreadsheet className="h-3.5 w-3.5" aria-hidden />
                      Seguir en reporte
                    </Button>
                  ) : null}
                  {canManage ? (
                    <Button
                      type="button"
                      size="sm"
                      loading={busyId === `${alert.id}:ACKNOWLEDGE`}
                      disabled={review.isPending}
                      onClick={() => runAction(alert, 'ACKNOWLEDGE')}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                      Confirmar recuperación
                    </Button>
                  ) : null}
                  <Button type="button" size="sm" variant="secondary" onClick={() => navigate(alert.href)}>
                    Revisar
                  </Button>
                  {alert.tracking_id ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => navigate(`/tracking/${alert.tracking_id}`)}
                    >
                      <ClipboardList className="h-3.5 w-3.5" aria-hidden />
                      Tracking
                    </Button>
                  ) : null}
                  <Button type="button" size="sm" variant="ghost" onClick={() => dismiss(alert.id)}>
                    Ocultar
                  </Button>
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-wrap gap-3 border-t border-slate-100 pt-3 text-sm dark:border-slate-800">
            <Link to="/recoveries?review_status=PENDING_REVIEW" className="font-medium text-sky-700 hover:underline dark:text-sky-300">
              Ver cola de recuperados
            </Link>
            <Link to="/tracking" className="font-medium text-slate-600 hover:underline dark:text-slate-300">
              Tracking general
            </Link>
          </div>
        </SectionCard>
      ) : null}
    </AppLayout>
  )
}
