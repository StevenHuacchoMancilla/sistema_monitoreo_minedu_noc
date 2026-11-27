import type { ReactNode } from 'react'

export function EmptyState({
  title,
  description,
  icon,
  action,
}: {
  title: string
  description?: string
  icon?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="rounded-md border border-dashed border-noc-border bg-noc-surface px-4 py-10 text-center">
      {icon ? (
        <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-md bg-noc-raised text-noc-faint">
          {icon}
        </div>
      ) : null}
      <p className="font-medium text-noc-text">{title}</p>
      {description ? <p className="mx-auto mt-1.5 max-w-md text-sm text-noc-muted">{description}</p> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  )
}

export function LoadingState({ label = 'Cargando…' }: { label?: string }) {
  return (
    <div className="space-y-3" role="status" aria-live="polite">
      <p className="text-sm text-noc-faint">{label}</p>
      <div className="grid gap-px overflow-hidden rounded-md border border-noc-border bg-noc-line sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-16 animate-pulse bg-noc-surface" />
        ))}
      </div>
    </div>
  )
}

export function ErrorState({ message }: { message: string }) {
  return (
    <p className="rounded-md border border-noc-border bg-noc-surface px-3 py-2 text-sm text-noc-danger">
      {message}
    </p>
  )
}
