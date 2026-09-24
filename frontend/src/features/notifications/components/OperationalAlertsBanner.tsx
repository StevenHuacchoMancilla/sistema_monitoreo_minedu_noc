import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { TriangleAlert, X } from 'lucide-react'
import { useOperationalAlerts } from '../hooks/useOperationalAlerts'

/**
 * Banner compacto bajo el topbar cuando hay recuperaciones con personal movilizado.
 */
export function OperationalAlertsBanner() {
  const alerts = useOperationalAlerts()
  const [hidden, setHidden] = useState(false)

  const urgent = useMemo(
    () => (alerts.data?.data ?? []).filter((a) => a.active_field_dispatch),
    [alerts.data?.data],
  )

  if (hidden || urgent.length === 0) return null

  const first = urgent[0]

  return (
    <div className="flex items-start gap-3 border-b border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-950 sm:px-4 md:px-6 dark:border-red-900/60 dark:bg-red-950/50 dark:text-red-100">
      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">
          {urgent.length === 1
            ? 'Recuperación con personal movilizado'
            : `${urgent.length} recuperaciones con personal movilizado`}
        </p>
        <p className="mt-0.5 text-red-900/80 dark:text-red-200/80">
          {first.body}
          {urgent.length > 1 ? ` · +${urgent.length - 1} más` : ''}
          {' · '}
          PRTG no cancela el desplazamiento automáticamente.
        </p>
        <div className="mt-1.5 flex flex-wrap gap-3">
          <Link
            to={first.href}
            className="font-semibold text-red-800 underline-offset-2 hover:underline dark:text-red-200"
          >
            Revisar ahora
          </Link>
          {urgent.length > 1 ? (
            <Link
              to="/recoveries?review_status=PENDING_REVIEW"
              className="font-medium text-red-700/80 underline-offset-2 hover:underline dark:text-red-300/80"
            >
              Ver cola
            </Link>
          ) : null}
        </div>
      </div>
      <button
        type="button"
        className="rounded-lg p-1 text-red-700/70 hover:bg-red-100 hover:text-red-900 dark:text-red-300/70 dark:hover:bg-red-900/40 dark:hover:text-red-100"
        aria-label="Ocultar banner"
        onClick={() => setHidden(true)}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
