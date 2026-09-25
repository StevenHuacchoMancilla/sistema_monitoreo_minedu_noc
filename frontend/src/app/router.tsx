import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { PrtgDashboardPage } from '../features/dashboard-prtg/pages/PrtgDashboardPage'
import { CloudnetDashboardPage } from '../features/dashboard-cloudnet/pages/CloudnetDashboardPage'
import { ActiveIncidentsPage } from '../features/incidents/pages/ActiveIncidentsPage'
import { ConcentrationsPage } from '../features/incidents/pages/ConcentrationsPage'
import { SchoolHistoryIndexPage } from '../features/history/pages/SchoolHistoryIndexPage'
import { SchoolHistoryDetailPage } from '../features/history/pages/SchoolHistoryDetailPage'
import { IncidentCaseFilePage } from '../features/history/pages/IncidentCaseFilePage'
import { RecoveriesPage } from '../features/recoveries/pages/RecoveriesPage'
import { AdminPage } from '../features/administration/pages/AdminPage'
import { SchoolDetailPage } from '../features/schools/pages/SchoolDetailPage'
import { SchoolsListPage } from '../features/schools/pages/SchoolsListPage'
import { OperationalReportPage } from '../features/reports/pages/OperationalReportPage'
import { GeneralReportPage } from '../features/reports/pages/GeneralReportPage'
import { TrackingListPage } from '../features/tracking/pages/TrackingListPage'
import { TrackingDetailPage } from '../features/tracking/pages/TrackingDetailPage'
import { TrackingReportPage } from '../features/tracking/pages/TrackingReportPage'
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
          <Route element={<RequirePermission permission={P.dashboardCloudnet} />}>
            <Route path="/dashboard/cloudnet" element={<CloudnetDashboardPage />} />
          </Route>

          <Route element={<RequirePermission permission={P.incidentsView} />}>
            <Route path="/incidents/active" element={<ActiveIncidentsPage />} />
            <Route
              path="/incidents/pending"
              element={
                <ActiveIncidentsPage
                  title="Pendientes de contacto"
                  filter={(row) => row.followup_status === 'PENDIENTE_CONTACTO'}
                  presetFollowup="PENDIENTE_CONTACTO"
                />
              }
            />
            <Route
              path="/incidents/managing"
              element={
                <ActiveIncidentsPage
                  title="En gestión"
                  filter={(row) => MANAGING.has(row.followup_status ?? '')}
                  presetFollowup="EN_GESTION_GROUP"
                />
              }
            />
            <Route path="/concentrations" element={<ConcentrationsPage />} />
          </Route>

          <Route element={<RequirePermission permission={P.recoveriesView} />}>
            <Route path="/recoveries" element={<RecoveriesPage />} />
            <Route path="/incidents/recovered" element={<Navigate to="/recoveries" replace />} />
          </Route>

          <Route element={<RequirePermission permission={P.historyView} />}>
            <Route path="/history" element={<Navigate to="/history/schools" replace />} />
            <Route path="/history/schools" element={<SchoolHistoryIndexPage />} />
            <Route path="/history/schools/:schoolId" element={<SchoolHistoryDetailPage />} />
            <Route path="/history/incidents/:incidentId" element={<IncidentCaseFilePage />} />
          </Route>

          <Route element={<RequirePermission permission={P.trackingView} />}>
            <Route path="/tracking" element={<TrackingListPage />} />
            <Route path="/tracking/report" element={<TrackingReportPage />} />
            <Route path="/tracking/:id" element={<TrackingDetailPage />} />
          </Route>

          <Route element={<RequirePermission permission={P.schoolsView} />}>
            <Route path="/schools" element={<SchoolsListPage />} />
            <Route path="/schools/:schoolId" element={<SchoolDetailPage />} />
          </Route>

          <Route element={<RequirePermission permission={P.reportsView} />}>
            <Route path="/reports" element={<Navigate to="/reports/operational" replace />} />
            <Route path="/reports/operational" element={<OperationalReportPage />} />
            <Route path="/reports/general" element={<GeneralReportPage />} />
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
