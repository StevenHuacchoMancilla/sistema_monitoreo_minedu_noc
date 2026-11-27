import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { PanelLeftClose, PanelLeftOpen, RefreshCw } from 'lucide-react'
import { BarraLateral } from './BarraLateral'
import { Boton } from '../components/ui/Boton'
import { BotonIcono } from '../components/ui/BotonIcono'
import { CampanaNotificaciones } from '../features/notifications/components/CampanaNotificaciones'
import { MuelleToastsOpsEnVivo } from '../features/restorations/components/MuelleToastsOpsEnVivo'
import { MenuUsuario } from '../features/auth/components/MenuUsuario'
import { AlternarTema } from '../features/theme/AlternarTema'

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
    throw new Error('useSidebar must be used within DisenoApp')
  }
  return ctx
}

export function DisenoApp({
  title,
  subtitle,
  children,
  lastUpdated,
  syncing,
  onRefresh,
  onSyncPrtg,
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
      <div className="min-h-screen overflow-x-hidden bg-noc-bg text-noc-text">
        <div className="flex min-h-screen min-w-0 w-full">
          <div className={`hidden shrink-0 transition-[width] duration-200 ease-out md:block ${collapsed ? 'w-[4.25rem]' : 'w-60'}`}>
            <BarraLateral />
          </div>

          {mobileOpen ? (
            <div className="fixed inset-0 z-40 flex md:hidden">
              <button
                type="button"
                className="absolute inset-0 bg-[#0b0d0f]/70"
                aria-label="Cerrar menú"
                onClick={() => setMobileOpen(false)}
              />
              <div className="relative z-50 h-full w-60 border-r border-noc-border">
                <BarraLateral onNavigate={() => setMobileOpen(false)} forceExpanded />
              </div>
            </div>
          ) : null}

          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            <div className="flex h-16 shrink-0 items-center gap-3 border-b border-noc-border-2 bg-noc-nav px-3 sm:px-4 md:px-5">
              <BotonIcono
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
              </BotonIcono>

              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] text-noc-faint">
                  NOC Loreto
                  {title ? (
                    <>
                      <span className="mx-1.5 text-noc-disabled">/</span>
                      <span className="text-noc-text">{title}</span>
                    </>
                  ) : null}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <AlternarTema />
                <CampanaNotificaciones />
                {healthSlot}
                {onRefresh ? (
                  <BotonIcono label="Actualizar" onClick={onRefresh} disabled={syncing}>
                    <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
                  </BotonIcono>
                ) : null}
                {onSyncPrtg ? (
                  <Boton type="button" size="sm" className="hidden sm:inline-flex" onClick={onSyncPrtg} disabled={syncing}>
                    PRTG
                  </Boton>
                ) : null}
                <MenuUsuario />
              </div>
            </div>

            <main className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-4 md:p-5 lg:p-6">
              <div className="mx-auto min-w-0 w-full max-w-[100%]">
              {!bare && title ? (
                <header className="mb-5 border-b border-noc-line pb-4">
                  {subtitle ? (
                    <p className="text-[11px] font-medium tracking-[0.14em] text-noc-faint uppercase">{subtitle}</p>
                  ) : null}
                  <h1 className="text-xl font-semibold tracking-tight text-noc-text">{title}</h1>
                  {lastUpdated ? (
                    <p className="mt-1 font-mono text-[11px] text-noc-faint tabular-nums">
                      Última actualización {lastUpdated}
                    </p>
                  ) : null}
                </header>
              ) : null}
              {children}
              </div>
            </main>
          </div>
        </div>
        <MuelleToastsOpsEnVivo />
      </div>
    </SidebarContext.Provider>
  )
}
