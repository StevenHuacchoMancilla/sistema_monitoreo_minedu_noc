import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { TriangleAlert, X } from 'lucide-react'
import { useOperationalAlerts } from '../hooks/useOperationalAlerts'

/**
 * Banner bajo el topbar: todas las recuperaciones pendientes de revisión / con despacho.
 */
export function OperationalAlertsBanner() {
  const alerts = useOperationalAlerts()
  const [hidden, setHidden] = useState(false)

  const rows = useMemo(() => alerts.data?.data ?? [], [alerts.data?.data])
  const urgent = useMemo(() => rows.filter((a) => a.active_field_dispatch), [rows])
  const others = useMemo(() => rows.filter((a) => !a.active_field_dispatch), [rows])

  if (hidden || rows.length === 0) return null

  const tone = urgent.length > 0
    ? 'border-red-200 bg-red-50 text-red-950 dark:border-red-900/60 dark:bg-red-950/50 dark:text-red-100'
    : 'border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100'

  return (
    <div className={`border-b px-3 py-2.5 text-sm sm:px-4 md:px-6 ${tone}`}>
      <div className="flex items-start gap-3">
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">
            {rows.length === 1
              ? rows[0].title
              : `${rows.length} recuperaciones requieren seguimiento`}
          </p>
          <ul className="mt-1.5 space-y-1">
            {rows.slice(0, 5).map((a) => (
              <li key={a.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[13px] opacity-90">
                <span className="font-medium tabular-nums">{a.cid ? `CID ${a.cid}` : a.local_educativo}</span>
                <span className="opacity-70">· {a.body}</span>
                <Link to={a.href} className="font-semibold underline-offset-2 hover:underline">
                  Abrir caso
                </Link>
                {a.active_field_dispatch ? (
                  <Link to="/tracking" className="font-medium underline-offset-2 hover:underline opacity-80">
                    Tracking
                  </Link>
                ) : (
                  <Link to="/tracking" className="font-medium underline-offset-2 hover:underline opacity-80">
                    Ir a Tracking
                  </Link>
                )}
              </li>
            ))}
          </ul>
          {rows.length > 5 ? (
            <p className="mt-1 text-xs opacity-70">+{rows.length - 5} más</p>
          ) : null}
          <div className="mt-1.5 flex flex-wrap gap-3">
            <Link to="/recoveries?review_status=PENDING_REVIEW" className="font-semibold underline-offset-2 hover:underline">
              Ver cola de recuperados
            </Link>
            <Link to="/tracking" className="font-medium underline-offset-2 hover:underline opacity-90">
              Tracking pendientes ({alerts.data?.meta.pending_review ?? rows.length}
              {urgent.length ? ` · ${urgent.length} con despacho` : ''}
              {others.length && urgent.length ? ` · ${others.length} revisión` : ''})
            </Link>
          </div>
        </div>
        <button
          type="button"
          className="rounded-lg p-1 opacity-70 hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/10"
          aria-label="Ocultar banner"
          onClick={() => setHidden(true)}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
