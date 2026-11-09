import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell } from 'lucide-react'
import { IconButton } from '../../../components/ui/IconButton'
import { useAuth } from '../../auth/context/AuthContext'
import { usePermissions } from '../../auth/hooks/usePermissions'
import { P } from '../../auth/permissions'
import { IncidentManageModal } from '../../incidents/components/IncidentManageModal'
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
  const { can } = usePermissions()
  const canSee = can(P.incidentsView)
  const canManage = Boolean(user?.permissions?.includes('incidents.manage'))
  const alerts = useOperationalAlerts(60_000, canSee)
  const [open, setOpen] = useState(false)
  const [dismissed, setDismissed] = useState<Set<string>>(() => loadDismissed())
  const [manageId, setManageId] = useState<number | null>(null)
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

  const followCase = (alert: OperationalAlert) => {
    setOpen(false)
    if (canManage) {
      setManageId(alert.incident_id)
      return
    }
    navigate(alert.case_href ?? alert.href)
  }

  const goAll = () => {
    setOpen(false)
    navigate('/notifications')
  }

  if (!canSee) return null

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
              Recuperados en gestión
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
              Sin recuperaciones desde En gestión pendientes de cierre.
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
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="rounded-lg bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-blue-700"
                          onClick={() => followCase(alert)}
                        >
                          Seguir caso
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

      {manageId !== null ? (
        <IncidentManageModal
          incidentId={manageId}
          initialTab={canManage ? 'management' : 'summary'}
          readOnly={!canManage}
          onClose={() => {
            setManageId(null)
            void alerts.refetch()
          }}
        />
      ) : null}
    </div>
  )
}
