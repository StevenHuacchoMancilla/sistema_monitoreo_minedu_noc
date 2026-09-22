import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
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
import {
  ClassificationBadge,
  FollowupBadge,
  PrtgStatusBadge,
} from '../../../components/monitoring/StatusBadges'
import { Badge } from '../../../components/ui/SoftBadge'
import { DataTableFrame } from '../../../components/ui/DataTableFrame'
import { FilterCard } from '../../../components/ui/FilterCard'
import { FormField, Input, Select } from '../../../components/ui/FormControls'
import { MetricCard } from '../../../components/ui/MetricCard'
import { PaginationBar } from '../../../components/ui/PaginationBar'
import { useManualSync } from '../../dashboard/hooks/useDashboard'
import { LocationMismatchBadge } from '../../locations/components/LocationMismatchBadge'
import { techBadgeClass } from '../../../lib/uiTokens'
import { fetchSchoolHistoryIncidents, fetchSchoolHistoryOverview } from '../api/historyApi'
import { IncidentHistoryDrawer } from '../components/IncidentHistoryDrawer'

export function SchoolHistoryDetailPage() {
  const { schoolId } = useParams()
  const id = Number(schoolId)
  const navigate = useNavigate()
  const { prtg, cloudnet } = useManualSync()

  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [status, setStatus] = useState('ALL')
  const [classification, setClassification] = useState('')
  const [scope, setScope] = useState('')
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(10)
  const [detailId, setDetailId] = useState<number | null>(null)

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
      classification,
      scope,
      page,
      perPage,
    ],
    queryFn: () =>
      fetchSchoolHistoryIncidents(id, {
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        status: status === 'ALL' ? undefined : status,
        classification: classification || undefined,
        scope: scope || undefined,
        page,
        per_page: perPage,
      }),
    enabled: Number.isFinite(id) && id > 0,
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
    setClassification('')
    setScope('')
    setPage(1)
  }

  return (
    <AppLayout
      bare
      syncing={prtg.isPending || cloudnet.isPending}
      onRefresh={() => void refreshAll()}
      onSyncPrtg={() => prtg.mutate()}
      onSyncCloudnet={() => cloudnet.mutate()}
    >
      <div className="mb-3">
        <Link
          to="/history/schools"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition hover:text-slate-900"
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
              value={statistics.ultima_caida ? new Date(statistics.ultima_caida).toLocaleString('es-PE') : '—'}
              icon={<History className="h-4 w-4" />}
            />
            <MetricCard
              label="Última recuperación"
              value={
                statistics.ultima_recuperacion
                  ? new Date(statistics.ultima_recuperacion).toLocaleString('es-PE')
                  : '—'
              }
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
                  <option value="RECOVERED">Recuperados</option>
                  <option value="ACTIVE">Activos</option>
                </Select>
              </FormField>
              <FormField label="Clasificación">
                <Select
                  value={classification}
                  onChange={(e) => {
                    setClassification(e.target.value)
                    setPage(1)
                  }}
                >
                  <option value="">Todas</option>
                  <option value="NEW_OUTAGE">Nueva caída</option>
                  <option value="CONTACT_CONFIRMED">Contacto confirmado</option>
                  <option value="NO_RESPONSE">Sin respuesta</option>
                  <option value="COMPLAINT">Queja</option>
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
            <p className="mb-3 text-xs text-slate-500">
              Paginación server-side. El detalle (PRTG, gestiones y timeline) se carga al abrir Ver detalle.
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
                <DataTableFrame>
                  <table className="min-w-[980px] w-full text-left text-sm">
                    <thead className="text-xs uppercase text-slate-500">
                      <tr>
                        <th className="px-2 py-2">Reincidencia</th>
                        <th className="px-2 py-2">Fecha caída</th>
                        <th className="px-2 py-2">Recuperación</th>
                        <th className="px-2 py-2">Duración</th>
                        <th className="px-2 py-2">Clasificación</th>
                        <th className="px-2 py-2">PEXT/PINT</th>
                        <th className="px-2 py-2">Seguimiento</th>
                        <th className="px-2 py-2 text-right">Acción</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr key={row.id} className="border-t border-slate-200/80">
                          <td className="px-2 py-2 text-xs font-medium text-slate-500">
                            {row.reincidencia?.label ?? `#${row.id}`}
                          </td>
                          <td className="whitespace-nowrap px-2 py-2">
                            {row.started_at ? new Date(row.started_at).toLocaleString('es-PE') : '—'}
                          </td>
                          <td className="whitespace-nowrap px-2 py-2">
                            {row.recovered_at ? (
                              <span className="inline-flex flex-col gap-0.5">
                                <span>{new Date(row.recovered_at).toLocaleString('es-PE')}</span>
                                {row.same_day ? (
                                  <Badge tone="success">Recuperado el mismo día</Badge>
                                ) : null}
                              </span>
                            ) : (
                              <span className="font-semibold text-red-700">Activa</span>
                            )}
                          </td>
                          <td className="px-2 py-2 text-slate-600">{row.duration ?? '—'}</td>
                          <td className="px-2 py-2">
                            <ClassificationBadge classification={row.management_classification} />
                          </td>
                          <td className="px-2 py-2 font-medium text-slate-700">
                            {row.management_scope ?? '—'}
                          </td>
                          <td className="px-2 py-2">
                            <FollowupBadge status={row.followup_status ?? null} />
                          </td>
                          <td className="px-2 py-2 text-right">
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() => setDetailId(row.id)}
                            >
                              <Eye className="h-3.5 w-3.5" aria-hidden />
                              Ver detalle
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </DataTableFrame>
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

      {detailId != null ? (
        <IncidentHistoryDrawer incidentId={detailId} onClose={() => setDetailId(null)} />
      ) : null}
    </AppLayout>
  )
}

function StatLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2">
      <p className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-slate-900">{value}</p>
    </div>
  )
}
