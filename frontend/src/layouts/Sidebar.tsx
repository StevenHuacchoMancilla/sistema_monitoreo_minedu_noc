import { NavLink } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useDashboardSummary } from '../features/dashboard/hooks/useDashboard'

type NavItem = {
  to: string
  label: string
  end?: boolean
  badgeKey?: 'caidas_activas' | 'pendientes_contacto' | 'en_gestion' | 'concentraciones' | 'recuperados'
  tone?: 'danger' | 'warn' | 'info' | 'muted' | 'success'
  icon: ReactNode
}

function Icon({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center text-current opacity-80">
      {children}
    </span>
  )
}

const icons = {
  resumen: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  ),
  caidas: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
      <path d="M12 3 3 20h18L12 3Z" />
      <path d="M12 10v4" strokeLinecap="round" />
      <circle cx="12" cy="17" r="0.8" fill="currentColor" />
    </svg>
  ),
  phone: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
      <path
        d="M7 3h3l1.5 4.5-2 1.5a12 12 0 0 0 5.5 5.5l1.5-2L21 14v3a2 2 0 0 1-2 2A16 16 0 0 1 3 7a2 2 0 0 1 2-2Z"
        strokeLinejoin="round"
      />
    </svg>
  ),
  gear: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v2.2M12 18.8V21M4.9 6.3l1.6 1.6M17.5 16.1l1.6 1.6M3 12h2.2M18.8 12H21M4.9 17.7l1.6-1.6M17.5 7.9l1.6-1.6" strokeLinecap="round" />
    </svg>
  ),
  map: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
      <path d="M9 4 3 7v13l6-3 6 3 6-3V4l-6 3-6-3Z" strokeLinejoin="round" />
      <path d="M9 4v13M15 7v13" />
    </svg>
  ),
  check: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12.5 2.5 2.5 4.5-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  clock: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" strokeLinecap="round" />
    </svg>
  ),
  school: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
      <path d="m3 10 9-5 9 5-9 5-9-5Z" strokeLinejoin="round" />
      <path d="M7 12.5V17c0 .8 2.2 2 5 2s5-1.2 5-2v-4.5" />
    </svg>
  ),
  report: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
      <path d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
      <path d="M14 3v5h5M9 13h6M9 17h6" strokeLinecap="round" />
    </svg>
  ),
  admin: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20a7 7 0 0 1 14 0" strokeLinecap="round" />
    </svg>
  ),
}

const NAV: NavItem[] = [
  { to: '/', label: 'Resumen', end: true, icon: icons.resumen },
  { to: '/incidents/active', label: 'Caídas activas', badgeKey: 'caidas_activas', tone: 'danger', icon: icons.caidas },
  { to: '/incidents/pending', label: 'Pendientes de contacto', badgeKey: 'pendientes_contacto', tone: 'warn', icon: icons.phone },
  { to: '/incidents/managing', label: 'En gestión', badgeKey: 'en_gestion', tone: 'info', icon: icons.gear },
  { to: '/concentrations', label: 'Concentraciones zonales', badgeKey: 'concentraciones', tone: 'muted', icon: icons.map },
  { to: '/incidents/recovered', label: 'Historial por colegio', badgeKey: 'recuperados', tone: 'success', icon: icons.check },
  { to: '/history', label: 'Historial', icon: icons.clock },
  { to: '/schools', label: 'Locales educativos', icon: icons.school },
  { to: '/reports', label: 'Reportes', icon: icons.report },
  { to: '/admin', label: 'Administración', icon: icons.admin },
]

const toneClass: Record<NonNullable<NavItem['tone']>, string> = {
  danger: 'bg-[#ff3b30] text-white',
  warn: 'bg-[#ff9500] text-white',
  info: 'bg-[#007aff] text-white',
  muted: 'bg-[#8e8e93] text-white',
  success: 'bg-[#34c759] text-white',
}

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const summary = useDashboardSummary()
  const nav = summary.data?.nav

  return (
    <aside className="flex h-full w-[17.5rem] shrink-0 flex-col border-r border-noc-border/80 bg-noc-surface-2/90 backdrop-blur-xl">
      <div className="border-b border-noc-border/70 px-5 py-5">
        <div className="text-[15px] font-semibold tracking-tight text-noc-text">NOC Loreto</div>
        <p className="mt-0.5 text-xs text-noc-muted">Monitoreo LLEE · MINEDU</p>
      </div>
      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-4">
        <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-noc-muted">
          Operación
        </p>
        {NAV.map((item) => {
          const count = item.badgeKey && nav ? nav[item.badgeKey] : undefined
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={onNavigate}
              className={({ isActive }) =>
                `group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition ${
                  isActive
                    ? 'bg-noc-info/10 text-noc-info shadow-sm ring-1 ring-noc-info/15'
                    : 'text-noc-muted hover:bg-black/[0.04] hover:text-noc-text'
                }`
              }
            >
              <Icon>{item.icon}</Icon>
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              {typeof count === 'number' ? (
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums leading-none ${
                    toneClass[item.tone ?? 'muted']
                  }`}
                  title={String(count)}
                >
                  {count.toLocaleString('es-PE')}
                </span>
              ) : null}
            </NavLink>
          )
        })}
      </nav>
      <div className="border-t border-noc-border/70 px-5 py-4 text-[11px] text-noc-muted">
        Evidencia operativa · no causa automática
      </div>
    </aside>
  )
}
