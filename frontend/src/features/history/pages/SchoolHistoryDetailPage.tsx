import { useState } from 'react'
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
  RefreshCw,
  TriangleAlert,
} from 'lucide-react'
import { AppLayout } from '../../../layouts/AppLayout'
import { PageHeader } from '../../../components/ui/PageHeader'
import { SectionCard } from '../../../components/ui/Card'
import { Button } from '../../../components/ui/Button'
import { EmptyState, ErrorState, LoadingState } from '../../../components/ui/States'
import { CaseStatusBadge, PrtgStatusBadge } from '../../../components/monitoring/StatusBadges'
import { Badge } from '../../../components/ui/SoftBadge'
import {
  DataTableContainer,
  IsoDateTimeCell,
  tdDateClassName,
  Truncate,
  tableClassName,
  tdClassName,
  thClassName,
  theadClassName,
  trClassName,
} from '../../../components/ui/DataTableFrame'
import { FilterCard } from '../../../components/ui/FilterCard'
import { FormField, Input, Select } from '../../../components/ui/FormControls'
import { MetricCard } from '../../../components/ui/MetricCard'
import { MetricsGrid } from '../../../components/ui/MetricsGrid'
import { PaginationBar } from '../../../components/ui/PaginationBar'
import { useManualSync } from '../../dashboard/hooks/useDashboard'
import { LocationMismatchBadge } from '../../locations/components/LocationMismatchBadge'
import { techBadgeClass } from '../../../lib/uiTokens'
import { formatRelativeDateTime } from '../../../lib/datetime'
import { downloadTicketImageFromIncidentId } from '../../incidents/lib/ticketImage'
import {
  fetchSchoolHistoryIncidents,
  fetchSchoolHistoryOverview,
  incidentCaseFilePath,
} from '../api/historyApi'
import type { SchoolHistoryCategory, SchoolHistoryIncidentRow } from '../types/history'

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

