import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { PrtgDashboardPage } from '../features/dashboard-prtg/pages/PrtgDashboardPage'
import { CloudnetDashboardPage } from '../features/dashboard-cloudnet/pages/CloudnetDashboardPage'
import { ActiveIncidentsPage } from '../features/incidents/pages/ActiveIncidentsPage'
import { ConcentrationsPage } from '../features/incidents/pages/ConcentrationsPage'
import { SchoolHistoryIndexPage } from '../features/history/pages/SchoolHistoryIndexPage'
import { SchoolHistoryDetailPage } from '../features/history/pages/SchoolHistoryDetailPage'
import { RecoveriesPage } from '../features/recoveries/pages/RecoveriesPage'
import { AdminPage } from '../features/administration/pages/AdminPage'
import { SchoolDetailPage } from '../features/schools/pages/SchoolDetailPage'
import { SchoolsListPage } from '../features/schools/pages/SchoolsListPage'
import { OperationalReportPage } from '../features/reports/pages/OperationalReportPage'
import { TrackingListPage } from '../features/tracking/pages/TrackingListPage'
import { TrackingDetailPage } from '../features/tracking/pages/TrackingDetailPage'
import { LoginPage } from '../features/auth/pages/LoginPage'
import { RequireAuth } from '../features/auth/components/RequireAuth'

const MANAGING = new Set([
  'EN_GESTION',
  'EN_DESCARTE',
  'EN_ESPERA',
  'ESCALADO',
  'TECNICO_EN_CAMPO',
])

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        <Route element={<RequireAuth />}>
          <Route path="/" element={<Navigate to="/dashboard/prtg" replace />} />
          <Route path="/dashboard/prtg" element={<PrtgDashboardPage />} />
          <Route path="/dashboard/cloudnet" element={<CloudnetDashboardPage />} />
          <Route path="/incidents/active" element={<ActiveIncidentsPage />} />
          <Route
            path="/incidents/pending"
            element={
              <ActiveIncidentsPage
                title="Pendientes de contacto"
                filter={(row) =>
                  row.followup_status === 'PENDIENTE_CONTACTO' ||
                  row.management_classification === 'NEW_OUTAGE' ||
                  row.management_classification === 'NO_RESPONSE'
                }
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
              />
            }
          />
          <Route path="/recoveries" element={<RecoveriesPage />} />
          <Route path="/incidents/recovered" element={<Navigate to="/recoveries" replace />} />
          <Route path="/history" element={<Navigate to="/history/schools" replace />} />
          <Route path="/history/schools" element={<SchoolHistoryIndexPage />} />
          <Route path="/history/schools/:schoolId" element={<SchoolHistoryDetailPage />} />
          <Route path="/tracking" element={<TrackingListPage />} />
          <Route path="/tracking/:id" element={<TrackingDetailPage />} />
          <Route path="/concentrations" element={<ConcentrationsPage />} />
          <Route path="/schools" element={<SchoolsListPage />} />
          <Route path="/schools/:schoolId" element={<SchoolDetailPage />} />
          <Route path="/reports" element={<Navigate to="/reports/operational" replace />} />
          <Route path="/reports/operational" element={<OperationalReportPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="*" element={<Navigate to="/dashboard/prtg" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
