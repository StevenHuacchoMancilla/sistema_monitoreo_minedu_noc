import type { ReactNode } from 'react'

/**
 * Riel de indicadores: una sola superficie, separada por líneas.
 */
export function GrillaMetricas({
  children,
  className = '',
  dense = false,
}: {
  children: ReactNode
  className?: string
  dense?: boolean
}) {
  const cols = dense
    ? 'grid-cols-2 md:grid-cols-3 xl:grid-cols-5'
    : 'grid-cols-2 lg:grid-cols-4'

  return (
    <div
      className={`noc-card mb-4 grid min-w-0 overflow-hidden rounded-xl border border-noc-border ${cols} [&>article]:border-b [&>article]:border-noc-line [&>article:nth-child(odd)]:border-r md:[&>article]:border-r ${className}`}
    >
      {children}
    </div>
  )
}
