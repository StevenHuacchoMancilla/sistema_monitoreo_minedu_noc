import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'
import {
  Activity,
  AlertOctagon,
  Bell,
  ChevronDown,
  CircleCheck,
  Clock,
  FileSpreadsheet,
  Radio,
  Files,
  Gauge,
  GraduationCap,
  History,
  Layers,
  LayoutDashboard,
  Map,
  Network,
  PanelLeftClose,
  PanelLeftOpen,
  Phone,
  Settings,
  ShieldAlert,
  Ticket,
  TriangleAlert,
  Wrench,
} from 'lucide-react'
import { useDashboardSummary } from '../features/dashboard/hooks/useDashboard'
import { useOperationalAlerts } from '../features/notifications/hooks/useOperationalAlerts'
import { useRecentOutages } from '../features/outages-feed/hooks/useRecentOutages'
import { useRecentRestorations } from '../features/restorations/hooks/useRecentRestorations'
import { usePermissions } from '../features/auth/hooks/usePermissions'
import { P, type Permission } from '../features/auth/permissions'
import { useSidebar } from './AppLayout'

type NavSection = 'operacion' | 'reportes' | 'consulta'

type NavItem = {
  to: string
  label: string
  end?: boolean
  section: NavSection
  badgeKey?:
    | 'caidas_totales'
    | 'pendientes_contacto'
    | 'en_gestion'
    | 'pendiente_cierre'
    | 'incidencias_graves'
    | 'caidas_masivas'
    | 'concentraciones'
    | 'recuperados'
    | 'tracking_abiertos'
    | 'notificaciones'
    | 'caidas_recientes'
    | 'restablecimientos'
    | 'mantenimientos'
  tone?: 'danger' | 'warn' | 'info' | 'muted' | 'success'
  icon: LucideIcon
  accent?: 'prtg'
  permission: Permission
}

const SECTION_LABEL: Record<NavSection, string> = {
  operacion: 'Operación',
  reportes: 'Reportes',
  consulta: 'Consulta',
}

