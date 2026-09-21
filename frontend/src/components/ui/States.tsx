export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="rounded-lg border border-dashed border-noc-border px-4 py-8 text-center">
      <p className="font-medium text-noc-text">{title}</p>
      {description ? <p className="mt-1 text-sm text-noc-muted">{description}</p> : null}
    </div>
  )
}

export function LoadingState({ label = 'Cargando…' }: { label?: string }) {
  return <p className="text-sm text-noc-muted">{label}</p>
}

export function ErrorState({ message }: { message: string }) {
  return <p className="text-sm text-noc-danger">{message}</p>
}
