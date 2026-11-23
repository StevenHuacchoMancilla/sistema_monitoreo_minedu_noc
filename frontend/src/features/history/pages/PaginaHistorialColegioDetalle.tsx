import { useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import {
  ArrowLeft,
  CircleCheck,
  Clock3,
  Eye,
  GraduationCap,
  History,
  ImageDown,
  MapPin,
  Radio,
  RefreshCw,
  TriangleAlert,
  Zap,
} from 'lucide-react'
import { DisenoApp } from '../../../layouts/DisenoApp'
import { Boton } from '../../../components/ui/Boton'
import { EmptyState, ErrorState, LoadingState } from '../../../components/ui/Estados'
import { CaseStatusBadge, PrtgStatusBadge } from '../../../components/monitoring/InsigniasEstado'
import { InsigniaEnergia } from '../../../components/monitoring/InsigniaEnergia'
import { Insignia } from '../../../components/ui/InsigniaSuave'
import {
  DataTableContainer,
  IsoDateTimeCell,
  Truncate,
} from '../../../components/ui/MarcoTablaDatos'
import { FormField, Input, Select } from '../../../components/ui/ControlesFormulario'
import { BarraPaginacion } from '../../../components/ui/BarraPaginacion'
import { useManualSync } from '../../dashboard/hooks/useDashboard'
import { InsigniaDesajusteUbicacion } from '../../locations/components/InsigniaDesajusteUbicacion'
import { statusTone, techBadgeClass, type StatusTone } from '../../../lib/tokensUi'
import { formatRelativeDateTime } from '../../../lib/fechaHora'
import { downloadTicketImageFromIncidentId } from '../../incidents/lib/imagenTicket'
import {
  fetchSchoolHistoryIncidents,
  fetchSchoolHistoryOverview,
  incidentCaseFilePath,
} from '../api/apiHistorial'
import type { SchoolHistoryCategory, SchoolHistoryIncidentRow } from '../types/historial'

const HISTORY_TABS: Array<{
  id: SchoolHistoryCategory
  label: string
  hint: string
}> = [
  { id: 'caidas_normales', label: 'Caídas normales', hint: 'Mayoría operativa: caídas PRTG sin avería / req / mant.' },
  { id: 'averias', label: 'Averías', hint: 'Quejas y caídas de enlace MINEDU / incidencias graves.' },
  { id: 'enlace_parcial', label: 'Enlace parcial', hint: 'Un WAN caído con Ping operativo (doble WAN / P2P).' },
  { id: 'requerimientos', label: 'Requerimientos', hint: 'Casos marcados como requerimiento.' },
  { id: 'mantenimientos', label: 'Mantenimientos', hint: 'Tickets de mantenimiento preventivo o correctivo.' },
]

export function PaginaHistorialColegioDetalle() {
  const { schoolId } = useParams()
  const id = Number(schoolId)
  const navigate = useNavigate()
  const { prtg } = useManualSync()

  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [status, setStatus] = useState('ALL')
  const [scope, setScope] = useState('')
  const [ticketSearch, setTicketSearch] = useState('')
  const [category, setCategory] = useState<SchoolHistoryCategory>('caidas_normales')
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(10)

  const overview = useQuery({
    queryKey: ['history', 'school', id, 'overview'],
    queryFn: () => fetchSchoolHistoryOverview(id),
    enabled: Number.isFinite(id) && id > 0,
  })

  const incidents = useQuery({
    queryKey: [
      'history',
      'school',
      id,
      'incidents',
      category,
      dateFrom,
      dateTo,
      status,
      scope,
      ticketSearch,
      page,
      perPage,
    ],
    queryFn: () =>
      fetchSchoolHistoryIncidents(id, {
        category,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        status: status === 'ALL' ? undefined : status,
        scope: scope || undefined,
        q: ticketSearch.trim() || undefined,
        page,
        per_page: perPage,
      }),
    enabled: Number.isFinite(id) && id > 0,
    placeholderData: keepPreviousData,
  })

  const school = overview.data?.school
  const network = overview.data?.network
  const monitoring = overview.data?.monitoring
  const statistics = overview.data?.statistics
  const rows = incidents.data?.data ?? []
  const meta = incidents.data?.meta
  const categoryCounts = statistics?.por_categoria
  const activeTab = HISTORY_TABS.find((tab) => tab.id === category) ?? HISTORY_TABS[0]

  const cid = network?.cid ?? null
  const tech = network?.tecnologia_acceso ?? null
  const titleCid = cid ? `CID ${cid}` : `Colegio #${id}`
  const place = [school?.provincia, school?.distrito].filter(Boolean).join(' · ')
  const hasActive = (statistics?.caidas_activas ?? 0) > 0
  const [pngBusyId, setPngBusyId] = useState<number | null>(null)
  const [pngError, setPngError] = useState<string | null>(null)

  const refreshAll = async () => {
    await Promise.all([overview.refetch(), incidents.refetch()])
  }

  const clearFilters = () => {
    setDateFrom('')
    setDateTo('')
    setStatus('ALL')
    setScope('')
    setTicketSearch('')
    setPage(1)
  }

  return (
    <DisenoApp
      bare
      syncing={prtg.isPending}
      onRefresh={() => void refreshAll()}
      onSyncPrtg={() => prtg.mutate()}
    >
      <div className="mb-4">
        <Link
          to="/history/schools"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition hover:text-slate-900 dark:hover:text-slate-100"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Historial por colegio
        </Link>
      </div>

      {overview.isLoading ? <LoadingState /> : null}
      {overview.isError ? (
        <ErrorState message={overview.error instanceof Error ? overview.error.message : 'Error'} />
      ) : null}

      {school && statistics ? (
        <div className="space-y-5">
          <section className="relative overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(59,130,246,0.08),_transparent_55%),linear-gradient(180deg,_rgba(248,250,252,0.9),_transparent_42%)] dark:bg-[radial-gradient(ellipse_at_top_right,_rgba(59,130,246,0.12),_transparent_55%),linear-gradient(180deg,_rgba(15,23,42,0.55),_transparent_45%)]"
              aria-hidden
            />
            <div className="relative flex flex-col gap-4 p-5 md:flex-row md:items-start md:justify-between md:p-6">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold tracking-[0.14em] text-slate-500 uppercase">
                  Historial operativo
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-2.5">
                  <h1 className="text-2xl font-bold tracking-tight text-slate-950 dark:text-slate-50">
                    {titleCid}
                  </h1>
                  <PrtgStatusBadge status={monitoring?.estado_actual} />
                  {hasActive ? <Insignia tone="danger">Caída activa</Insignia> : null}
                  {statistics.total_caidas > 1 ? (
                    <Insignia
                      tone="warning"
                      title={`${statistics.total_caidas} caídas registradas de este colegio`}
                    >
                      Reincidencia ×{statistics.total_caidas}
                    </Insignia>
                  ) : null}
                </div>
                <p className="mt-1 text-[15px] font-medium text-slate-700 dark:text-slate-200">
                  {[school.codigo_local, school.local_educativo].filter(Boolean).join(' · ') || 'Sin nombre'}
                </p>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <InsigniaEnergia energy={school.energy_type} />
                  {tech ? (
                    <span
                      className={`inline-flex rounded-md px-2.5 py-1 text-[12px] font-semibold ${techBadgeClass(tech)}`}
                    >
                      {tech}
                    </span>
                  ) : null}
                  {school.ambito ? (
                    <span
                      className={`inline-flex rounded-md px-2.5 py-1 text-[12px] font-semibold ${
                        school.ambito.toUpperCase().includes('URBAN')
                          ? statusTone.info.badge
                          : statusTone.warning.badge
                      }`}
                    >
                      {school.ambito.toUpperCase().includes('URBAN') ? 'Urbana' : 'Rural'}
                    </span>
                  ) : null}
                  <InsigniaDesajusteUbicacion
                    compact
                    info={{
                      location_mismatch: school.location_mismatch,
                      provincia: school.provincia,
                      distrito: school.distrito,
                      prtg_province: network?.prtg_province,
                      prtg_district: network?.prtg_district,
                      admin_provincia: school.admin_provincia,
                      admin_distrito: school.admin_distrito,
                      location_source: school.location_source,
                    }}
                  />
                </div>

                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[13px] text-slate-500 dark:text-slate-400">
                  {place ? (
                    <span className="inline-flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      Zona PRTG: {place}
                    </span>
                  ) : null}
                  {network?.nodo_pop ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Radio className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      Nodo/POP: {network.nodo_pop}
                    </span>
                  ) : null}
                  {school.admin_provincia || school.admin_distrito ? (
                    <span className="inline-flex items-center gap-1.5">
                      Admin: {[school.admin_provincia, school.admin_distrito].filter(Boolean).join(' · ') || '—'}
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <Boton type="button" variant="secondary" size="sm" onClick={() => void refreshAll()}>
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                  Actualizar
                </Boton>
                <Boton type="button" variant="secondary" size="sm" onClick={() => navigate(`/schools/${id}`)}>
                  <GraduationCap className="h-3.5 w-3.5" aria-hidden />
                  Ver ficha maestra
                </Boton>
              </div>
            </div>
          </section>

          <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
            <KpiCard label="Total caídas" value={statistics.total_caidas} icon={<TriangleAlert />} tone="warning" />
            <KpiCard label="Tickets" value={statistics.tickets_total ?? 0} icon={<History />} tone="info" />
            <KpiCard
              label="Tickets abiertos"
              value={statistics.tickets_abiertos ?? 0}
              icon={<TriangleAlert />}
              tone={(statistics.tickets_abiertos ?? 0) > 0 ? 'warning' : 'neutral'}
            />
            <KpiCard label="Recuperaciones" value={statistics.recuperaciones} icon={<CircleCheck />} tone="success" />
            <KpiCard
              label="Caídas activas"
              value={statistics.caidas_activas}
              icon={<TriangleAlert />}
              tone={statistics.caidas_activas > 0 ? 'danger' : 'neutral'}
            />
            <KpiCard label="Tiempo total caído" value={statistics.tiempo_total_caido ?? '—'} icon={<Clock3 />} />
            <KpiCard label="Última caída" value={formatRelativeDateTime(statistics.ultima_caida)} icon={<History />} />
            <KpiCard
              label="Última recuperación"
              value={formatRelativeDateTime(statistics.ultima_recuperacion)}
              icon={<CircleCheck />}
              tone="success"
            />
            <KpiCard label="Duración promedio" value={statistics.duracion_promedio ?? '—'} icon={<Clock3 />} tone="cyan" />
            <KpiCard label="Mayor caída" value={statistics.mayor_caida ?? '—'} icon={<Zap />} tone="warning" />
          </div>

          <section className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-3 dark:border-slate-800">
              <div>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">Últimos 30 días</h2>
                <p className="text-[12px] text-slate-500">Resumen del periodo reciente</p>
              </div>
            </div>
            <div className="grid divide-y divide-slate-100 sm:grid-cols-3 sm:divide-x sm:divide-y-0 dark:divide-slate-800">
              <PeriodStat label="Caídas" value={String(statistics.ultimos_30_dias.caidas)} />
              <PeriodStat label="Duración total" value={statistics.ultimos_30_dias.duracion_total ?? '—'} />
              <PeriodStat label="Promedio" value={statistics.ultimos_30_dias.promedio ?? '—'} />
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm md:p-5 dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-3">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">Historial por tipo</h2>
              <p className="mt-0.5 text-[13px] text-slate-500 dark:text-slate-400">{activeTab.hint}</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
              {HISTORY_TABS.map((tab) => {
                const count = categoryCounts?.[tab.id] ?? 0
                const selected = category === tab.id
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => {
                      setCategory(tab.id)
                      setPage(1)
                    }}
                    className={`group rounded-xl border px-3.5 py-3 text-left transition duration-150 ${
                      selected
                        ? 'border-slate-900 bg-slate-900 text-white shadow-md shadow-slate-900/15 dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900 dark:shadow-none'
                        : 'border-slate-200/90 bg-slate-50/80 hover:border-slate-300 hover:bg-white dark:border-slate-700 dark:bg-slate-800/40 dark:hover:border-slate-600 dark:hover:bg-slate-800'
                    }`}
                  >
                    <span className={`block text-[12px] font-semibold ${selected ? 'opacity-90' : 'text-slate-600 dark:text-slate-300'}`}>
                      {tab.label}
                    </span>
                    <span className={`mt-1 block text-2xl font-bold tracking-tight tabular-nums ${selected ? '' : 'text-slate-950 dark:text-slate-50'}`}>
                      {count}
                    </span>
                  </button>
                )
              })}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm md:p-5 dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">Filtros</h2>
                <p className="text-[12px] text-slate-500">Acota el historial de {activeTab.label.toLowerCase()}</p>
              </div>
              <Boton type="button" size="sm" variant="ghost" onClick={clearFilters}>
                Limpiar
              </Boton>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              <FormField label="Fecha desde">
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => {
                    setDateFrom(e.target.value)
                    setPage(1)
                  }}
                />
              </FormField>
              <FormField label="Fecha hasta">
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => {
                    setDateTo(e.target.value)
                    setPage(1)
                  }}
                />
              </FormField>
              <FormField label="Estado">
                <Select
                  value={status}
                  onChange={(e) => {
                    setStatus(e.target.value)
                    setPage(1)
                  }}
                >
                  <option value="ALL">Todos</option>
                  <option value="RECOVERED">Recuperadas</option>
                  <option value="ACTIVE">Siguen caídas</option>
                </Select>
              </FormField>
              <FormField label="PEXT / PINT">
                <Select
                  value={scope}
                  onChange={(e) => {
                    setScope(e.target.value)
                    setPage(1)
                  }}
                >
                  <option value="">Todos</option>
                  <option value="PEXT">PEXT</option>
                  <option value="PINT">PINT</option>
                </Select>
              </FormField>
              <FormField label="Buscar ticket">
                <Input
                  value={ticketSearch}
                  onChange={(e) => {
                    setTicketSearch(e.target.value)
                    setPage(1)
                  }}
                  placeholder="TGS_258839_1…"
                />
              </FormField>
            </div>
          </section>

          <section className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="border-b border-slate-100 px-5 py-4 dark:border-slate-800">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold tracking-tight text-slate-950 dark:text-slate-50">
                    {activeTab.label}
                    <span className="ml-2 text-sm font-medium text-slate-400">· tickets</span>
                  </h2>
                  <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-slate-500 dark:text-slate-400">
                    El ticket TGS nace al gestionar. Cada apartado muestra solo ese tipo. Puedes volver a descargar la
                    imagen del ticket con el ícono verde.
                  </p>
                </div>
                {meta ? (
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-[12px] font-semibold text-slate-600 tabular-nums dark:bg-slate-800 dark:text-slate-300">
                    {meta.total.toLocaleString('es-PE')} registro{meta.total === 1 ? '' : 's'}
                  </span>
                ) : null}
              </div>
              {pngError ? <p className="mt-3 text-sm text-red-600">{pngError}</p> : null}
            </div>

            <div className="p-0">
              {incidents.isLoading ? (
                <div className="p-5">
                  <LoadingState />
                </div>
              ) : null}
              {incidents.isError ? (
                <div className="p-5">
                  <ErrorState
                    message={incidents.error instanceof Error ? incidents.error.message : 'Error'}
                  />
                </div>
              ) : null}
              {!incidents.isLoading && rows.length === 0 ? (
                <div className="p-5">
                  <EmptyState title="Sin incidencias" description="No hay incidencias con los filtros actuales." />
                </div>
              ) : null}
              {rows.length > 0 ? (
                <>
                  <DataTableContainer className="rounded-none border-0 shadow-none">
                    <table className="w-full min-w-[1120px] border-collapse text-left text-[13px]">
                      <colgroup>
                        <col className="w-[9.5rem]" />
                        <col className="w-[7.5rem]" />
                        <col className="w-[7.5rem]" />
                        <col className="w-[5.75rem]" />
                        <col className="w-[9rem]" />
                        <col className="w-[7rem]" />
                        <col />
                        <col className="w-[8.5rem]" />
                        <col className="w-[5.5rem]" />
                      </colgroup>
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50/90 dark:border-slate-800 dark:bg-slate-950/50">
                          <th className={histTh}>Ticket</th>
                          <th className={histTh}>
                            <span className="block">Caída</span>
                            <span className="block text-[10px] font-normal normal-case tracking-normal text-slate-400">
                              fecha · hora
                            </span>
                          </th>
                          <th className={histTh}>
                            <span className="block">Recuperación</span>
                            <span className="block text-[10px] font-normal normal-case tracking-normal text-slate-400">
                              fecha · hora
                            </span>
                          </th>
                          <th className={histTh}>Duración</th>
                          <th className={histTh}>Estado actual</th>
                          <th className={histTh}>Gestión</th>
                          <th className={histTh}>Último seguimiento</th>
                          <th className={`${histTh} hidden lg:table-cell`}>Cerrado por</th>
                          <th className={`${histTh} sticky right-0 z-10 bg-slate-50/95 text-right dark:bg-slate-950/80`}>
                            Ver
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                        {rows.map((row) => (
                          <tr
                            key={row.id}
                            className="group transition-colors hover:bg-blue-50/40 dark:hover:bg-slate-800/50"
                          >
                            <td className={histTd} title={row.reincidencia.label ?? undefined}>
                              {row.ticket_code ? (
                                <div>
                                  <span className="font-mono text-[12px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                                    {row.ticket_code}
                                  </span>
                                  {row.category && row.category !== 'caidas_normales' ? (
                                    <span
                                      className={`mt-1 block w-fit rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
                                        row.category === 'mantenimientos'
                                          ? 'bg-teal-50 text-teal-800 dark:bg-teal-950 dark:text-teal-200'
                                          : row.category === 'requerimientos'
                                            ? 'bg-violet-50 text-violet-800 dark:bg-violet-950 dark:text-violet-200'
                                            : row.category === 'enlace_parcial'
                                              ? 'bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200'
                                              : 'bg-rose-50 text-rose-800 dark:bg-rose-950 dark:text-rose-200'
                                      }`}
                                    >
                                      {row.category_label}
                                      {row.is_maintenance && row.ticket_kind_label ? ` · ${row.ticket_kind_label}` : ''}
                                    </span>
                                  ) : null}
                                </div>
                              ) : (
                                <span className="text-[12px] font-medium text-amber-700 dark:text-amber-300">
                                  Sin ticket
                                </span>
                              )}
                            </td>
                            <td className={histTd}>
                              <IsoDateTimeCell value={row.started_at} />
                            </td>
                            <td className={histTd}>
                              {row.recovered_at ? (
                                <IsoDateTimeCell
                                  value={row.recovered_at}
                                  hint={
                                    row.same_day ? (
                                      <span className="text-emerald-600 dark:text-emerald-400">· mismo día</span>
                                    ) : null
                                  }
                                />
                              ) : (
                                <span className="font-semibold text-red-700 dark:text-red-400">Sigue caída</span>
                              )}
                            </td>
                            <td className={`${histTd} whitespace-nowrap font-medium tabular-nums text-slate-800 dark:text-slate-100`}>
                              {row.duration ?? '—'}
                            </td>
                            <td className={histTd}>
                              <CaseStatusBadge status={row.case_status} />
                            </td>
                            <td className={histTd}>
                              {row.managements_count > 0 ? (
                                <span className="font-medium text-slate-800 dark:text-slate-100">
                                  {row.managements_count} gestión{row.managements_count === 1 ? '' : 'es'}
                                </span>
                              ) : (
                                <span className="text-slate-400">Sin gestión</span>
                              )}
                              {row.management_scope ? (
                                <span className="mt-0.5 block text-[11px] font-medium text-slate-500">
                                  {row.management_scope}
                                </span>
                              ) : null}
                            </td>
                            <td className={histTd}>
                              <LastFollowup row={row} />
                            </td>
                            <td className={`${histTd} hidden lg:table-cell`}>
                              {row.tracking?.closed_at ? (
                                <span className="block min-w-0">
                                  <Truncate className="font-medium" title={row.tracking.closed_by_name}>
                                    {row.tracking.closed_by_name ?? '—'}
                                  </Truncate>
                                  <span className="block text-[11px] tabular-nums text-slate-500">
                                    {formatRelativeDateTime(row.tracking.closed_at)}
                                  </span>
                                </span>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </td>
                            <td className="sticky right-0 z-10 bg-white px-3 py-3 text-right group-hover:bg-blue-50/40 dark:bg-slate-900 dark:group-hover:bg-slate-800/50">
                              <div className="inline-flex items-center justify-end gap-1">
                                {row.ticket_code ? (
                                  <button
                                    type="button"
                                    title={`Descargar imagen ${row.ticket_code}`}
                                    aria-label={`Descargar imagen ${row.ticket_code}`}
                                    disabled={pngBusyId === row.id}
                                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-transparent text-teal-700 transition hover:border-teal-200 hover:bg-teal-50 disabled:opacity-50 dark:text-teal-300 dark:hover:border-teal-800 dark:hover:bg-teal-950/40"
                                    onClick={() => {
                                      setPngError(null)
                                      setPngBusyId(row.id)
                                      void downloadTicketImageFromIncidentId(row.id)
                                        .catch((err: unknown) =>
                                          setPngError(
                                            err instanceof Error ? err.message : 'No se pudo generar la imagen.',
                                          ),
                                        )
                                        .finally(() => setPngBusyId(null))
                                    }}
                                  >
                                    <ImageDown className="h-4 w-4" aria-hidden />
                                  </button>
                                ) : null}
                                <Link
                                  to={incidentCaseFilePath(row.id)}
                                  title="Ver historial del ticket / caída"
                                  aria-label={`Ver ${row.ticket_code ?? `caída ${row.id}`}`}
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-transparent text-blue-700 transition hover:border-blue-200 hover:bg-blue-50 dark:text-blue-300 dark:hover:border-blue-800 dark:hover:bg-blue-950/40"
                                >
                                  <Eye className="h-4 w-4" aria-hidden />
                                </Link>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </DataTableContainer>
                  {meta ? (
                    <div className="border-t border-slate-100 px-4 py-3 dark:border-slate-800">
                      <BarraPaginacion
                        page={meta.current_page}
                        lastPage={meta.last_page}
                        total={meta.total}
                        perPage={meta.per_page}
                        pageSizeOptions={[10, 25, 50]}
                        onPageChange={setPage}
                        onPerPageChange={(n) => {
                          setPerPage(n)
                          setPage(1)
                        }}
                      />
                    </div>
                  ) : null}
                </>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}
    </DisenoApp>
  )
}

const histTh =
  'px-3 py-3 text-[11px] font-semibold tracking-[0.08em] text-slate-500 uppercase dark:text-slate-400'

const histTd = 'px-3 py-3 align-top text-slate-700 dark:text-slate-300'

function KpiCard({
  label,
  value,
  icon,
  tone = 'neutral',
}: {
  label: string
  value: number | string
  icon: ReactNode
  tone?: StatusTone
}) {
  return (
    <article className="group relative overflow-hidden rounded-2xl border border-slate-200/90 bg-white p-3.5 shadow-sm transition duration-150 hover:-translate-y-0.5 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:shadow-none">
      <div className={`absolute inset-y-0 left-0 w-1 ${toneBar[tone]}`} aria-hidden />
      <div className="flex items-start gap-3 pl-1.5">
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${statusTone[tone].iconBg}`}
          aria-hidden
        >
          <span className="inline-flex h-4 w-4 items-center justify-center [&>svg]:h-4 [&>svg]:w-4">
            {icon}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[10px] font-semibold tracking-[0.12em] text-slate-500 uppercase dark:text-slate-400">
            {label}
          </p>
          <p className="mt-1 truncate text-lg font-bold tracking-tight text-slate-950 tabular-nums sm:text-xl dark:text-slate-50">
            {typeof value === 'number' ? value.toLocaleString('es-PE') : value}
          </p>
        </div>
      </div>
    </article>
  )
}

const toneBar: Record<StatusTone, string> = {
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  danger: 'bg-red-500',
  info: 'bg-blue-500',
  cyan: 'bg-cyan-500',
  indigo: 'bg-indigo-500',
  neutral: 'bg-slate-300 dark:bg-slate-600',
}

function PeriodStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-5 py-4">
      <p className="text-[11px] font-semibold tracking-[0.12em] text-slate-500 uppercase dark:text-slate-400">
        {label}
      </p>
      <p className="mt-1 text-lg font-bold tracking-tight text-slate-950 tabular-nums dark:text-slate-50">
        {value}
      </p>
    </div>
  )
}

function LastFollowup({ row }: { row: SchoolHistoryIncidentRow }) {
  if (row.cause) {
    return (
      <Truncate lines={2} title={row.cause} className="text-slate-600 dark:text-slate-400">
        {row.cause}
      </Truncate>
    )
  }
  if (row.followup_label) {
    return <span className="text-slate-500 dark:text-slate-400">{row.followup_label}</span>
  }
  if (row.ticket_code) {
    return <span className="font-mono text-[12px] text-slate-600 dark:text-slate-300">{row.ticket_code}</span>
  }
  return <span className="text-slate-400">—</span>
}
