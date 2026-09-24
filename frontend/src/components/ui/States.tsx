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
    <div className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-10 text-center dark:border-slate-800 dark:bg-slate-900">
      {icon ? (
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-violet-50 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300">
          {icon}
        </div>
      ) : null}
      <p className="font-semibold text-slate-900 dark:text-slate-100">{title}</p>
      {description ? <p className="mx-auto mt-1.5 max-w-md text-sm text-slate-500 dark:text-slate-400">{description}</p> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  )
}

export function LoadingState({ label = 'Cargando…' }: { label?: string }) {
  return <p className="text-sm text-slate-500 dark:text-slate-400">{label}</p>
}

export function ErrorState({ message }: { message: string }) {
  return <p className="text-sm text-red-600 dark:text-red-400">{message}</p>
}
