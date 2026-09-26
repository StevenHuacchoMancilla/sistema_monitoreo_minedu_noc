export type Permission =
  | 'dashboard.prtg.view'
  | 'incidents.view'
  | 'incidents.manage'
  | 'recoveries.view'
  | 'recoveries.manage'
  | 'history.view'
  | 'tracking.view'
  | 'tracking.manage'
  | 'tracking.close'
  | 'tracking.reopen'
  | 'schools.view'
  | 'schools.manage'
  | 'reports.view'
  | 'reports.export'
  | 'users.manage'
  | 'admin.view'
  | 'sync.run'
  | 'profile.manage_own'

export const P = {
  dashboardPrtg: 'dashboard.prtg.view',
  incidentsView: 'incidents.view',
  incidentsManage: 'incidents.manage',
  recoveriesView: 'recoveries.view',
  recoveriesManage: 'recoveries.manage',
  historyView: 'history.view',
  trackingView: 'tracking.view',
  trackingManage: 'tracking.manage',
  trackingClose: 'tracking.close',
  trackingReopen: 'tracking.reopen',
  schoolsView: 'schools.view',
  schoolsManage: 'schools.manage',
  reportsView: 'reports.view',
  reportsExport: 'reports.export',
  usersManage: 'users.manage',
  adminView: 'admin.view',
  syncRun: 'sync.run',
  profileManageOwn: 'profile.manage_own',
} as const satisfies Record<string, Permission>

export function homePathForPermissions(permissions: string[] | undefined | null): string {
  const set = new Set(permissions ?? [])
  if (set.has(P.dashboardPrtg)) return '/dashboard/prtg'
  if (set.has(P.incidentsView)) return '/incidents/active'
  if (set.has(P.trackingView)) return '/tracking'
  return '/profile'
}
