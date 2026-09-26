import type { ReactNode } from 'react'
import { Button } from '../components/ui/Button'

export function Topbar({
  title,
  lastUpdated,
  syncing,
  onRefresh,
  onSyncPrtg,
  healthSlot,
}: {
  title: string
  lastUpdated?: string | null
  syncing?: boolean
  onRefresh?: () => void
  onSyncPrtg?: () => void
  healthSlot?: ReactNode
}) {
  return (
    <header className="mb-5 flex flex-col gap-3 border-b border-noc-border/70 pb-5 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-[0.08em] text-noc-muted">
          Monitoreo LLEE · Seguimiento PRTG
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-noc-text md:text-[28px]">{title}</h1>
        {lastUpdated ? (
          <p className="mt-1 text-xs text-noc-muted">Última actualización: {lastUpdated}</p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {healthSlot}
        <Button type="button" onClick={onRefresh} disabled={syncing}>
          Refrescar
        </Button>
        <Button type="button" variant="ghost" onClick={onSyncPrtg} disabled={syncing} title="Forzar sync PRTG">
          {syncing ? 'Sincronizando…' : 'Forzar PRTG'}
        </Button>
        <span className="hidden rounded-full bg-green-100 px-2.5 py-1 text-[11px] font-medium text-green-800 sm:inline">
          Sync en vivo
        </span>
      </div>
    </header>
  )
}
