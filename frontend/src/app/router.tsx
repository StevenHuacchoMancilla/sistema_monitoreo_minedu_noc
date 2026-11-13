import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { PrtgDashboardPage } from '../features/dashboard-prtg/pages/PrtgDashboardPage'
import { ActiveIncidentsPage } from '../features/incidents/pages/ActiveIncidentsPage'
import { SameHourOutagesPage } from '../features/incidents/pages/SameHourOutagesPage'
import { IncidentQueuePage } from '../features/incidents/pages/IncidentQueuePage'
import { MaintenancePage } from '../features/incidents/pages/MaintenancePage'
import { ConcentrationsPage } from '../features/incidents/pages/ConcentrationsPage'
import { ConcentrationZonePage } from '../features/incidents/pages/ConcentrationZonePage'
import { MassOutagesPage } from '../features/incidents/pages/MassOutagesPage'
import { MassOutageNodoPage } from '../features/incidents/pages/MassOutageNodoPage'
import { MassOutagesReportPage } from '../features/incidents/pages/MassOutagesReportPage'
import { SchoolHistoryIndexPage } from '../features/history/pages/SchoolHistoryIndexPage'
import { SchoolHistoryDetailPage } from '../features/history/pages/SchoolHistoryDetailPage'
import { IncidentCaseFilePage } from '../features/history/pages/IncidentCaseFilePage'
import { RecoveriesPage } from '../features/recoveries/pages/RecoveriesPage'
import { RestorationsPage } from '../features/restorations/pages/RestorationsPage'
import { OutagesFeedPage } from '../features/outages-feed/pages/OutagesFeedPage'
import { NotificationsPage } from '../features/notifications/pages/NotificationsPage'
import { AdminPage } from '../features/administration/pages/AdminPage'
import { SchoolDetailPage } from '../features/schools/pages/SchoolDetailPage'
import { SchoolsListPage } from '../features/schools/pages/SchoolsListPage'
import { OperationalReportPage } from '../features/reports/pages/OperationalReportPage'
import { GeneralReportPage } from '../features/reports/pages/GeneralReportPage'
import { MineduReportPage } from '../features/reports/pages/MineduReportPage'
import { InternetUsageReportPage } from '../features/reports/pages/InternetUsageReportPage'
import { TicketeraPage } from '../features/ticketera/pages/TicketeraPage'
import { LoginPage } from '../features/auth/pages/LoginPage'
import { ProfilePage } from '../features/auth/pages/ProfilePage'
import { RequireAuth } from '../features/auth/components/RequireAuth'
import { RequirePermission } from '../features/auth/components/RequirePermission'
import { useAuth } from '../features/auth/context/AuthContext'
import { homePathForPermissions, P } from '../features/auth/permissions'

const MANAGING = new Set([
  'EN_GESTION',
  'EN_DESCARTE',
  'EN_ESPERA',
  'ESCALADO',
  'TECNICO_EN_CAMPO',
])

