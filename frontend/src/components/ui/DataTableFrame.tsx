import type { ReactNode } from 'react'

/**
 * Contenedor de tabla responsive: scroll horizontal solo aquí,
 * sin romper el layout global (requiere ancestros con min-w-0).
 */
export function DataTableFrame({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div className={`min-w-0 w-full ${className}`}>
      <div className="w-full max-w-full overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch]">
        {children}
      </div>
    </div>
  )
}
