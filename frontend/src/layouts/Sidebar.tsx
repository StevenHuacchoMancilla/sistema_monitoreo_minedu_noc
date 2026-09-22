import { NavLink } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'
import {
  Activity,
  Cloud,
  FileSpreadsheet,
  GraduationCap,
  History,
  LayoutDashboard,
  Map,
  PanelLeftClose,
  PanelLeftOpen,
  Phone,
  Settings,
  TriangleAlert,
  CircleCheck,
} from 'lucide-react'
import { usePrtgDashboard } from '../features/dashboard-prtg/hooks/usePrtgDashboard'
import { useSidebar } from './AppLayout'

type NavItem = {
  to: string
  label: string
  end?: boolean
  badgeKey?: 'caidas_activas' | 'pendientes_contacto' | 'en_gestion' | 'concentraciones' | 'recuperados'
  tone?: 'danger' | 'warn' | 'info' | 'muted' | 'success'
  icon: LucideIcon
  accent?: 'prtg' | 'cloudnet'
}

const NAV: NavItem[] = [
  { to: '/dashboard/prtg', label: 'Resumen PRTG', end: true, icon: LayoutDashboard, accent: 'prtg' },
  { to: '/dashboard/cloudnet', label: 'Resumen Cloudnet', end: true, icon: Cloud, accent: 'cloudnet' },
  { to: '/incidents/active', label: 'Caídas activas', badgeKey: 'caidas_activas', tone: 'danger', icon: TriangleAlert },
  { to: '/incidents/pending', label: 'Pendientes de contacto', badgeKey: 'pendientes_contacto', tone: 'warn', icon: Phone },
  { to: '/incidents/managing', label: 'En gestión', badgeKey: 'en_gestion', tone: 'info', icon: Activity },
  { to: '/concentrations', label: 'Concentraciones zonales', badgeKey: 'concentraciones', tone: 'muted', icon: Map },
  { to: '/incidents/recovered', label: 'Historial por colegio', badgeKey: 'recuperados', tone: 'success', icon: CircleCheck },
  { to: '/history', label: 'Historial', icon: History },
  { to: '/schools', label: 'Locales educativos', icon: GraduationCap },
  { to: '/reports/operational', label: 'Vista de reporte', icon: FileSpreadsheet },
  { to: '/admin', label: 'Administración', icon: Settings },
]

const toneClass: Record<NonNullable<NavItem['tone']>, string> = {
  danger: 'bg-red-500/15 text-red-400 ring-1 ring-red-500/20',
  warn: 'bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/20',
  info: 'bg-blue-500/15 text-blue-400 ring-1 ring-blue-500/20',
  muted: 'bg-slate-500/15 text-slate-300 ring-1 ring-slate-500/20',
  success: 'bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/20',
}

export function Sidebar({
  onNavigate,
  forceExpanded = false,
}: {
  onNavigate?: () => void
  forceExpanded?: boolean
}) {
  const summary = usePrtgDashboard()
  const nav = summary.data?.nav
  const { collapsed, toggle } = useSidebar()
  const isCollapsed = forceExpanded ? false : collapsed

  return (
    <aside className="flex h-full min-h-screen flex-col border-r border-slate-800 bg-slate-950 text-slate-300">
      <div className={`flex items-center gap-3 border-b border-slate-800 ${isCollapsed ? 'justify-center px-2 py-4' : 'px-4 py-5'}`}>
        <div className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white">
          <Activity className="h-4 w-4" aria-hidden />
        </div>
        {!isCollapsed ? (
          <div className="min-w-0">
            <p className="truncate text-sm font-bold tracking-tight text-white">NOC Loreto</p>
            <p className="truncate text-[11px] font-medium text-slate-400">Monitoreo LLEE · MINEDU</p>
          </div>
        ) : null}
      </div>

      <div className={`flex-1 overflow-y-auto py-4 ${isCollapsed ? 'px-2' : 'px-3'}`}>
        {!isCollapsed ? (
          <p className="mb-2 px-2 text-[10px] font-semibold tracking-[0.14em] text-slate-500 uppercase">
            Operación
          </p>
        ) : null}
        <nav className="space-y-1">
          {NAV.map((item) => {
            const Icon = item.icon
            const count = item.badgeKey ? nav?.[item.badgeKey] : undefined
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                title={isCollapsed ? item.label : undefined}
                onClick={onNavigate}
                className={({ isActive }) =>
                  [
                    'group flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors duration-150',
                    isCollapsed ? 'justify-center' : '',
                    isActive
                      ? `bg-slate-800 text-white border-l-2 ${item.accent === 'cloudnet' ? 'border-cyan-500' : 'border-blue-500'}`
                      : 'border-l-2 border-transparent text-slate-300 hover:bg-slate-900 hover:text-white',
                  ].join(' ')
                }
              >
                <Icon className="h-[18px] w-[18px] shrink-0 opacity-90" aria-hidden />
                {!isCollapsed ? (
                  <>
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    {typeof count === 'number' ? (
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums ${toneClass[item.tone ?? 'muted']}`}>
                        {count.toLocaleString('es-PE')}
                      </span>
                    ) : null}
                  </>
                ) : null}
              </NavLink>
            )
          })}
        </nav>
      </div>

      {!forceExpanded ? (
        <div className="border-t border-slate-800 p-3">
          <button
            type="button"
            onClick={toggle}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg px-2 py-2 text-xs font-semibold text-slate-400 transition hover:bg-slate-900 hover:text-white"
            title={isCollapsed ? 'Expandir menú' : 'Colapsar menú'}
            aria-label={isCollapsed ? 'Expandir menú' : 'Colapsar menú'}
          >
            {isCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            {!isCollapsed ? <span>Colapsar</span> : null}
          </button>
        </div>
      ) : null}
    </aside>
  )
}