export function SchoolHistoryDetailPage() {
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
  const titleCid = cid ? `CID${cid}` : `Colegio #${id}`
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
    <AppLayout
      bare
      syncing={prtg.isPending}
      onRefresh={() => void refreshAll()}
      onSyncPrtg={() => prtg.mutate()}
    >
      <div className="mb-3">
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
        <>
          <PageHeader
            icon={<History className="h-5 w-5" aria-hidden />}
            title={titleCid}
            description={[school.codigo_local, school.local_educativo].filter(Boolean).join(' · ') || 'Sin nombre'}
            badges={
              <>
                <PrtgStatusBadge status={monitoring?.estado_actual} />
                {tech ? (
                  <span
                    className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${techBadgeClass(tech)}`}
                  >
                    {tech}
                  </span>
                ) : null}
                {school.ambito ? (
                  <span
                    className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                      school.ambito.toUpperCase().includes('URBAN')
                        ? 'bg-sky-100 text-sky-800 dark:bg-sky-950/40 dark:text-sky-300'
                        : 'bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200'
                    }`}
                  >
                    {school.ambito.toUpperCase().includes('URBAN') ? 'Urbana' : 'Rural'}
                  </span>
                ) : null}
                {hasActive ? <Badge tone="danger">Caída activa</Badge> : null}
                {statistics.total_caidas > 1 ? (
                  <Badge tone="warning" title={`${statistics.total_caidas} caídas registradas de este colegio`}>
                    Reincidencia ×{statistics.total_caidas}
                  </Badge>
                ) : null}
                <LocationMismatchBadge
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
              </>
            }
            actions={
              <>
                <Button type="button" variant="secondary" size="sm" onClick={() => void refreshAll()}>
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                  Actualizar
                </Button>
                <Button type="button" variant="secondary" size="sm" onClick={() => navigate(`/schools/${id}`)}>
                  <GraduationCap className="h-3.5 w-3.5" aria-hidden />
                  Ver ficha maestra
                </Button>
              </>
            }
          />

          {place ? (
            <p className="-mt-4 mb-5 text-sm font-medium text-slate-500">
              Zona operativa PRTG: {place}
              {school.admin_provincia || school.admin_distrito ? (
                <span className="ml-2 font-normal text-slate-400">
                  · Admin: {[school.admin_provincia, school.admin_distrito].filter(Boolean).join(' · ') || '—'}
                </span>
              ) : null}
            </p>
          ) : null}

          <MetricsGrid dense>
            <MetricCard label="Total caídas" value={statistics.total_caidas} icon={<TriangleAlert />} />
            <MetricCard label="Tickets" value={statistics.tickets_total ?? 0} icon={<History />} tone="info" />
            <MetricCard
              label="Tickets abiertos"
              value={statistics.tickets_abiertos ?? 0}
              icon={<TriangleAlert />}
              tone={(statistics.tickets_abiertos ?? 0) > 0 ? 'warning' : 'neutral'}
            />
            <MetricCard label="Recuperaciones" value={statistics.recuperaciones} icon={<CircleCheck />} tone="success" />
            <MetricCard
              label="Caídas activas"
              value={statistics.caidas_activas}
              icon={<TriangleAlert />}
              tone={statistics.caidas_activas > 0 ? 'danger' : 'neutral'}
            />
            <MetricCard label="Tiempo total caído" value={statistics.tiempo_total_caido ?? '—'} icon={<Clock3 />} />
            <MetricCard label="Última caída" value={formatRelativeDateTime(statistics.ultima_caida)} icon={<History />} />
            <MetricCard
              label="Última recuperación"
              value={formatRelativeDateTime(statistics.ultima_recuperacion)}
              icon={<CircleCheck />}
              tone="success"
            />
            <MetricCard label="Duración promedio" value={statistics.duracion_promedio ?? '—'} icon={<Clock3 />} />
            <MetricCard label="Mayor caída" value={statistics.mayor_caida ?? '—'} icon={<TriangleAlert />} tone="warning" />
          </MetricsGrid>

          <div className="mb-4">
            <SectionCard title="Últimos 30 días">
              <div className="grid gap-3 sm:grid-cols-3">
                <StatLine label="Caídas" value={String(statistics.ultimos_30_dias.caidas)} />
                <StatLine label="Duración total" value={statistics.ultimos_30_dias.duracion_total ?? '—'} />
                <StatLine label="Promedio" value={statistics.ultimos_30_dias.promedio ?? '—'} />
              </div>
            </SectionCard>
          </div>

          <div className="mb-4 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
              <div>
                <p className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase">Historial por tipo</p>
                <p className="text-sm text-slate-600 dark:text-slate-300">{activeTab.hint}</p>
              </div>
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
                    className={`rounded-lg border px-3 py-2.5 text-left transition ${
                      selected
                        ? 'border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900'
                        : 'border-slate-200 bg-slate-50 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800/50'
                    }`}
                  >
                    <span className="block text-[12px] font-semibold">{tab.label}</span>
                    <span className={`mt-0.5 block text-lg font-bold tabular-nums ${selected ? '' : 'text-slate-900 dark:text-slate-100'}`}>
                      {count}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="mb-4">
            <FilterCard
              actions={
                <Button type="button" size="sm" variant="ghost" onClick={clearFilters}>
                  Limpiar
                </Button>
              }
            >
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
            </FilterCard>
          </div>

          <SectionCard title={`${activeTab.label} · tickets`}>
            <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
              El ticket TGS nace al gestionar. Cada apartado muestra solo ese tipo. Puedes volver a descargar la imagen del ticket con el ícono verde.
            </p>
            {pngError ? <p className="mb-3 text-sm text-red-600">{pngError}</p> : null}
            {incidents.isLoading ? <LoadingState /> : null}
            {incidents.isError ? (
              <ErrorState
                message={incidents.error instanceof Error ? incidents.error.message : 'Error'}
              />
            ) : null}
            {!incidents.isLoading && rows.length === 0 ? (
              <EmptyState title="Sin incidencias" description="No hay incidencias con los filtros actuales." />
            ) : null}
            {rows.length > 0 ? (
              <>
                <DataTableContainer>
                  <table className={`${tableClassName} table-fixed`} style={{ minWidth: 1120 }}>
                    <colgroup>
                      <col className="w-[3.75rem]" />
                      <col className="w-[6.5rem]" />
                      <col className="w-[7rem]" />
                      <col className="w-[5.5rem]" />
                      <col className="w-[10.5rem]" />
                      <col className="w-[6.5rem]" />
                      <col style={{ width: '10rem' }} />
                      <col className="w-[8rem]" />
                      <col className="w-[4.5rem]" />
                    </colgroup>
                    <thead className={theadClassName}>
                      <tr>
                        <th className={thClassName}>Ticket</th>
                        <th className={thClassName}>
                          <span className="block">Caída</span>
                          <span className="block text-[10px] font-normal normal-case tracking-normal text-slate-400">fecha · hora</span>
                        </th>
                        <th className={thClassName}>
                          <span className="block">Recuperación</span>
                          <span className="block text-[10px] font-normal normal-case tracking-normal text-slate-400">fecha · hora</span>
                        </th>
                        <th className={thClassName}>Duración</th>
                        <th className={thClassName}>Estado actual</th>
                        <th className={thClassName}>Gestión</th>
                        <th className={thClassName}>Último seguimiento</th>
                        <th className={`${thClassName} hidden lg:table-cell`}>Cerrado por</th>
                        <th className={`${thClassName} sticky right-0 z-10 bg-slate-50 text-right shadow-[-8px_0_8px_-8px_rgba(15,23,42,0.12)] dark:bg-slate-900`}>
                          Ver
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr key={row.id} className={`${trClassName} group`}>
                          <td className={tdClassName} title={row.reincidencia.label ?? undefined}>
                            {row.ticket_code ? (
                              <div>
                                <span className="font-mono text-[12px] font-semibold text-slate-900 dark:text-slate-100">
                                  {row.ticket_code}
                                </span>
                                {row.category && row.category !== 'caidas_normales' ? (
                                  <span
                                    className={`mt-0.5 block w-fit rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
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
                              <span className="text-[12px] text-amber-700 dark:text-amber-300">Sin ticket</span>
                            )}
                          </td>
                          <td className={tdDateClassName}>
                            <IsoDateTimeCell value={row.started_at} />
                          </td>
                          <td className={tdDateClassName}>
                            {row.recovered_at ? (
                              <IsoDateTimeCell
                                value={row.recovered_at}
                                hint={row.same_day ? <span className="text-emerald-600 dark:text-emerald-400">· mismo día</span> : null}
                              />
                            ) : (
                              <span className="font-semibold text-red-700 dark:text-red-400">Sigue caída</span>
                            )}
                          </td>
                          <td className={`${tdClassName} whitespace-nowrap tabular-nums`}>{row.duration ?? '—'}</td>
                          <td className={tdClassName}>
                            <CaseStatusBadge status={row.case_status} />
                          </td>
                          <td className={tdClassName}>
                            {row.managements_count > 0 ? (
                              <span className="font-medium">
                                {row.managements_count} gestión{row.managements_count === 1 ? '' : 'es'}
                              </span>
                            ) : (
                              <span className="text-slate-400">Sin gestión</span>
                            )}
                            {row.management_scope ? (
                              <span className="block text-[11px] text-slate-500">{row.management_scope}</span>
                            ) : null}
                          </td>
                          <td className={tdClassName}>
                            <LastFollowup row={row} />
                          </td>
                          <td className={`${tdClassName} hidden lg:table-cell`}>
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
                          <td className="sticky right-0 z-10 bg-white px-2.5 py-2 text-right shadow-[-8px_0_8px_-8px_rgba(15,23,42,0.12)] group-hover:bg-slate-50 dark:bg-slate-900 dark:group-hover:bg-slate-800/60">
                            <div className="inline-flex items-center justify-end gap-0.5">
                              {row.ticket_code ? (
                                <button
                                  type="button"
                                  title={`Descargar imagen ${row.ticket_code}`}
                                  aria-label={`Descargar imagen ${row.ticket_code}`}
                                  disabled={pngBusyId === row.id}
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-teal-700 transition hover:bg-teal-50 disabled:opacity-50 dark:text-teal-300 dark:hover:bg-teal-950/40"
                                  onClick={() => {
                                    setPngError(null)
                                    setPngBusyId(row.id)
                                    void downloadTicketImageFromIncidentId(row.id)
                                      .catch((err: unknown) =>
                                        setPngError(err instanceof Error ? err.message : 'No se pudo generar la imagen.'),
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
                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-blue-700 transition hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-blue-950/40"
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
                  <PaginationBar
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
                ) : null}
              </>
            ) : null}
          </SectionCard>
        </>
      ) : null}

    </AppLayout>
  )
}

function LastFollowup({ row }: { row: SchoolHistoryIncidentRow }) {
  // Preferimos estado operativo / causa; no mostramos notas internas de Tracking.
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

function StatLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800/60">
      <p className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-slate-100">{value}</p>
    </div>
  )
}
