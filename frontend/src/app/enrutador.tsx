import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { PaginaDashboardPrtg } from '../features/dashboard-prtg/pages/PaginaDashboardPrtg'
import { PaginaCaidasActivas } from '../features/incidents/pages/PaginaCaidasActivas'
import { PaginaCaidasMismaHora } from '../features/incidents/pages/PaginaCaidasMismaHora'
import { PaginaColaIncidentes } from '../features/incidents/pages/PaginaColaIncidentes'
import { PaginaMantenimiento } from '../features/incidents/pages/PaginaMantenimiento'
import { PaginaConcentraciones } from '../features/incidents/pages/PaginaConcentraciones'
import { PaginaZonaConcentracion } from '../features/incidents/pages/PaginaZonaConcentracion'
import { PaginaCaidasMasivas } from '../features/incidents/pages/PaginaCaidasMasivas'
import { PaginaCaidaMasivaNodo } from '../features/incidents/pages/PaginaCaidaMasivaNodo'
import { PaginaReporteCaidasMasivas } from '../features/incidents/pages/PaginaReporteCaidasMasivas'
import { PaginaHistorialColegios } from '../features/history/pages/PaginaHistorialColegios'
import { PaginaHistorialColegioDetalle } from '../features/history/pages/PaginaHistorialColegioDetalle'
import { PaginaExpedienteIncidente } from '../features/history/pages/PaginaExpedienteIncidente'
import { PaginaRecuperaciones } from '../features/recoveries/pages/PaginaRecuperaciones'
import { PaginaRestauraciones } from '../features/restorations/pages/PaginaRestauraciones'
import { PaginaFeedCaidas } from '../features/outages-feed/pages/PaginaFeedCaidas'
import { PaginaNotificaciones } from '../features/notifications/pages/PaginaNotificaciones'
import { PaginaAdministracion } from '../features/administration/pages/PaginaAdministracion'
import { PaginaDetalleColegio } from '../features/schools/pages/PaginaDetalleColegio'
import { PaginaListaColegios } from '../features/schools/pages/PaginaListaColegios'
import { PaginaReporteOperativo } from '../features/reports/pages/PaginaReporteOperativo'
import { PaginaReporteGeneral } from '../features/reports/pages/PaginaReporteGeneral'
import { PaginaReporteMinedu } from '../features/reports/pages/PaginaReporteMinedu'
import { PaginaReporteUsoInternet } from '../features/reports/pages/PaginaReporteUsoInternet'
import { PaginaTicketera } from '../features/ticketera/pages/PaginaTicketera'
import { PaginaExcelGoogle } from '../features/excel-google/pages/PaginaExcelGoogle'
import { PaginaInicioSesion } from '../features/auth/pages/PaginaInicioSesion'
import { PaginaPerfil } from '../features/auth/pages/PaginaPerfil'
import { RequiereAuth } from '../features/auth/components/RequiereAuth'
import { RequierePermiso } from '../features/auth/components/RequierePermiso'
import { useAuth } from '../features/auth/context/ContextoAuth'
import { homePathForPermissions, P } from '../features/auth/permisos'

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
        <Route path="/login" element={<PaginaInicioSesion />} />

        <Route element={<RequiereAuth />}>
          <Route path="/" element={<HomeRedirect />} />
          <Route path="/profile" element={<PaginaPerfil />} />

          <Route element={<RequierePermiso permission={P.dashboardPrtg} />}>
            <Route path="/dashboard/prtg" element={<PaginaDashboardPrtg />} />
          </Route>

          <Route element={<RequierePermiso permission={P.incidentsView} />}>
            <Route
              path="/incidents/total"
              element={
                <PaginaCaidasActivas
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
                <PaginaCaidasActivas
                  key="incidents-pendiente-gestion"
                  title="Pendientes de gestión"
                  description="Colegios caídos que aún no tienen ticket en gestión. Desde aquí (o desde Caídas totales) se inicia el seguimiento."
                  filter={(row) =>
                    row.followup_status === 'PENDIENTE_CONTACTO' && !row.is_link_outage
                  }
                  durationSource="current_down"
                />
              }
            />
            <Route
              path="/incidents/managing"
              element={
                <PaginaCaidasActivas
                  key="incidents-managing"
                  title="En gestión"
                  description="Seguimiento operativo del ticket: agrega mensajes y gestiones. Si PRTG recupera (24h), pasan a Pendiente de cierre."
                  filter={(row) =>
                    !row.is_link_outage &&
                    !row.is_grave_incident &&
                    !row.has_open_grave_incident &&
                    !row.is_requirement_case &&
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
              element={<PaginaColaIncidentes key="pendiente-cierre" kind="pendiente-cierre" />}
            />
            <Route path="/incidents/graves" element={<PaginaColaIncidentes key="graves" kind="graves" />} />
            <Route
              path="/incidents/requerimientos"
              element={<PaginaColaIncidentes key="requerimientos" kind="requerimientos" />}
            />
            <Route
              path="/incidents/enlace-parcial"
              element={<PaginaColaIncidentes key="enlace-parcial" kind="enlace-parcial" />}
            />
            <Route path="/maintenance" element={<PaginaMantenimiento />} />
            <Route path="/maintenance/finalizados" element={<Navigate to="/maintenance?tab=finalizados" replace />} />
          </Route>

          <Route element={<RequierePermiso permission={P.adminView} />}>
            <Route path="/incidents/same-hour" element={<PaginaCaidasMismaHora />} />
            <Route path="/concentrations" element={<PaginaConcentraciones />} />
            <Route path="/concentrations/zone" element={<PaginaZonaConcentracion />} />
            <Route path="/mass-outages" element={<PaginaCaidasMasivas />} />
            <Route path="/mass-outages/nodo" element={<PaginaCaidaMasivaNodo />} />
            <Route path="/mass-outages/report" element={<PaginaReporteCaidasMasivas />} />
          </Route>

          <Route element={<RequierePermiso permission={P.recoveriesView} />}>
            <Route path="/recoveries" element={<PaginaRecuperaciones />} />
            <Route path="/restorations" element={<PaginaRestauraciones />} />
            <Route path="/incidents/recovered" element={<Navigate to="/recoveries" replace />} />
          </Route>

          <Route element={<RequierePermiso permission={P.incidentsView} />}>
            <Route path="/notifications" element={<PaginaNotificaciones />} />
            <Route path="/outages" element={<PaginaFeedCaidas />} />
            <Route path="/reports/excel-google" element={<PaginaExcelGoogle />} />
          </Route>

          <Route element={<RequierePermiso permission={P.historyView} />}>
            <Route path="/history" element={<Navigate to="/history/schools" replace />} />
            <Route path="/history/schools" element={<PaginaHistorialColegios />} />
            <Route path="/history/schools/:schoolId" element={<PaginaHistorialColegioDetalle />} />
            <Route path="/history/incidents/:incidentId" element={<PaginaExpedienteIncidente />} />
          </Route>

          <Route element={<RequierePermiso permission={P.trackingView} />}>
            <Route path="/tracking" element={<Navigate to="/incidents/managing" replace />} />
            <Route path="/tracking/report" element={<Navigate to="/reports/operational" replace />} />
            <Route path="/tracking/:id" element={<Navigate to="/incidents/managing" replace />} />
          </Route>

          <Route element={<RequierePermiso permission={P.schoolsView} />}>
            <Route path="/schools" element={<PaginaListaColegios />} />
            <Route path="/schools/:schoolId" element={<PaginaDetalleColegio />} />
          </Route>

          <Route element={<RequierePermiso permission={P.reportsView} />}>
            <Route path="/reports" element={<Navigate to="/reports/operational" replace />} />
            <Route path="/reports/operational" element={<PaginaReporteOperativo />} />
            <Route path="/reports/minedu" element={<PaginaReporteMinedu />} />
            <Route path="/reports/usage" element={<PaginaReporteUsoInternet />} />
            <Route path="/reports/general" element={<PaginaReporteGeneral />} />
            <Route path="/reports/ticketera" element={<PaginaTicketera />} />
          </Route>

          <Route element={<RequierePermiso permission={P.adminView} />}>
            <Route path="/admin" element={<PaginaAdministracion />} />
          </Route>

          <Route path="*" element={<HomeRedirect />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