const NAV: NavItem[] = [
  { section: 'operacion', to: '/dashboard/prtg', label: 'Resumen PRTG', end: true, icon: LayoutDashboard, accent: 'prtg', permission: P.dashboardPrtg },
  { section: 'operacion', to: '/incidents/total', label: 'Caídas totales', badgeKey: 'caidas_totales', tone: 'danger', icon: Layers, permission: P.incidentsView },
  { section: 'operacion', to: '/incidents/same-hour', label: 'Misma hora', icon: Clock, permission: P.adminView },
  { section: 'operacion', to: '/incidents/pendiente-gestion', label: 'Pendientes de gestión', badgeKey: 'pendientes_contacto', tone: 'warn', icon: Phone, permission: P.incidentsView },
  { section: 'operacion', to: '/incidents/managing', label: 'En gestión', badgeKey: 'en_gestion', tone: 'info', icon: Activity, permission: P.incidentsView },
  { section: 'operacion', to: '/incidents/pendiente-cierre', label: 'Pendiente de cierre', badgeKey: 'pendiente_cierre', tone: 'warn', icon: ShieldAlert, permission: P.incidentsView },
  { section: 'operacion', to: '/incidents/graves', label: 'Incidencias', badgeKey: 'incidencias_graves', tone: 'danger', icon: AlertOctagon, permission: P.incidentsView },
  { section: 'operacion', to: '/maintenance', label: 'Mantenimientos', badgeKey: 'mantenimientos', tone: 'info', icon: Wrench, permission: P.incidentsView },
  { section: 'operacion', to: '/recoveries', label: 'Recuperados', badgeKey: 'recuperados', tone: 'success', icon: CircleCheck, permission: P.recoveriesView },
  { section: 'operacion', to: '/mass-outages', label: 'Caídas masivas', badgeKey: 'caidas_masivas', tone: 'danger', icon: Network, permission: P.adminView },
  { section: 'operacion', to: '/concentrations', label: 'Concentraciones', badgeKey: 'concentraciones', tone: 'muted', icon: Map, permission: P.adminView },
  { section: 'reportes', to: '/reports/operational', label: 'Lista para reporte', icon: FileSpreadsheet, permission: P.reportsView },
  { section: 'reportes', to: '/reports/general', label: 'Seguimiento de caídas', icon: Files, permission: P.reportsView },
  { section: 'reportes', to: '/reports/ticketera', label: 'Histórico de tickets', icon: Ticket, permission: P.reportsView },
  { section: 'reportes', to: '/reports/minedu', label: 'Anexo 30 MINEDU', icon: Files, permission: P.reportsView },
  { section: 'reportes', to: '/reports/usage', label: 'Uso de internet', icon: Gauge, permission: P.reportsView },
  { section: 'consulta', to: '/history/schools', label: 'Historial por colegio', icon: History, permission: P.historyView },
  { section: 'consulta', to: '/schools', label: 'Locales educativos', icon: GraduationCap, permission: P.schoolsView },
  { section: 'consulta', to: '/notifications', label: 'Notificaciones', badgeKey: 'notificaciones', tone: 'warn', icon: Bell, permission: P.incidentsView },
  { section: 'consulta', to: '/outages', label: 'Caídas', badgeKey: 'caidas_recientes', tone: 'danger', icon: TriangleAlert, permission: P.incidentsView },
  { section: 'consulta', to: '/restorations', label: 'Restablecimientos', badgeKey: 'restablecimientos', tone: 'success', icon: Radio, permission: P.recoveriesView },
  { section: 'consulta', to: '/admin', label: 'Administración', icon: Settings, permission: P.adminView },
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
  const summary = useDashboardSummary(120_000)
  const { can } = usePermissions()
  const alerts = useOperationalAlerts(120_000, can(P.incidentsView))
  const outages = useRecentOutages(60, 60_000, can(P.incidentsView))
  const restorations = useRecentRestorations(60, 60_000, can(P.recoveriesView))
  const nav = summary.data?.nav as Record<string, number> | undefined
  const notifCount = alerts.data?.meta.pending_review ?? alerts.data?.data?.length ?? 0
  const outageCount = outages.data?.meta.recent ?? 0
  const restorationCount = restorations.data?.meta.recent ?? 0
  const { collapsed, toggle } = useSidebar()
  const isCollapsed = forceExpanded ? false : collapsed
  const [sectionsOpen, setSectionsOpen] = useState<Record<NavSection, boolean>>(() => {
    try {
      const raw = localStorage.getItem('noc.nav.sections')
      const parsed = raw ? (JSON.parse(raw) as Partial<Record<NavSection, boolean>>) : {}
      return { operacion: true, reportes: true, consulta: true, ...parsed }
    } catch {
      return { operacion: true, reportes: true, consulta: true }
    }
  })
  const items = NAV.filter((item) => can(item.permission))
  const sections = (['operacion', 'reportes', 'consulta'] as const).filter((section) =>
    items.some((item) => item.section === section),
  )

  const toggleSection = (section: NavSection) => {
    setSectionsOpen((prev) => {
      const next = { ...prev, [section]: !prev[section] }
      localStorage.setItem('noc.nav.sections', JSON.stringify(next))
      return next
    })
  }

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
        <nav className="space-y-4">
          {sections.map((section) => {
            const sectionItems = items.filter((item) => item.section === section)
            const open = isCollapsed || sectionsOpen[section]
            return (
              <div key={section}>
                {!isCollapsed ? (
                  <button
                    type="button"
                    onClick={() => toggleSection(section)}
                    className="mb-2 flex w-full items-center justify-between px-2 text-[10px] font-semibold tracking-[0.14em] text-slate-500 uppercase hover:text-slate-300"
                    aria-expanded={open}
                  >
                    {SECTION_LABEL[section]}
                    <ChevronDown className={`h-3.5 w-3.5 transition ${open ? '' : '-rotate-90'}`} aria-hidden />
                  </button>
                ) : section !== 'operacion' ? (
                  <div className="my-2 border-t border-slate-800" />
                ) : null}
                {open ? (
                <ul className="space-y-1">
                  {sectionItems.map((item) => {
                    const badge =
                      item.badgeKey === 'notificaciones'
                        ? notifCount
                        : item.badgeKey === 'caidas_recientes'
                          ? outageCount
                          : item.badgeKey === 'restablecimientos'
                            ? restorationCount
                            : item.badgeKey
                              ? (nav?.[item.badgeKey] ?? 0)
                              : null
                    return (
                      <li key={item.to}>
                        <NavLink
                          to={item.to}
                          end={item.end}
                          onClick={onNavigate}
                          title={item.label}
                          className={({ isActive }) =>
                            [
                              'group flex items-center gap-2 rounded-lg text-sm font-medium transition',
                              isCollapsed ? 'justify-center px-2 py-2.5' : 'px-2.5 py-2',
                              isActive
                                ? 'bg-slate-800 text-white'
                                : 'text-slate-400 hover:bg-slate-900 hover:text-slate-100',
                            ].join(' ')
                          }
                        >
                          <item.icon className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
                          {!isCollapsed ? (
                            <>
                              <span className="min-w-0 flex-1 truncate">{item.label}</span>
                              {badge !== null && badge > 0 ? (
                                <span
                                  className={`inline-flex min-w-[1.35rem] items-center justify-center rounded-md px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
                                    item.tone ? toneClass[item.tone] : toneClass.muted
                                  }`}
                                >
                                  {badge > 99 ? '99+' : badge}
                                </span>
                              ) : null}
                            </>
                          ) : null}
                        </NavLink>
                      </li>
                    )
                  })}
                </ul>
                ) : null}
              </div>
            )
          })}
        </nav>
      </div>

      {!forceExpanded ? (
        <div className="border-t border-slate-800 p-2">
          <button
            type="button"
            onClick={toggle}
            className="flex w-full items-center justify-center gap-2 rounded-lg px-2 py-2 text-xs text-slate-500 hover:bg-slate-900 hover:text-slate-200"
          >
            {isCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            {!isCollapsed ? <span>Colapsar</span> : null}
          </button>
        </div>
      ) : null}
    </aside>
  )
}
