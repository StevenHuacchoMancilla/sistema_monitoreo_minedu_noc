import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Bell, CheckCircle2, FileSpreadsheet } from 'lucide-react'
import { AppLayout } from '../../../layouts/AppLayout'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Button } from '../../../components/ui/Button'
import { Badge } from '../../../components/ui/SoftBadge'
import { ErrorState, LoadingState } from '../../../components/ui/States'
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
 * Avisos cuando un colegio que estaba en gestión se recupera y pasa a pendiente de cierre.
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
        description="Revisión de gestión: cuando un colegio en gestión se recupera y queda pendiente de cierre. Los avisos de restablecimiento (quién levantó) están en Restablecimientos."
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
        <section className="rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-16 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="mx-auto mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 dark:bg-slate-800">
            <Bell className="h-6 w-6" aria-hidden />
          </div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Sin notificaciones pendientes</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
            No hay colegios que hayan pasado de gestión a pendiente de cierre.
          </p>
        </section>
      ) : null}

      {rows.length > 0 ? (
        <ul className="grid gap-3">
          {rows.map((alert) => (
            <li
              key={alert.id}
              className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={alert.severity === 'danger' ? 'danger' : 'warning'}>Pendiente de cierre</Badge>
                  </div>
                  <p className="mt-2 text-base font-semibold text-slate-900 dark:text-slate-100">
                    {alert.local_educativo ?? alert.title}
                  </p>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{alert.body}</p>
                  <p className="mt-2 text-xs text-slate-500">
                    {alert.cid ? `CID ${alert.cid}` : 'Sin CID'}
                    {alert.codigo_local ? ` · ${alert.codigo_local}` : ''}
                    {alert.provincia ? ` · ${alert.provincia}` : ''}
                    {alert.recovered_at ? ` · Recuperado ${formatDateTime(alert.recovered_at)}` : ''}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 lg:justify-end">
                  {canManage ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      loading={busyId === `${alert.id}:CONTINUE_MONITORING`}
                      disabled={review.isPending}
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
                      Confirmar cierre
                    </Button>
                  ) : null}
                  <Button type="button" size="sm" variant="secondary" onClick={() => navigate(alert.href)}>
                    Ver caso
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => dismiss(alert.id)}>
                    Ocultar
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-4">
        <Link to="/incidents/pendiente-cierre" className="text-sm font-medium text-sky-700 hover:underline dark:text-sky-300">
          Ir a pendiente de cierre
        </Link>
      </div>
    </AppLayout>
  )
}
