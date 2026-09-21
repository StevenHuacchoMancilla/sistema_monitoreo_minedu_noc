import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { DashboardPage } from '../features/dashboard/pages/DashboardPage'
import { ActiveIncidentsPage } from '../features/incidents/pages/ActiveIncidentsPage'
import { RecoveredIncidentsPage } from '../features/incidents/pages/RecoveredIncidentsPage'
import { ConcentrationsPage } from '../features/incidents/pages/ConcentrationsPage'
import { AdminPage } from '../features/administration/pages/AdminPage'
import { SchoolDetailPage } from '../features/schools/pages/SchoolDetailPage'
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
        <Route path="/" element={<DashboardPage />} />
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
        <Route
          path="/schools"
          element={
            <PlaceholderPage
              title="Locales educativos"
              note="Listado completo pendiente. Desde una caída usa Ver / Gestionar para ver el colegio."
            />
          }
        />
        <Route path="/schools/:schoolId" element={<SchoolDetailPage />} />
        <Route
          path="/reports"
          element={<PlaceholderPage title="Reportes" note="Reporte de cierre Excel pendiente de Fase 10." />}
        />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
