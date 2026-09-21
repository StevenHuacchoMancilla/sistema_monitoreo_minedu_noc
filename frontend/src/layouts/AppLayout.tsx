import { useState, type ReactNode } from 'react'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'

export function AppLayout({
  title,
  children,
  lastUpdated,
  syncing,
  onRefresh,
  onSyncPrtg,
  onSyncCloudnet,
  healthSlot,
}: {
  title: string
  children: ReactNode
  lastUpdated?: string | null
  syncing?: boolean
  onRefresh?: () => void
  onSyncPrtg?: () => void
  onSyncCloudnet?: () => void
  healthSlot?: ReactNode
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="min-h-screen bg-noc-bg text-noc-text">
      <div className="flex min-h-screen">
        <div className="hidden md:block">
          <Sidebar />
        </div>

        {open ? (
          <div className="fixed inset-0 z-40 flex md:hidden">
            <button
              type="button"
              className="absolute inset-0 bg-black/30 backdrop-blur-[2px]"
              aria-label="Cerrar menú"
              onClick={() => setOpen(false)}
            />
            <div className="relative z-50 h-full shadow-2xl">
              <Sidebar onNavigate={() => setOpen(false)} />
            </div>
          </div>
        ) : null}

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-2 border-b border-noc-border/80 bg-noc-surface/90 px-4 py-2.5 backdrop-blur md:hidden">
            <button
              type="button"
              className="rounded-xl border border-noc-border bg-white px-3 py-1.5 text-sm font-medium shadow-sm"
              onClick={() => setOpen(true)}
            >
              Menú
            </button>
            <span className="text-sm font-semibold tracking-tight">NOC Loreto</span>
          </div>
          <main className="min-w-0 flex-1 overflow-x-hidden p-4 md:p-6 lg:p-8">
            <Topbar
              title={title}
              lastUpdated={lastUpdated}
              syncing={syncing}
              onRefresh={onRefresh}
              onSyncPrtg={onSyncPrtg}
              onSyncCloudnet={onSyncCloudnet}
              healthSlot={healthSlot}
            />
            {children}
          </main>
        </div>
      </div>
    </div>
  )
}
