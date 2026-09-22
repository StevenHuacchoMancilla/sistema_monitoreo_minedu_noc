import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { PrtgDashboardPage } from '../features/dashboard-prtg/pages/PrtgDashboardPage'
import { CloudnetDashboardPage } from '../features/dashboard-cloudnet/pages/CloudnetDashboardPage'
import { ActiveIncidentsPage } from '../features/incidents/pages/ActiveIncidentsPage'
import { RecoveredIncidentsPage } from '../features/incidents/pages/RecoveredIncidentsPage'
import { ConcentrationsPage } from '../features/incidents/pages/ConcentrationsPage'
import { AdminPage } from '../features/administration/pages/AdminPage'
import { SchoolDetailPage } from '../features/schools/pages/SchoolDetailPage'
import { SchoolsListPage } from '../features/schools/pages/SchoolsListPage'
import { OperationalReportPage } from '../features/reports/pages/OperationalReportPage'
import { PlaceholderPage } from '../components/ui/PlaceholderPage'

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
        <Route path="/incidents/recovered" element={<RecoveredIncidentsPage />} />
        <Route path="/concentrations" element={<ConcentrationsPage />} />
        <Route
          path="/history"
          element={
            <PlaceholderPage
              title="Historial"
              note="Abre cualquier incidencia con Ver / Gestionar para ver antecedentes del CID."
            />
          }
        />
        <Route path="/schools" element={<SchoolsListPage />} />
        <Route path="/schools/:schoolId" element={<SchoolDetailPage />} />
        <Route path="/reports" element={<Navigate to="/reports/operational" replace />} />
        <Route path="/reports/operational" element={<OperationalReportPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="*" element={<Navigate to="/dashboard/prtg" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