function HomeRedirect() {
  const { user } = useAuth()
  return <Navigate to={homePathForPermissions(user?.permissions)} replace />
}

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        <Route element={<RequireAuth />}>
          <Route path="/" element={<HomeRedirect />} />
          <Route path="/profile" element={<ProfilePage />} />

          <Route element={<RequirePermission permission={P.dashboardPrtg} />}>
            <Route path="/dashboard/prtg" element={<PrtgDashboardPage />} />
          </Route>

          <Route element={<RequirePermission permission={P.incidentsView} />}>
            <Route
              path="/incidents/total"
              element={
                <ActiveIncidentsPage
                  key="incidents-total"
                  title="Caídas totales"
                  description="Caídas reales (rojo) e intermitentes/parciales (amarillo) al inicio. Los intermitentes no abren ticket; solo se listan para tenerlos en cuenta. Duración = Fallo por PRTG."
                  tableTitle="Caídas actuales en PRTG"
                  emptyTitle="No hay caídas en PRTG."
                  emptyDescription="Ningún local monitoreado está caído en este momento."
                  durationSource="current_down"
                  showManagementTag
                  showManagementFilter
                />
              }
            />
            <Route path="/incidents/active" element={<Navigate to="/incidents/total" replace />} />
            <Route path="/incidents/pending" element={<Navigate to="/incidents/pendiente-gestion" replace />} />
            <Route
              path="/incidents/pendiente-gestion"
              element={
                <ActiveIncidentsPage
                  key="incidents-pendiente-gestion"
                  title="Pendientes de gestión"
                  description="Colegios caídos que aún no tienen ticket en gestión. Desde aquí (o desde Caídas totales) se inicia el seguimiento."
                  filter={(row) => row.followup_status === 'PENDIENTE_CONTACTO'}
                  durationSource="current_down"
                />
              }
            />
            <Route
              path="/incidents/managing"
              element={
                <ActiveIncidentsPage
                  key="incidents-managing"
                  title="En gestión"
                  description="Seguimiento operativo del ticket: agrega mensajes y gestiones. Si PRTG recupera (24h), pasan a Pendiente de cierre."
                  filter={(row) =>
                    !row.is_grave_incident &&
                    !row.has_open_grave_incident &&
                    !row.is_requirement_case &&
                    !row.has_open_requirement &&
                    (MANAGING.has(row.followup_status ?? '') || row.followup_status === 'PENDIENTE_CIERRE')
                  }
                  durationSource="current_down"
                  source="managing"
                />
              }
            />
            <Route path="/incidents/reopened-managing" element={<Navigate to="/incidents/managing" replace />} />
            <Route
              path="/incidents/pendiente-cierre"
              element={<IncidentQueuePage key="pendiente-cierre" kind="pendiente-cierre" />}
            />
            <Route path="/incidents/graves" element={<IncidentQueuePage key="graves" kind="graves" />} />
            <Route
              path="/incidents/requerimientos"
              element={<IncidentQueuePage key="requerimientos" kind="requerimientos" />}
            />
            <Route path="/maintenance" element={<MaintenancePage />} />
            <Route path="/maintenance/finalizados" element={<Navigate to="/maintenance?tab=finalizados" replace />} />
          </Route>

          <Route element={<RequirePermission permission={P.adminView} />}>
            <Route path="/incidents/same-hour" element={<SameHourOutagesPage />} />
            <Route path="/concentrations" element={<ConcentrationsPage />} />
            <Route path="/concentrations/zone" element={<ConcentrationZonePage />} />
            <Route path="/mass-outages" element={<MassOutagesPage />} />
            <Route path="/mass-outages/nodo" element={<MassOutageNodoPage />} />
            <Route path="/mass-outages/report" element={<MassOutagesReportPage />} />
          </Route>

          <Route element={<RequirePermission permission={P.recoveriesView} />}>
            <Route path="/recoveries" element={<RecoveriesPage />} />
            <Route path="/restorations" element={<RestorationsPage />} />
            <Route path="/incidents/recovered" element={<Navigate to="/recoveries" replace />} />
          </Route>

          <Route element={<RequirePermission permission={P.incidentsView} />}>
            <Route path="/notifications" element={<NotificationsPage />} />
            <Route path="/outages" element={<OutagesFeedPage />} />
          </Route>

          <Route element={<RequirePermission permission={P.historyView} />}>
            <Route path="/history" element={<Navigate to="/history/schools" replace />} />
            <Route path="/history/schools" element={<SchoolHistoryIndexPage />} />
            <Route path="/history/schools/:schoolId" element={<SchoolHistoryDetailPage />} />
            <Route path="/history/incidents/:incidentId" element={<IncidentCaseFilePage />} />
          </Route>

          <Route element={<RequirePermission permission={P.trackingView} />}>
            <Route path="/tracking" element={<Navigate to="/incidents/managing" replace />} />
            <Route path="/tracking/report" element={<Navigate to="/reports/operational" replace />} />
            <Route path="/tracking/:id" element={<Navigate to="/incidents/managing" replace />} />
          </Route>

          <Route element={<RequirePermission permission={P.schoolsView} />}>
            <Route path="/schools" element={<SchoolsListPage />} />
            <Route path="/schools/:schoolId" element={<SchoolDetailPage />} />
          </Route>

          <Route element={<RequirePermission permission={P.reportsView} />}>
            <Route path="/reports" element={<Navigate to="/reports/operational" replace />} />
            <Route path="/reports/operational" element={<OperationalReportPage />} />
            <Route path="/reports/minedu" element={<MineduReportPage />} />
            <Route path="/reports/usage" element={<InternetUsageReportPage />} />
            <Route path="/reports/general" element={<GeneralReportPage />} />
            <Route path="/reports/ticketera" element={<TicketeraPage />} />
          </Route>

          <Route element={<RequirePermission permission={P.adminView} />}>
            <Route path="/admin" element={<AdminPage />} />
          </Route>

          <Route path="*" element={<HomeRedirect />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
