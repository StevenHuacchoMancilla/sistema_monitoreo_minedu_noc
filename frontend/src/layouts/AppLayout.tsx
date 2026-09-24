import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { PanelLeftClose, PanelLeftOpen, RefreshCw } from 'lucide-react'
import { Sidebar } from './Sidebar'
import { Button } from '../components/ui/Button'
import { IconButton } from '../components/ui/IconButton'
import { NotificationBell } from '../features/notifications/components/NotificationBell'
import { OperationalAlertsBanner } from '../features/notifications/components/OperationalAlertsBanner'
import { UserMenu } from '../features/auth/components/UserMenu'
import { ThemeToggle } from '../features/theme/ThemeToggle'

const STORAGE_KEY = 'noc.sidebar.collapsed'

type SidebarCtx = {
  collapsed: boolean
  setCollapsed: (v: boolean) => void
  toggle: () => void
  mobileOpen: boolean
  setMobileOpen: (v: boolean) => void
}

const SidebarContext = createContext<SidebarCtx | null>(null)

export function useSidebar() {
  const ctx = useContext(SidebarContext)
  if (!ctx) {
    throw new Error('useSidebar must be used within AppLayout')
  }
  return ctx
}

export function AppLayout({
  title,
  subtitle,
  children,
  lastUpdated,
  syncing,
  onRefresh,
  onSyncPrtg,
  onSyncCloudnet,
  healthSlot,
  bare = false,
}: {
  title?: string
  subtitle?: string
  children: ReactNode
  lastUpdated?: string | null
  syncing?: boolean
  onRefresh?: () => void
  onSyncPrtg?: () => void
  onSyncCloudnet?: () => void
  healthSlot?: ReactNode
  bare?: boolean
}) {
  const [collapsed, setCollapsedState] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === '1'
    } catch {
      return false
    }
  })
  const [mobileOpen, setMobileOpen] = useState(false)

  const setCollapsed = (v: boolean) => {
    setCollapsedState(v)
    try {
      localStorage.setItem(STORAGE_KEY, v ? '1' : '0')
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault()
        setCollapsedState((prev) => {
          const next = !prev
          try {
            localStorage.setItem(STORAGE_KEY, next ? '1' : '0')
          } catch {
            /* ignore */
          }
          return next
        })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const ctx: SidebarCtx = {
    collapsed,
    setCollapsed,
    toggle: () => setCollapsed(!collapsed),
    mobileOpen,
    setMobileOpen,
  }

  return (
    <SidebarContext.Provider value={ctx}>
      <div className="min-h-screen overflow-x-hidden bg-slate-50 text-slate-950 dark:bg-slate-950 dark:text-slate-100">
        <div className="flex min-h-screen min-w-0 w-full">
          <div className={`hidden shrink-0 transition-[width] duration-200 md:block ${collapsed ? 'w-[4.5rem]' : 'w-[16.25rem]'}`}>
            <Sidebar />
          </div>

          {mobileOpen ? (
            <div className="fixed inset-0 z-40 flex md:hidden">
              <button
                type="button"
                className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
                aria-label="Cerrar menú"
                onClick={() => setMobileOpen(false)}
              />
              <div className="relative z-50 h-full w-[16.25rem] shadow-2xl">
                <Sidebar onNavigate={() => setMobileOpen(false)} forceExpanded />
              </div>
            </div>
          ) : null}

          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            <div className="flex shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-3 py-2.5 sm:px-4 md:px-6 dark:border-slate-800 dark:bg-slate-900">
              <IconButton
                label={collapsed ? 'Expandir menú' : 'Colapsar menú'}
                onClick={() => {
                  if (window.matchMedia('(min-width: 768px)').matches) {
                    setCollapsed(!collapsed)
                  } else {
                    setMobileOpen(true)
                  }
                }}
              >
                {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
              </IconButton>

              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-slate-500 dark:text-slate-400">
                  NOC Loreto
                  {title ? (
                    <>
                      <span className="mx-1.5 text-slate-300 dark:text-slate-600">/</span>
                      <span className="text-slate-700 dark:text-slate-200">{title}</span>
                    </>
                  ) : null}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <ThemeToggle />
                <NotificationBell />
                {healthSlot}
                {onRefresh ? (
                  <IconButton label="Actualizar" onClick={onRefresh} disabled={syncing}>
                    <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
                  </IconButton>
                ) : null}
                {onSyncPrtg ? (
                  <Button type="button" size="sm" className="hidden sm:inline-flex" onClick={onSyncPrtg} disabled={syncing}>
                    PRTG
                  </Button>
                ) : null}
                {onSyncCloudnet ? (
                  <Button type="button" size="sm" className="hidden sm:inline-flex" onClick={onSyncCloudnet} disabled={syncing}>
                    Cloudnet
                  </Button>
                ) : null}
                <UserMenu />
              </div>
            </div>

            <OperationalAlertsBanner />

            <main className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-4 md:p-6 lg:p-8">
              <div className="mx-auto min-w-0 w-full max-w-[100%]">
              {!bare && title ? (
                <header className="mb-6 border-b border-slate-200 pb-5 dark:border-slate-800">
                  {subtitle ? (
                    <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{subtitle}</p>
                  ) : null}
                  <h1 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl dark:text-slate-50">{title}</h1>
                  {lastUpdated ? (
                    <p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">
                      Última actualización: {lastUpdated}
                    </p>
                  ) : null}
                </header>
              ) : null}
              {children}
              </div>
            </main>
          </div>
        </div>
      </div>
    </SidebarContext.Provider>
  )
}
