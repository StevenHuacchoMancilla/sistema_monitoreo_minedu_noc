import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Bell, Truck } from 'lucide-react'
import { IconButton } from '../../../components/ui/IconButton'
import { endpoints } from '../../../api/endpoints'
import { useAuth } from '../../auth/context/AuthContext'
import { useOperationalAlerts } from '../hooks/useOperationalAlerts'
import type { OperationalAlert } from '../types/alerts'

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

export function NotificationBell() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const canManage = Boolean(user?.permissions?.includes('recoveries.manage'))
  const alerts = useOperationalAlerts()
  const client = useQueryClient()
  const [open, setOpen] = useState(false)
  const [dismissed, setDismissed] = useState<Set<string>>(() => loadDismissed())
  const [busyId, setBusyId] = useState<string | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)

  const visible = useMemo(
    () => (alerts.data?.data ?? []).filter((a) => !dismissed.has(a.id)),
    [alerts.data?.data, dismissed],
  )
  const dangerCount = visible.filter((a) => a.severity === 'danger').length
  const count = visible.length

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const dismiss = (id: string) => {
    setDismissed((prev) => {
      const next = new Set(prev)
      next.add(id)
      saveDismissed(next)
      return next
    })
  }

  const openAlert = (alert: OperationalAlert) => {
    setOpen(false)
    navigate(alert.href)
  }

  const goAll = () => {
    setOpen(false)
    navigate('/notifications')
  }

  const keepInReport = useMutation({
    mutationFn: (incidentId: number) =>
      endpoints.recoveryReview(incidentId, { action: 'CONTINUE_MONITORING' }),
    onSuccess: async (_data, incidentId) => {
      const alert = visible.find((a) => a.incident_id === incidentId)
      if (alert) dismiss(alert.id)
      await Promise.all([
        client.invalidateQueries({ queryKey: ['notifications'] }),
        client.invalidateQueries({ queryKey: ['recoveries'] }),
        client.invalidateQueries({ queryKey: ['dashboard'] }),
        client.invalidateQueries({ queryKey: ['reports'] }),
        client.invalidateQueries({ queryKey: ['tracking'] }),
      ])
    },
    onSettled: () => setBusyId(null),
  })

  return (
    <div className="relative" ref={panelRef}>
      <IconButton
        label={count > 0 ? `${count} alertas operativas` : 'Sin alertas operativas'}
        onClick={() => setOpen((v) => !v)}
        className={count > 0 ? (dangerCount > 0 ? 'text-red-600' : 'text-amber-600') : undefined}
      >
        <span className="relative inline-flex">
          <Bell className="h-4 w-4" aria-hidden />
          {count > 0 ? (
            <span
              className={`absolute -top-1.5 -right-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-0.5 text-[9px] font-bold text-white ${
                dangerCount > 0 ? 'bg-red-600' : 'bg-amber-500'
              }`}
            >
              {count > 9 ? '9+' : count}
            </span>
          ) : null}
        </span>
      </IconButton>

      {open ? (
        <div className="absolute right-0 z-50 mt-2 w-[min(22rem,calc(100vw-1.5rem))] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2 dark:border-slate-800">
            <p className="text-xs font-semibold tracking-wide text-slate-600 uppercase dark:text-slate-300">
              Alertas operativas
            </p>
            <button
              type="button"
              className="text-xs font-medium text-sky-700 hover:text-sky-900 dark:text-sky-300 dark:hover:text-sky-100"
              onClick={goAll}
            >
              Ver todas
            </button>
          </div>

          {alerts.isLoading ? (
            <p className="px-3 py-4 text-sm text-slate-500 dark:text-slate-400">Cargando…</p>
          ) : null}

          {!alerts.isLoading && count === 0 ? (
            <p className="px-3 py-4 text-sm text-slate-500 dark:text-slate-400">
              Sin recuperaciones pendientes de revisión.
            </p>
          ) : null}

          <ul className="max-h-80 overflow-y-auto">
            {visible.map((alert) => (
              <li key={alert.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                <div className="px-3 py-2.5">
                  <div className="flex items-start gap-2">
                    <span
                      className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
                        alert.severity === 'danger' ? 'bg-red-500' : 'bg-amber-400'
                      }`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{alert.title}</p>
                      <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">{alert.body}</p>
                      {alert.active_field_dispatch ? (
                        <p className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-red-700 dark:text-red-400">
                          <Truck className="h-3 w-3" aria-hidden />
                          Personal movilizado
                        </p>
                      ) : null}
                      <div className="mt-2 flex flex-wrap gap-2">
                        {canManage ? (
                          <button
                            type="button"
                            className="rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
                            disabled={keepInReport.isPending}
                            title="Mantener en reporte/gestión. Si cae otra vez, misma incidencia hasta cerrar Tracking."
                            onClick={() => {
                              setBusyId(alert.id)
                              keepInReport.mutate(alert.incident_id)
                            }}
                          >
                            {busyId === alert.id && keepInReport.isPending ? '…' : 'Seguir en reporte'}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="rounded-lg bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-blue-700"
                          onClick={() => openAlert(alert)}
                        >
                          Revisar
                        </button>
                        <button
                          type="button"
                          className="rounded-lg px-2.5 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                          onClick={() => dismiss(alert.id)}
                        >
                          Ocultar
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          {count > 0 ? (
            <div className="border-t border-slate-100 px-3 py-2 dark:border-slate-800">
              <button
                type="button"
                className="w-full rounded-lg py-1.5 text-center text-xs font-semibold text-sky-700 hover:bg-sky-50 dark:text-sky-300 dark:hover:bg-sky-950/40"
                onClick={goAll}
              >
                Abrir centro de notificaciones
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
