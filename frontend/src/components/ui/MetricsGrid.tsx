import type { ReactNode } from 'react'

/**
 * Grilla responsive para MetricCard / KPIs.
 * Evita aplastar iconos: celdas con mínimo usable y auto-fit.
 */
export function MetricsGrid({
  children,
  className = '',
  dense = false,
}: {
  children: ReactNode
  className?: string
  /** Más columnas en pantallas anchas (p. ej. 5–6 KPIs). */
  dense?: boolean
}) {
  const cols = dense
    ? 'grid-cols-1 min-[420px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 min-[1600px]:grid-cols-6'
    : 'grid-cols-1 min-[420px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'

  return <div className={`mb-5 grid min-w-0 gap-3 ${cols} ${className}`}>{children}</div>
}
