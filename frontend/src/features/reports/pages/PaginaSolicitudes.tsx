import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, CircleCheck, Clock3, FileSpreadsheet, FileText, ListChecks, RadioTower, TriangleAlert } from 'lucide-react'
import { DisenoApp } from '../../../layouts/DisenoApp'
import { EncabezadoPagina } from '../../../components/ui/EncabezadoPagina'
import { Boton } from '../../../components/ui/Boton'
import { ErrorState, LoadingState } from '../../../components/ui/Estados'
import { Insignia } from '../../../components/ui/InsigniaSuave'
import { ApiError } from '../../../api/clienteHttp'
import { endpoints } from '../../../api/endpoints'
import { formatDuration, formatRelativeDateTime } from '../../../lib/fechaHora'
import { descargarSolicitudesPdf } from '../lib/descargarSolicitudesPdf'
import type { SolicitudColegio } from '../types/solicitudes'

async function downloadSolicitudesXlsx(): Promise<void> {
  const response = await fetch(endpoints.solicitudesXlsxUrl(), {
    method: 'GET',
    credentials: 'include',
    headers: {
      Accept: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'X-Requested-With': 'XMLHttpRequest',
    },
  })
  if (!response.ok) {
    let message = `API ${response.status}`
    try {
      const body = await response.json()
      if (body && typeof body.message === 'string') message = body.message
    } catch {
      /* ignore */
    }
    throw new ApiError(response.status, message)
  }
  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `solicitudes_providencia_santa_cruz_${new Date().toISOString().slice(0, 10)}.xlsx`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function modeLabel(mode: SolicitudColegio['caidas_modo'], days: number): string {
  if (mode === 'semana') return `Caídas reales de Ping en los últimos ${days} días`
  if (mode === 'mes') return 'Sin caída en 7 días · última del mes anterior'
  return 'Sin caída real de Ping'
}

function SchoolCard({ school, windowDays }: { school: SolicitudColegio; windowDays: number }) {
  const down = school.estado === 'CAIDO' || school.estado === 'PARCIAL'
  const tone = down ? 'danger' : school.estado === 'OPERATIVO' ? 'success' : 'neutral'

  return (
    <article className="min-w-0 rounded-2xl border border-slate-200/90 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:px-5 dark:border-slate-800">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-bold tabular-nums text-slate-950 dark:text-slate-50">
              {school.cid ?? '—'}
            </span>
            <Insignia tone={tone}>{school.estado_label}</Insignia>
          </div>
          <p className="mt-1 truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
            {school.local_educativo ?? 'Sin nombre'}
          </p>
          <p className="mt-0.5 text-[12px] text-slate-500">
            {[school.codigo_local ? `Cód. ${school.codigo_local}` : null, school.distrito, school.provincia]
              .filter(Boolean)
              .join(' · ') || '—'}
          </p>
        </div>
        {school.school_id ? (
          <Link
            to={`/history/schools/${school.school_id}`}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[12px] font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Historial
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        ) : null}
      </div>

      <div className="grid gap-2 px-4 py-3 sm:grid-cols-3 sm:px-5">
        <div className="rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-800/60">
          <p className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase">Enlaces</p>
          <p className="mt-1 text-[13px] font-semibold text-slate-900 dark:text-slate-100">
            Primario {school.nodo_primario ?? '—'}
          </p>
          <p className="text-[12px] text-slate-500">Secundario {school.nodo_secundario ?? 'Sin enlace'}</p>
        </div>
        <div className="rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-800/60">
          <p className="inline-flex items-center gap-1 text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
            <Clock3 className="h-3.5 w-3.5" aria-hidden />
            Activo desde
          </p>
          {school.sin_caidas ? (
            <>
              <p className="mt-1 text-[13px] font-semibold text-slate-900 dark:text-slate-100">Sin caídas</p>
              <p className="text-[12px] text-slate-500">No tuvo un Ping caído en 120 días</p>
            </>
          ) : (
            <>
              <p className="mt-1 text-[13px] font-semibold text-slate-900 dark:text-slate-100">
                {school.activo_desde ? formatRelativeDateTime(school.activo_desde) : '—'}
              </p>
              <p className="text-[12px] text-slate-500">
                {school.activo_segundos != null
                  ? `Hace ${formatDuration(school.activo_segundos)} · desde la última recuperación`
                  : 'Sin recuperación previa'}
              </p>
            </>
          )}
        </div>
        <div className={`rounded-xl px-3 py-2 ${down ? 'bg-red-50 dark:bg-red-950/40' : 'bg-emerald-50 dark:bg-emerald-950/30'}`}>
          <p className="inline-flex items-center gap-1 text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
            {down ? <TriangleAlert className="h-3.5 w-3.5 text-red-600" aria-hidden /> : <CircleCheck className="h-3.5 w-3.5 text-emerald-600" aria-hidden />}
            {down ? 'Caído hace' : 'Flujo continuo'}
          </p>
          <p className={`mt-1 text-[13px] font-semibold ${down ? 'text-red-800 dark:text-red-200' : 'text-emerald-800 dark:text-emerald-200'}`}>
            {down
              ? formatDuration(school.caido_segundos)
              : school.sin_caidas
                ? 'Activo'
                : formatDuration(school.activo_segundos)}
          </p>
          <p className="text-[12px] text-slate-500">
            {down
              ? school.caido_desde
                ? `Desde ${formatRelativeDateTime(school.caido_desde)}`
                : 'Ping caído en PRTG'
              : school.sin_caidas
                ? 'Sin corte de Ping'
                : 'Sigue arriba desde esa recuperación'}
          </p>
        </div>
      </div>

      <div className="px-4 pb-4 sm:px-5">
        <p className="mb-2 text-[12px] font-semibold text-slate-600 dark:text-slate-300">
          {modeLabel(school.caidas_modo, windowDays)}
          {school.caidas.length > 0 ? ` · ${school.caidas.length}` : ''}
        </p>
        {school.prtg_error ? (
          <p className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] font-medium text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
            {school.prtg_error}
          </p>
        ) : null}
        {school.caidas.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-200 px-3 py-2 text-[12px] text-slate-500 dark:border-slate-700">
            No hay Ping caído en los últimos 7 días ni en el mes anterior.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
            <table className="w-full min-w-[520px] text-left text-[13px]">
              <thead className="bg-slate-50 text-[11px] tracking-wide text-slate-500 uppercase dark:bg-slate-800/80">
                <tr>
                  <th className="px-3 py-2 font-semibold">Inicio</th>
                  <th className="px-3 py-2 font-semibold">Fin</th>
                  <th className="px-3 py-2 font-semibold">Duración</th>
                  <th className="px-3 py-2 font-semibold">Estado</th>
                </tr>
              </thead>
              <tbody>
                {school.caidas.map((fall) => (
                  <tr key={fall.id} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="px-3 py-2 whitespace-nowrap">{formatRelativeDateTime(fall.inicio)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {fall.abierta ? 'Sigue caído' : fall.fin ? formatRelativeDateTime(fall.fin) : '—'}
                    </td>
                    <td className="px-3 py-2 font-semibold tabular-nums">{formatDuration(fall.duracion_segundos)}</td>
                    <td className="px-3 py-2">
                      <Insignia tone={fall.abierta ? 'danger' : 'success'}>{fall.abierta ? 'Abierta' : 'Recuperada'}</Insignia>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </article>
  )
}

export function PaginaSolicitudes() {
  const [exportingXlsx, setExportingXlsx] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  const report = useQuery({
    queryKey: ['reports', 'solicitudes'],
    queryFn: () => endpoints.solicitudesEnlace(),
  })

  const groups = report.data?.groups ?? []
  const windowDays = report.data?.window_days ?? 7

  const onExcel = async () => {
    setExportError(null)
    setExportingXlsx(true)
    try {
      await downloadSolicitudesXlsx()
    } catch (error) {
      setExportError(error instanceof Error ? error.message : 'No se pudo descargar el Excel')
    } finally {
      setExportingXlsx(false)
    }
  }

  const onPdf = () => {
    setExportError(null)
    if (!report.data) {
      setExportError('Espera a que cargue la información de PRTG')
      return
    }
    descargarSolicitudesPdf(report.data)
  }

  return (
    <DisenoApp bare>
      <div className="min-w-0 space-y-6">
        <EncabezadoPagina
          icon={<ListChecks className="h-5 w-5" aria-hidden />}
          title="Solicitudes"
          description="Activo desde la última recuperación real del Ping. Si hubo caídas en 7 días se listan todas; si no, solo la más cercana del mes anterior. Un aviso o fallo parcial de PRTG no cuenta como caída."
          breadcrumb={
            <p className="text-xs font-medium text-slate-500">
              NOC Loreto <span className="text-slate-300">/</span> Reportes <span className="text-slate-300">/</span> Solicitudes
            </p>
          }
          actions={
            <div className="flex flex-wrap gap-2">
              <Boton type="button" variant="secondary" loading={exportingXlsx} disabled={!report.data} onClick={() => void onExcel()}>
                <FileSpreadsheet className="h-4 w-4" aria-hidden />
                Excel
              </Boton>
              <Boton type="button" variant="primary" disabled={!report.data} onClick={onPdf}>
                <FileText className="h-4 w-4" aria-hidden />
                PDF
              </Boton>
            </div>
          }
        />
        {exportError ? <p className="text-sm font-semibold text-red-600">{exportError}</p> : null}

        {report.isLoading ? <LoadingState label="Cargando solicitudes…" /> : null}
        {report.isError ? <ErrorState message="No se pudo cargar las solicitudes" /> : null}

        {!report.isLoading && !report.isError ? (
          <div className="grid gap-3 sm:grid-cols-3">
            {groups.map((group) => (
              <div
                key={group.key}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-900"
              >
                <p className="text-[12px] font-semibold tracking-wide text-slate-500 uppercase">{group.label}</p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-slate-950 dark:text-slate-50">{group.total}</p>
                <p className="mt-1 text-[12px] text-slate-500">{group.hint}</p>
              </div>
            ))}
          </div>
        ) : null}

        {groups.map((group) => (
          <section key={group.key} className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <RadioTower className="h-4 w-4 text-slate-400" aria-hidden />
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50">{group.label}</h2>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {group.total}
              </span>
            </div>
            {group.schools.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500 dark:border-slate-700">
                No hay colegios en este grupo.
              </p>
            ) : (
              <div className="grid gap-3">
                {group.schools.map((school) => (
                  <SchoolCard key={school.assignment_id} school={school} windowDays={windowDays} />
                ))}
              </div>
            )}
          </section>
        ))}
      </div>
    </DisenoApp>
  )
}
