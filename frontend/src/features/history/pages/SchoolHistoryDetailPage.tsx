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
import { PaginationBar } from '../../../components/ui/PaginationBar'
import { useManualSync } from '../../dashboard/hooks/useDashboard'
import { LocationMismatchBadge } from '../../locations/components/LocationMismatchBadge'
import { techBadgeClass } from '../../../lib/uiTokens'
import { formatRelativeDateTime } from '../../../lib/datetime'
import { trackingStatusTone } from '../../tracking/lib/trackingStatus'
import {
  fetchSchoolHistoryIncidents,
  fetchSchoolHistoryOverview,
  incidentCaseFilePath,
} from '../api/historyApi'
import type { SchoolHistoryIncidentRow } from '../types/history'

export function SchoolHistoryDetailPage() {
  const { schoolId } = useParams()
  const id = Number(schoolId)
  const navigate = useNavigate()
  const { prtg } = useManualSync()

  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [status, setStatus] = useState('ALL')
  const [scope, setScope] = useState('')
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
      dateFrom,
      dateTo,
      status,
      scope,
      page,
      perPage,
    ],
    queryFn: () =>
      fetchSchoolHistoryIncidents(id, {
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        status: status === 'ALL' ? undefined : status,
        scope: scope || undefined,
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

  const cid = network?.cid ?? null
  const tech = network?.tecnologia_acceso ?? null
  const titleCid = cid ? `CID${cid}` : `Colegio #${id}`
  const place = [school?.provincia, school?.distrito].filter(Boolean).join(' · ')
  const hasActive = (statistics?.caidas_activas ?? 0) > 0

  const refreshAll = async () => {
    await Promise.all([overview.refetch(), incidents.refetch()])
  }

  const clearFilters = () => {
    setDateFrom('')
    setDateTo('')
    setStatus('ALL')
    setScope('')
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
                {hasActive ? <Badge tone="danger">Caída activa</Badge> : null}
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

          <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Total caídas" value={statistics.total_caidas} icon={<TriangleAlert className="h-4 w-4" />} />
            <MetricCard
              label="Recuperaciones"
              value={statistics.recuperaciones}
              icon={<CircleCheck className="h-4 w-4" />}
              tone="success"
            />
            <MetricCard
              label="Caídas activas"
              value={statistics.caidas_activas}
              icon={<TriangleAlert className="h-4 w-4" />}
              tone={statistics.caidas_activas > 0 ? 'danger' : 'neutral'}
            />
            <MetricCard
              label="Tiempo total caído"
              value={statistics.tiempo_total_caido ?? '—'}
              icon={<Clock3 className="h-4 w-4" />}
            />
            <MetricCard
              label="Última caída"
              value={formatRelativeDateTime(statistics.ultima_caida)}
              icon={<History className="h-4 w-4" />}
            />
            <MetricCard
              label="Última recuperación"
              value={formatRelativeDateTime(statistics.ultima_recuperacion)}
              icon={<CircleCheck className="h-4 w-4" />}
              tone="success"
            />
            <MetricCard
              label="Duración promedio"
              value={statistics.duracion_promedio ?? '—'}
              icon={<Clock3 className="h-4 w-4" />}
            />
            <MetricCard
              label="Mayor caída"
              value={statistics.mayor_caida ?? '—'}
              icon={<TriangleAlert className="h-4 w-4" />}
              tone="warning"
            />
          </div>

          <div className="mb-4">
            <SectionCard title="Últimos 30 días">
              <div className="grid gap-3 sm:grid-cols-3">
                <StatLine label="Caídas" value={String(statistics.ultimos_30_dias.caidas)} />
                <StatLine label="Duración total" value={statistics.ultimos_30_dias.duracion_total ?? '—'} />
                <StatLine label="Promedio" value={statistics.ultimos_30_dias.promedio ?? '—'} />
              </div>
            </SectionCard>
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
            </FilterCard>
          </div>

          <SectionCard title="Incidencias históricas">
            <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
              Cada incidencia abre su expediente completo: gestiones, seguimientos de Tracking, motivos,
              responsables y cierre.
            </p>
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
                      <col className="w-[8.5rem]" />
                      <col style={{ width: '10rem' }} />
                      <col className="w-[8rem]" />
                      <col className="w-[4.5rem]" />
                    </colgroup>
                    <thead className={theadClassName}>
                      <tr>
                        <th className={thClassName}>N°</th>
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
                        <th className={thClassName}>Tracking</th>
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
                            <span className="font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                              {row.reincidencia.numero ?? '—'}
                            </span>
                            <span className="text-[11px] tabular-nums text-slate-400">/{row.reincidencia.total}</span>
                          </td>
                          <td className={tdClassName}>
                            <IsoDateTimeCell value={row.started_at} />
                          </td>
                          <td className={tdClassName}>
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
                            {row.tracking ? (
                              <span className="flex min-w-0 flex-col items-start gap-0.5">
                                <Truncate className="font-medium tabular-nums" title={row.tracking.ticket}>
                                  {row.tracking.ticket ?? 'Sin ticket'}
                                </Truncate>
                                <Badge tone={trackingStatusTone(row.tracking.status)}>
                                  {row.tracking.status_label ?? row.tracking.status}
                                </Badge>
                              </span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
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
                            <Link
                              to={incidentCaseFilePath(row.id)}
                              title="Ver historial completo de la incidencia"
                              aria-label={`Ver incidencia ${row.id}`}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-blue-700 transition hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-blue-950/40"
                            >
                              <Eye className="h-4 w-4" aria-hidden />
                            </Link>
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
  const last = row.tracking?.last_update
  if (last) {
    return (
      <span className="block min-w-0">
        <Truncate lines={2} title={last.body} className="text-slate-700 dark:text-slate-300">
          {last.body || '—'}
        </Truncate>
        <span className="block truncate text-[11px] text-slate-500">
          {last.actor} · {formatRelativeDateTime(last.at)}
        </span>
      </span>
    )
  }
  if (row.cause) {
    return (
      <Truncate lines={2} title={row.cause} className="text-slate-600 dark:text-slate-400">
        {row.cause}
      </Truncate>
    )
  }
  return <span className="text-slate-400">{row.followup_label ?? '—'}</span>
}

function StatLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800/60">
      <p className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-slate-100">{value}</p>
    </div>
  )
}
