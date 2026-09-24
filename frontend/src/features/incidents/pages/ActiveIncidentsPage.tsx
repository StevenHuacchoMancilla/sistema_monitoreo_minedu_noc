import { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { Clock3, Eye, Hourglass, RefreshCw, Sparkles, SquarePen, TriangleAlert, Wrench } from 'lucide-react'
import { useAuth } from '../../auth/context/AuthContext'
import { AppLayout } from '../../../layouts/AppLayout'
import { PageHeader } from '../../../components/ui/PageHeader'
import { SectionCard } from '../../../components/ui/Card'
import { FilterCard } from '../../../components/ui/FilterCard'
import { FormField, Input, SearchField, Select } from '../../../components/ui/FormControls'
import { MetricCard } from '../../../components/ui/MetricCard'
import { Button } from '../../../components/ui/Button'
import { IconButton } from '../../../components/ui/IconButton'
import { Badge } from '../../../components/ui/SoftBadge'
import { PaginationBar } from '../../../components/ui/PaginationBar'
import { EmptyState, ErrorState, LoadingState } from '../../../components/ui/States'
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
import { ContactOutcomeBadge, FollowupBadge, PrtgStatusBadge } from '../../../components/monitoring/StatusBadges'
import { FOLLOWUP_LABELS } from '../../../components/ui/Badge'
import { useDebouncedValue } from '../../../lib/useDebouncedValue'
import { useNow } from '../../../lib/useNow'
import { formatDuration, formatTime, limaDateKey } from '../../../lib/datetime'
import { useDashboardSummary, useManualSync, useOutages } from '../../dashboard/hooks/useDashboard'
import { PrtgLocationFilterFields } from '../../locations/components/PrtgLocationFilterFields'
import { LocationMismatchBadge } from '../../locations/components/LocationMismatchBadge'
import { trackingStatusTone } from '../../tracking/lib/trackingStatus'
import { IncidentManageModal } from '../components/IncidentManageModal'
import type { OutageRow } from '../../../types/api'

const NEW_MINUTES = 15
const HOUR_MINUTES = 60

const MANAGING = new Set(['EN_GESTION', 'EN_DESCARTE', 'EN_ESPERA', 'ESCALADO', 'TECNICO_EN_CAMPO'])

const FOLLOWUP_FILTERS = [
  { value: '', label: 'Todos' },
  { value: 'EN_GESTION_GROUP', label: 'En gestión (cualquiera)' },
  { value: 'PENDIENTE_CONTACTO', label: FOLLOWUP_LABELS.PENDIENTE_CONTACTO },
  { value: 'EN_GESTION', label: FOLLOWUP_LABELS.EN_GESTION },
  { value: 'EN_DESCARTE', label: FOLLOWUP_LABELS.EN_DESCARTE },
  { value: 'EN_ESPERA', label: FOLLOWUP_LABELS.EN_ESPERA },
  { value: 'ESCALADO', label: FOLLOWUP_LABELS.ESCALADO },
  { value: 'TECNICO_EN_CAMPO', label: FOLLOWUP_LABELS.TECNICO_EN_CAMPO },
]

type DurationBucket = '' | 'new' | 'mid' | 'long'

const DURATION_FILTERS: Array<{ value: DurationBucket; label: string }> = [
  { value: '', label: 'Cualquiera' },
  { value: 'new', label: `Menos de ${NEW_MINUTES} min` },
  { value: 'mid', label: `${NEW_MINUTES}–${HOUR_MINUTES} min` },
  { value: 'long', label: 'Más de 1 h' },
]

/** Segundos desde started_at con el reloj local; la duración nunca usa last_check. */
function elapsedSeconds(row: OutageRow, nowMs: number): number | null {
  if (!row.started_at) return null
  const started = Date.parse(row.started_at)
  return Number.isNaN(started) ? null : Math.max(0, Math.floor((nowMs - started) / 1000))
}

function bucketOf(seconds: number | null): DurationBucket {
  if (seconds === null) return ''
  if (seconds < NEW_MINUTES * 60) return 'new'
  if (seconds < HOUR_MINUTES * 60) return 'mid'
  return 'long'
}

const DURATION_CLASS: Record<DurationBucket, string> = {
  '': 'text-slate-500',
  new: 'text-sky-700 dark:text-sky-300',
  mid: 'text-amber-700 dark:text-amber-300',
  long: 'text-red-700 dark:text-red-300',
}

export function ActiveIncidentsPage({
  title = 'Caídas activas',
  filter,
  presetFollowup,
}: {
  title?: string
  filter?: (row: OutageRow) => boolean
  presetFollowup?: string
}) {
  const [searchParams] = useSearchParams()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(25)
  const [followup, setFollowup] = useState(presetFollowup ?? '')
  const [provincia, setProvincia] = useState(searchParams.get('provincia') ?? '')
  const [distrito, setDistrito] = useState(searchParams.get('distrito') ?? '')
  const [tecnologia, setTecnologia] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [duration, setDuration] = useState<DurationBucket>('')
  const [manageId, setManageId] = useState<number | null>(null)
  const client = useQueryClient()
  const { user } = useAuth()
  const canManage = user?.role === 'ADMIN' || user?.role === 'NOC_OPERATOR'
  const now = useNow()

  useEffect(() => {
    setProvincia(searchParams.get('provincia') ?? '')
    setDistrito(searchParams.get('distrito') ?? '')
    setPage(1)
  }, [searchParams])

  const outages = useOutages(useDebouncedValue(search.trim()))
  const summary = useDashboardSummary()
  const { prtg, cloudnet } = useManualSync()
  const syncing = prtg.isPending || cloudnet.isPending
  const lastPrtgSync = summary.data?.sync?.prtg?.finished_at ?? null

  // Orden del servidor (started_at DESC, id DESC); aquí solo se filtra.
  const scoped = useMemo(() => {
    const data = outages.data?.data ?? []
    return filter ? data.filter(filter) : data
  }, [outages.data, filter])

  const technologies = useMemo(
    () => Array.from(new Set(scoped.map((r) => r.tecnologia).filter((t): t is string => Boolean(t)))).sort(),
    [scoped],
  )

  const kpis = useMemo(() => {
    const counts = { total: scoped.length, new: 0, mid: 0, long: 0, managing: 0 }
    for (const row of scoped) {
      const bucket = bucketOf(elapsedSeconds(row, now))
      if (bucket) counts[bucket]++
      if (MANAGING.has(row.followup_status ?? '')) counts.managing++
    }
    return counts
  }, [scoped, now])

  const rows = useMemo(() => {
    return scoped.filter((r) => {
      if (followup === 'EN_GESTION_GROUP' ? !MANAGING.has(r.followup_status ?? '') : followup && r.followup_status !== followup) {
        return false
      }
      if (provincia && (r.provincia ?? '').toUpperCase() !== provincia.toUpperCase()) return false
      if (distrito && (r.distrito ?? '').toUpperCase() !== distrito.toUpperCase()) return false
      if (tecnologia && (r.tecnologia ?? '').toUpperCase() !== tecnologia.toUpperCase()) return false
      const day = limaDateKey(r.started_at)
      if (fromDate && (day === null || day < fromDate)) return false
      if (toDate && (day === null || day > toDate)) return false
      if (duration && bucketOf(elapsedSeconds(r, now)) !== duration) return false
      return true
    })
  }, [scoped, followup, provincia, distrito, tecnologia, fromDate, toDate, duration, now])

  const lastPage = Math.max(1, Math.ceil(rows.length / perPage))
  const currentPage = Math.min(page, lastPage)
  const pageRows = rows.slice((currentPage - 1) * perPage, currentPage * perPage)

  const hasFilters = Boolean(
    search || (followup && followup !== presetFollowup) || provincia || distrito || tecnologia || fromDate || toDate || duration,
  )

  const withPageReset =
    <T,>(setter: (value: T) => void) =>
    (value: T) => {
      setter(value)
      setPage(1)
    }

  const clearFilters = () => {
    setSearch('')
    setFollowup(presetFollowup ?? '')
    setProvincia('')
    setDistrito('')
    setTecnologia('')
    setFromDate('')
    setToDate('')
    setDuration('')
    setPage(1)
  }

  const refresh = () => {
    void outages.refetch()
    void summary.refetch()
  }

  return (
    <AppLayout
      bare
      syncing={syncing}
      onRefresh={refresh}
      onSyncPrtg={() => prtg.mutate()}
      onSyncCloudnet={() => cloudnet.mutate()}
    >
      <PageHeader
        icon={<TriangleAlert className="h-5 w-5 text-red-600 dark:text-red-400" aria-hidden />}
        title={title}
        badges={
          <Badge tone="danger">
            {kpis.total.toLocaleString('es-PE')} {kpis.total === 1 ? 'activa' : 'activas'}
          </Badge>
        }
        description="Locales con Ping caído en PRTG. La duración se calcula desde el inicio real de la caída."
        actions={
          <>
            <span
              className="text-[12px] font-medium text-slate-500 tabular-nums dark:text-slate-400"
              title="Hora de la última sincronización PRTG finalizada"
            >
              Última sync PRTG: {lastPrtgSync ? formatTime(lastPrtgSync) : '—'}
            </span>
            <Button size="sm" onClick={refresh} loading={outages.isFetching} aria-label="Refrescar caídas activas">
              {!outages.isFetching ? <RefreshCw className="h-3.5 w-3.5" aria-hidden /> : null}
              Refrescar
            </Button>
          </>
        }
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <MetricCard label="Total activas" value={kpis.total} icon={<TriangleAlert className="h-4 w-4" />} tone="danger" />
        <MetricCard
          label={`Nuevas < ${NEW_MINUTES} min`}
          value={kpis.new}
          icon={<Sparkles className="h-4 w-4" />}
          tone="info"
        />
        <MetricCard label={`${NEW_MINUTES}–${HOUR_MINUTES} min`} value={kpis.mid} icon={<Clock3 className="h-4 w-4" />} tone="warning" />
        <MetricCard label="Más de 1 h" value={kpis.long} icon={<Hourglass className="h-4 w-4" />} tone="danger" />
        <MetricCard label="En gestión" value={kpis.managing} icon={<Wrench className="h-4 w-4" />} tone="cyan" />
      </div>

      <div className="mb-4">
        <FilterCard
          actions={
            <Button type="button" size="sm" variant="ghost" onClick={clearFilters} disabled={!hasFilters}>
              Limpiar
            </Button>
          }
        >
          <SearchField
            label="Buscar"
            className="sm:col-span-2 xl:col-span-2"
            value={search}
            placeholder="CID, colegio, código, distrito…"
            onChange={(e) => withPageReset(setSearch)(e.target.value)}
          />
          <FormField label="Estado gestión">
            <Select
              value={followup}
              disabled={Boolean(filter)}
              onChange={(e) => withPageReset(setFollowup)(e.target.value)}
            >
              {FOLLOWUP_FILTERS.map((f) => (
                <option key={f.value || 'all'} value={f.value}>
                  {f.label}
                </option>
              ))}
            </Select>
          </FormField>
          <PrtgLocationFilterFields
            province={provincia}
            district={distrito}
            onProvinceChange={withPageReset(setProvincia)}
            onDistrictChange={withPageReset(setDistrito)}
          />
          <FormField label="Tecnología">
            <Select value={tecnologia} onChange={(e) => withPageReset(setTecnologia)(e.target.value)}>
              <option value="">Todas</option>
              {technologies.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Caída desde">
            <Input type="date" value={fromDate} max={toDate || undefined} onChange={(e) => withPageReset(setFromDate)(e.target.value)} />
          </FormField>
          <FormField label="Caída hasta">
            <Input type="date" value={toDate} min={fromDate || undefined} onChange={(e) => withPageReset(setToDate)(e.target.value)} />
          </FormField>
          <FormField label="Duración">
            <Select value={duration} onChange={(e) => withPageReset(setDuration)(e.target.value as DurationBucket)}>
              {DURATION_FILTERS.map((d) => (
                <option key={d.value || 'any'} value={d.value}>
                  {d.label}
                </option>
              ))}
            </Select>
          </FormField>
        </FilterCard>
      </div>

      <SectionCard
        title="Caídas en curso"
        action={
          <span className="text-xs font-semibold text-slate-500 tabular-nums dark:text-slate-400">
            {rows.length === kpis.total
              ? `${rows.length.toLocaleString('es-PE')} registros`
              : `${rows.length.toLocaleString('es-PE')} de ${kpis.total.toLocaleString('es-PE')}`}
          </span>
        }
      >
        {outages.isLoading ? <LoadingState /> : null}
        {outages.isError ? (
          <ErrorState message={outages.error instanceof Error ? outages.error.message : 'Error'} />
        ) : null}
        {!outages.isLoading && !outages.isError && rows.length === 0 ? (
          kpis.total === 0 && !search ? (
            <EmptyState title="No existen caídas activas." description="Todos los locales monitoreados están operativos." />
          ) : (
            <EmptyState title="Sin resultados" description="Ninguna caída activa coincide con los filtros." />
          )
        ) : null}

        {rows.length > 0 ? (
          <>
            <DataTableContainer className={outages.isPlaceholderData ? 'opacity-70 transition-opacity' : ''}>
              <table className={`${tableClassName} table-fixed`} style={{ minWidth: 1080 }}>
                <thead className={theadClassName}>
                  <tr>
                    <th className={`${thClassName} w-[5.5rem]`}>Estado</th>
                    <th className={`${thClassName} w-[4.75rem]`}>CID</th>
                    <th className={`${thClassName} w-[15rem]`}>Local</th>
                    <th className={`${thClassName} w-[9rem]`}>Ubicación</th>
                    <th className={`${thClassName} w-[6.5rem]`}>
                      <span className="block">Caída</span>
                      <span className="block text-[10px] font-normal normal-case tracking-normal text-slate-400">fecha · hora</span>
                    </th>
                    <th className={`${thClassName} w-[6rem]`}>Duración</th>
                    <th className={`${thClassName} w-[10.5rem]`}>Seguimiento</th>
                    <th className={`${thClassName} w-[7.5rem]`}>Responsable</th>
                    <th className={`${thClassName} w-[8rem]`}>Tracking</th>
                    <th
                      className={`${thClassName} sticky right-0 z-10 w-[4rem] bg-slate-50 text-right shadow-[-8px_0_8px_-8px_rgba(15,23,42,0.12)] dark:bg-slate-900`}
                    >
                      Acción
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((row) => (
                    <OutageTableRow
                      key={row.incident_id}
                      row={row}
                      now={now}
                      canManage={canManage}
                      onManage={setManageId}
                    />
                  ))}
                </tbody>
              </table>
            </DataTableContainer>
            <PaginationBar
              page={currentPage}
              lastPage={lastPage}
              total={rows.length}
              perPage={perPage}
              onPageChange={setPage}
              onPerPageChange={(n) => {
                setPerPage(n)
                setPage(1)
              }}
            />
          </>
        ) : null}
      </SectionCard>

      {manageId !== null ? (
        <IncidentManageModal
          incidentId={manageId}
          initialTab={canManage ? 'management' : 'summary'}
          readOnly={!canManage}
          onClose={() => {
            setManageId(null)
            refresh()
            void client.invalidateQueries({ queryKey: ['reports'] })
            void client.invalidateQueries({ queryKey: ['tracking'] })
          }}
        />
      ) : null}
    </AppLayout>
  )
}

function OutageTableRow({
  row,
  now,
  canManage,
  onManage,
}: {
  row: OutageRow
  now: number
  canManage: boolean
  onManage: (id: number) => void
}) {
  const seconds = elapsedSeconds(row, now)
  const bucket = bucketOf(seconds)
  const reincidencias = row.reincidente_count ?? 1

  return (
    <tr className={`${trClassName} group`}>
      <td className={tdClassName}>
        <PrtgStatusBadge status={row.estado_prtg} />
      </td>
      <td className={`${tdClassName} font-medium tabular-nums`}>{row.cid ?? '—'}</td>
      <td className={tdClassName}>
        <Truncate title={row.local_educativo} className="font-medium text-slate-900 dark:text-slate-100">
          {row.local_educativo ?? '—'}
        </Truncate>
        <span className="block truncate text-[11px] text-slate-500 dark:text-slate-400">
          {[row.codigo_local, row.tecnologia].filter(Boolean).join(' · ') || '—'}
        </span>
      </td>
      <td className={tdClassName}>
        <Truncate title={row.provincia}>{row.provincia ?? '—'}</Truncate>
        <span className="flex min-w-0 items-center gap-1">
          <Truncate title={row.distrito} className="text-[11px] text-slate-500 dark:text-slate-400">
            {row.distrito ?? '—'}
          </Truncate>
          <LocationMismatchBadge info={row} compact />
        </span>
      </td>
      <td className={tdClassName}>
        <IsoDateTimeCell value={row.started_at} />
      </td>
      <td className={`${tdClassName} whitespace-nowrap font-semibold tabular-nums ${DURATION_CLASS[bucket]}`}>
        {formatDuration(seconds)}
      </td>
      <td className={tdClassName}>
        <div className="flex min-w-0 flex-col items-start gap-1">
          <FollowupBadge status={row.followup_status} />
          <div className="flex flex-wrap items-center gap-1">
            <ContactOutcomeBadge
              classification={row.management_classification}
              label={row.management_classification_label}
            />
            {bucket === 'new' ? (
              <Badge tone="info" title={`Caída iniciada hace menos de ${NEW_MINUTES} minutos`} className="!text-[10px] !font-medium">
                Nueva
              </Badge>
            ) : null}
            {reincidencias > 1 ? (
              <Badge
                tone="warning"
                title={`${reincidencias} caídas registradas para este CID`}
                className="!text-[10px] !font-medium"
              >
                Reincidencia ×{reincidencias}
              </Badge>
            ) : null}
          </div>
        </div>
      </td>
      <td className={tdClassName}>
        <Truncate title={row.responsible_area} className="text-slate-600 dark:text-slate-300">
          {row.responsible_area ?? '—'}
        </Truncate>
      </td>
      <td className={tdClassName}>
        {row.tracking ? (
          <span className="flex min-w-0 flex-col items-start gap-0.5">
            <Truncate className="text-[12px] font-medium tabular-nums" title={row.tracking.ticket}>
              {row.tracking.ticket ?? 'Sin ticket'}
            </Truncate>
            <Badge tone={trackingStatusTone(row.tracking.status)} className="!text-[10px]">
              {row.tracking.status_label ?? row.tracking.status}
            </Badge>
          </span>
        ) : (
          <span className="text-slate-400">—</span>
        )}
      </td>
      <td className="sticky right-0 z-10 bg-white px-2 py-2 text-right shadow-[-8px_0_8px_-8px_rgba(15,23,42,0.12)] group-hover:bg-slate-50 dark:bg-slate-900 dark:group-hover:bg-slate-800/60">
        <IconButton
          label={canManage ? 'Gestionar' : 'Ver detalle'}
          onClick={() => onManage(row.incident_id)}
          className="h-8 w-8 text-blue-700 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none dark:text-blue-300"
        >
          {canManage ? <SquarePen className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
        </IconButton>
      </td>
    </tr>
  )
}
