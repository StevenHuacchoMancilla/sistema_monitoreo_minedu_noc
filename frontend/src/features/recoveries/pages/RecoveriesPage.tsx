import { useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import {
  CalendarDays,
  CircleCheck,
  Clock3,
  Eye,
  History,
  Phone,
  PhoneOff,
  TriangleAlert,
  Truck,
  Wrench,
} from 'lucide-react'
import { AppLayout } from '../../../layouts/AppLayout'
import { PageHeader } from '../../../components/ui/PageHeader'
import { SectionCard } from '../../../components/ui/Card'
import { FilterCard } from '../../../components/ui/FilterCard'
import { FormField, Input, SearchField, Select } from '../../../components/ui/FormControls'
import { MetricCard } from '../../../components/ui/MetricCard'
import { Button } from '../../../components/ui/Button'
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
import { PaginationBar } from '../../../components/ui/PaginationBar'
import { EmptyState, ErrorState, LoadingState } from '../../../components/ui/States'
import { CaseStatusBadge, ContactOutcomeBadge } from '../../../components/monitoring/StatusBadges'
import { formatDuration } from '../../../lib/datetime'
import { useDebouncedValue } from '../../../lib/useDebouncedValue'
import { useNow } from '../../../lib/useNow'
import { useManualSync } from '../../dashboard/hooks/useDashboard'
import { PrtgLocationFilterFields } from '../../locations/components/PrtgLocationFilterFields'
import { LocationMismatchBadge } from '../../locations/components/LocationMismatchBadge'
import { trackingStatusTone } from '../../tracking/lib/trackingStatus'
import { incidentCaseFilePath } from '../../history/api/historyApi'
import { fetchRecoveredIncidents, fetchRecoveredSummary } from '../api/recoveriesApi'
import type { RecoveredRow } from '../types/recoveries'

type Preset = 'today' | 'yesterday' | 'last_7_days' | 'this_month' | 'custom'

const PRESETS: Array<{ value: Preset; label: string }> = [
  { value: 'today', label: 'Hoy' },
  { value: 'yesterday', label: 'Ayer' },
  { value: 'last_7_days', label: 'Últimos 7 días' },
  { value: 'this_month', label: 'Este mes' },
  { value: 'custom', label: 'Rango' },
]

const CONTACT_OUTCOMES = new Set(['CONTACT_CONFIRMED', 'LINK_OUTAGE', 'NO_RESPONSE', 'COMPLAINT'])

/** 'YYYY-MM-DD' → 'DD/MM/YYYY' sin pasar por Date (evita corrimientos de zona). */
function ymdToDmy(value: string | undefined): string {
  if (!value) return '—'
  const [y, m, d] = value.split('-')
  return d && m && y ? `${d}/${m}/${y}` : value
}

export function RecoveriesPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { prtg } = useManualSync()

  const reviewFromUrl = searchParams.get('review_status') || ''

  const [preset, setPreset] = useState<Preset>(() => (reviewFromUrl ? 'last_7_days' : 'today'))
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [q, setQ] = useState('')
  const [provincia, setProvincia] = useState('')
  const [distrito, setDistrito] = useState('')
  const [tecnologia, setTecnologia] = useState('')
  const [classification, setClassification] = useState('')
  const [scope, setScope] = useState('')
  const [sameDay, setSameDay] = useState(false)
  const [duringManagement, setDuringManagement] = useState(false)
  const [hadFieldTech, setHadFieldTech] = useState(false)
  const [reviewStatus, setReviewStatus] = useState(reviewFromUrl)
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(25)

  const qDebounced = useDebouncedValue(q.trim())

  // Enlaces antiguos (?focus=ID) abren directamente el expediente completo.
  useEffect(() => {
    const focus = Number(searchParams.get('focus') || '')
    if (Number.isFinite(focus) && focus > 0) {
      navigate(incidentCaseFilePath(focus), { replace: true })
    }
  }, [searchParams, navigate])

  useEffect(() => {
    setPage(1)
  }, [qDebounced])

  const filterParams = {
    preset,
    date_from: preset === 'custom' ? dateFrom || undefined : undefined,
    date_to: preset === 'custom' ? dateTo || undefined : undefined,
    q: qDebounced || undefined,
    provincia: provincia || undefined,
    distrito: distrito || undefined,
    tecnologia: tecnologia || undefined,
    classification: classification || undefined,
    scope: scope || undefined,
    same_day: sameDay || undefined,
    during_management: duringManagement || undefined,
    had_field_tech: hadFieldTech || undefined,
    review_status: reviewStatus || undefined,
  }

  const list = useQuery({
    queryKey: ['recoveries', 'list', filterParams, page, perPage],
    queryFn: () => fetchRecoveredIncidents({ ...filterParams, page, per_page: perPage }),
    placeholderData: keepPreviousData,
  })

  const summary = useQuery({
    queryKey: ['recoveries', 'summary', filterParams],
    queryFn: () => fetchRecoveredSummary(filterParams),
    placeholderData: keepPreviousData,
  })

  const rows = list.data?.data ?? []
  const meta = list.data?.meta
  const filters = list.data?.filters
  const stats = summary.data?.data

  const rangeLabel = filters
    ? filters.date_from === filters.date_to
      ? `Recuperados el ${ymdToDmy(filters.date_from)}`
      : `Recuperados del ${ymdToDmy(filters.date_from)} al ${ymdToDmy(filters.date_to)}`
    : null

  const selectPreset = (value: Preset) => {
    setPreset(value)
    setPage(1)
  }

  const clearFilters = () => {
    setPreset('today')
    setDateFrom('')
    setDateTo('')
    setQ('')
    setProvincia('')
    setDistrito('')
    setTecnologia('')
    setClassification('')
    setScope('')
    setSameDay(false)
    setDuringManagement(false)
    setHadFieldTech(false)
    setReviewStatus('')
    setPage(1)
  }

  const withPageReset =
    <T,>(setter: (value: T) => void) =>
    (value: T) => {
      setter(value)
      setPage(1)
    }

  return (
    <AppLayout
      bare
      syncing={prtg.isPending}
      onRefresh={() => {
        void list.refetch()
        void summary.refetch()
      }}
      onSyncPrtg={() => prtg.mutate()}
    >
      <PageHeader
        icon={<CircleCheck className="h-5 w-5" aria-hidden />}
        title="Recuperados"
        description="Locales que estuvieron caídos y volvieron a estar operativos. La recuperación técnica no cancela la gestión humana."
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <MetricCard
          label="Recuperados hoy"
          value={stats?.recovered_today ?? 0}
          icon={<CircleCheck className="h-4 w-4" />}
          tone="success"
          description="Día calendario America/Lima"
        />
        <MetricCard
          label="Esta semana"
          value={stats?.recovered_this_week ?? 0}
          icon={<Clock3 className="h-4 w-4" />}
          description="Semana calendario Lima"
        />
        <MetricCard
          label="Durante gestión"
          value={stats?.recovered_during_management ?? 0}
          icon={<Wrench className="h-4 w-4" />}
          tone="warning"
          description="En el periodo filtrado"
        />
        <MetricCard
          label="Con técnico en campo"
          value={stats?.recovered_with_field_tech ?? 0}
          icon={<Truck className="h-4 w-4" />}
          tone="danger"
          description="En el periodo filtrado"
        />
        <MetricCard
          label="Sin contacto"
          value={stats?.recovered_without_contact ?? 0}
          icon={<PhoneOff className="h-4 w-4" />}
          description="En el periodo filtrado"
        />
        <MetricCard
          label="Con contacto"
          value={stats?.recovered_with_contact ?? 0}
          icon={<Phone className="h-4 w-4" />}
          tone="info"
          description="En el periodo filtrado"
        />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">
          <CalendarDays className="h-3.5 w-3.5" aria-hidden />
          Fecha de recuperación
        </span>
        <div className="flex flex-wrap gap-1" role="group" aria-label="Periodo de recuperación">
          {PRESETS.map((p) => (
            <button
              key={p.value}
              type="button"
              aria-pressed={preset === p.value}
              onClick={() => selectPreset(p.value)}
              className={`rounded-full px-3 py-1 text-[12px] font-semibold transition-colors ${
                preset === p.value
                  ? 'bg-emerald-600 text-white shadow-sm dark:bg-emerald-500 dark:text-emerald-950'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        {preset === 'custom' ? (
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-[9.5rem]">
              <Input
                type="date"
                aria-label="Desde"
                value={dateFrom}
                onChange={(e) => withPageReset(setDateFrom)(e.target.value)}
              />
            </div>
            <span className="text-xs text-slate-400">a</span>
            <div className="w-[9.5rem]">
              <Input
                type="date"
                aria-label="Hasta"
                value={dateTo}
                onChange={(e) => withPageReset(setDateTo)(e.target.value)}
              />
            </div>
          </div>
        ) : null}
        {rangeLabel ? (
          <span className="ml-auto text-[12px] font-medium text-slate-500 tabular-nums dark:text-slate-400">
            {rangeLabel}
          </span>
        ) : null}
      </div>

      <div className="mb-4">
        <FilterCard
          actions={
            <Button type="button" size="sm" variant="ghost" onClick={clearFilters}>
              Limpiar
            </Button>
          }
        >
          <SearchField
            label="Buscar"
            value={q}
            placeholder="CID, código o colegio…"
            onChange={(e) => setQ(e.target.value)}
          />
          <PrtgLocationFilterFields
            province={provincia}
            district={distrito}
            onProvinceChange={withPageReset(setProvincia)}
            onDistrictChange={withPageReset(setDistrito)}
          />
          <FormField label="Tecnología">
            <Select value={tecnologia} onChange={(e) => withPageReset(setTecnologia)(e.target.value)}>
              <option value="">Todas</option>
              {(filters?.tecnologias ?? []).map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Resultado contacto">
            <Select value={classification} onChange={(e) => withPageReset(setClassification)(e.target.value)}>
              <option value="">Todos</option>
              {(filters?.classifications ?? [])
                .filter((c) => CONTACT_OUTCOMES.has(c.value))
                .map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
            </Select>
          </FormField>
          <FormField label="PEXT / PINT">
            <Select value={scope} onChange={(e) => withPageReset(setScope)(e.target.value)}>
              <option value="">Todos</option>
              {(filters?.scopes ?? []).map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Revisión">
            <Select value={reviewStatus} onChange={(e) => withPageReset(setReviewStatus)(e.target.value)}>
              <option value="">Todas</option>
              <option value="PENDING_REVIEW">Pendiente de revisión</option>
              <option value="ACKNOWLEDGED">Confirmada</option>
              <option value="CONTINUE_MONITORING">Seguimiento activo</option>
            </Select>
          </FormField>
          <FormField label="Condiciones">
            <div className="flex flex-col gap-1.5 pt-1 text-[13px] text-slate-700 dark:text-slate-300">
              <FlagCheckbox label="Mismo día" checked={sameDay} onChange={withPageReset(setSameDay)} />
              <FlagCheckbox
                label="Durante gestión"
                checked={duringManagement}
                onChange={withPageReset(setDuringManagement)}
              />
              <FlagCheckbox
                label="Técnico en campo"
                checked={hadFieldTech}
                onChange={withPageReset(setHadFieldTech)}
              />
            </div>
          </FormField>
        </FilterCard>
      </div>

      <SectionCard
        title="Recuperaciones del periodo"
        action={
          <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-600/15 dark:bg-emerald-950/50 dark:text-emerald-300 dark:ring-emerald-500/25">
            {(meta?.total ?? 0).toLocaleString('es-PE')}
          </span>
        }
      >
        {list.isLoading ? <LoadingState /> : null}
        {list.isError ? <ErrorState message={list.error instanceof Error ? list.error.message : 'Error'} /> : null}
        {!list.isLoading && rows.length === 0 ? (
          <EmptyState title="Sin recuperaciones" description="No hay recuperaciones en el periodo seleccionado." />
        ) : null}

        {rows.length > 0 ? (
          <>
            <DataTableContainer className={list.isPlaceholderData ? 'opacity-70 transition-opacity' : ''}>
              <table className={`${tableClassName} table-fixed`} style={{ minWidth: 1280 }}>
                <colgroup>
                  <col className="w-[4.75rem]" />
                  <col className="w-[14rem]" />
                  <col className="w-[6.5rem]" />
                  <col className="w-[7rem]" />
                  <col className="w-[5.25rem]" />
                  <col className="w-[8rem]" />
                  <col className="w-[9rem]" />
                  <col className="w-[9.5rem]" />
                  <col className="w-[8rem]" />
                  <col className="w-[7.5rem]" />
                  <col className="w-[5.25rem]" />
                </colgroup>
                <thead className={theadClassName}>
                  <tr>
                    <th className={thClassName}>CID</th>
                    <th className={thClassName}>Local educativo</th>
                    <th className={thClassName}>
                      <span className="block">Caída</span>
                      <span className="block text-[10px] font-normal normal-case tracking-normal text-slate-400">fecha · hora</span>
                    </th>
                    <th className={thClassName}>
                      <span className="block">Recuperación</span>
                      <span className="block text-[10px] font-normal normal-case tracking-normal text-slate-400">fecha · hora</span>
                    </th>
                    <th className={thClassName}>Duración</th>
                    <th className={thClassName}>Gestión</th>
                    <th className={thClassName}>Tracking</th>
                    <th className={thClassName}>Estado</th>
                    <th className={`${thClassName} hidden xl:table-cell`}>Alertas</th>
                    <th className={`${thClassName} hidden lg:table-cell`}>Provincia</th>
                    <th className={`${thClassName} sticky right-0 z-10 bg-slate-50 text-right shadow-[-8px_0_8px_-8px_rgba(15,23,42,0.12)] dark:bg-slate-900`}>
                      Acción
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <RecoveryRow key={row.id} row={row} />
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

      {stats && stats.recovered_during_management > 0 ? (
        <div className="mt-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>
            Hay <strong>{stats.recovered_during_management}</strong> recuperación(es) durante gestión en el
            periodo. PRTG cerró el estado técnico; conviene revisar la gestión operativa pendiente.
          </p>
        </div>
      ) : null}
    </AppLayout>
  )
}

function RecoveryRow({ row }: { row: RecoveredRow }) {
  const now = useNow(30_000)
  const showOutcome = row.management_classification && CONTACT_OUTCOMES.has(row.management_classification)
  const localSubtext = [row.codigo_local, row.tecnologia, row.distrito].filter(Boolean).join(' · ') || '—'
  const recoveredMs = row.recovered_at ? new Date(row.recovered_at.replace(' ', 'T')).getTime() : NaN
  const isRecent =
    Number.isFinite(recoveredMs) && recoveredMs <= now && now - recoveredMs < 10 * 60 * 1000

  return (
    <tr className={`${trClassName} group ${row.requires_review ? 'bg-amber-50/40 dark:bg-amber-950/25' : ''}`}>
      <td className={`${tdClassName} font-medium tabular-nums`}>{row.cid ?? '—'}</td>
      <td className={tdClassName}>
        <Truncate title={row.local_educativo} className="font-medium text-slate-900 dark:text-slate-100">
          {row.local_educativo ?? '—'}
        </Truncate>
        <span className="block truncate text-[11px] text-slate-500 dark:text-slate-400" title={localSubtext}>
          {localSubtext}
        </span>
      </td>
      <td className={tdClassName}>
        <IsoDateTimeCell value={row.started_at} />
      </td>
      <td className={tdClassName}>
        <IsoDateTimeCell value={row.recovered_at} dateClassName="text-emerald-700 dark:text-emerald-400" />
        {row.same_day ? (
          <span className="mt-0.5 block text-[10px] font-medium tracking-wide text-slate-400 dark:text-slate-500">
            ● mismo día
          </span>
        ) : null}
        {isRecent ? (
          <Badge tone="cyan" className="mt-0.5" title="Recuperado hace menos de 10 minutos">
            Reciente
          </Badge>
        ) : null}
      </td>
      <td className={`${tdClassName} tabular-nums`}>
        <span className="block truncate whitespace-nowrap">{formatDuration(row.duration_seconds)}</span>
      </td>
      <td className={tdClassName}>
        <div className="flex min-w-0 flex-col items-start gap-0.5">
          {showOutcome ? (
            <ContactOutcomeBadge
              classification={row.management_classification}
              label={row.management_classification_label}
            />
          ) : row.managements_count > 0 ? (
            <span className="truncate font-medium">
              {row.managements_count} gestión{row.managements_count === 1 ? '' : 'es'}
            </span>
          ) : (
            <span className="text-slate-400">Sin gestión</span>
          )}
          {row.management_scope ? (
            <span className="block truncate text-[11px] text-slate-500">{row.management_scope}</span>
          ) : null}
          {row.recovered_during_management ? (
            <Badge tone="warning" className="!text-[10px]" title="PRTG recuperó mientras seguía en gestión operativa">
              Durante gestión
            </Badge>
          ) : null}
        </div>
      </td>
      <td className={tdClassName}>
        {row.tracking ? (
          <span className="flex min-w-0 flex-col items-start gap-0.5">
            <Truncate className="font-medium tabular-nums" title={row.tracking.ticket}>
              {row.tracking.ticket ?? 'Sin ticket'}
            </Truncate>
            <Badge tone={trackingStatusTone(row.tracking.status)} className="max-w-full !text-[10px]">
              {row.tracking.status_label ?? row.tracking.status}
            </Badge>
          </span>
        ) : (
          <span className="text-slate-400">—</span>
        )}
      </td>
      <td className={tdClassName}>
        <CaseStatusBadge status={row.case_status} />
      </td>
      <td className={`${tdClassName} hidden xl:table-cell`}>
        <div className="flex min-w-0 flex-col items-start gap-0.5">
          {row.requires_review ? <Badge tone="warning" className="max-w-full !text-[10px]">Revisar gestión</Badge> : null}
          {row.had_field_tech && row.requires_review ? (
            <Badge tone="danger" className="max-w-full !text-[10px]">
              Personal movilizado
            </Badge>
          ) : null}
          {row.active_field_dispatch ? (
            <Badge tone="cyan" className="max-w-full !text-[10px]">
              Desplazamiento activo
            </Badge>
          ) : null}
          {row.recovery_review_status === 'ACKNOWLEDGED' ? (
            <Badge tone="success" className="max-w-full !text-[10px]">
              Confirmada
            </Badge>
          ) : null}
          {row.recovery_review_status === 'CONTINUE_MONITORING' ? (
            <Badge tone="info" className="max-w-full !text-[10px]">
              Seguimiento
            </Badge>
          ) : null}
          {!row.requires_review && !row.active_field_dispatch && !row.recovery_review_status ? (
            <span className="text-slate-400">—</span>
          ) : null}
        </div>
      </td>
      <td className={`${tdClassName} hidden lg:table-cell text-slate-500`}>
        <div className="flex min-w-0 flex-col gap-1">
          <Truncate title={row.provincia}>{row.provincia ?? '—'}</Truncate>
          <LocationMismatchBadge info={row} compact />
        </div>
      </td>
      <td className="sticky right-0 z-10 overflow-hidden bg-white px-2 py-2 text-right shadow-[-8px_0_8px_-8px_rgba(15,23,42,0.12)] group-hover:bg-slate-50 dark:bg-slate-900 dark:group-hover:bg-slate-800/60">
        <div className="inline-flex gap-0.5">
          <RowIconLink
            to={incidentCaseFilePath(row.id)}
            label={row.requires_review ? 'Revisar incidencia' : 'Ver incidencia completa'}
            highlight={row.requires_review}
          >
            <Eye className="h-4 w-4" aria-hidden />
          </RowIconLink>
          <RowIconLink to={`/history/schools/${row.school_id}`} label="Historial del colegio">
            <History className="h-4 w-4" aria-hidden />
          </RowIconLink>
        </div>
      </td>
    </tr>
  )
}

function RowIconLink({
  to,
  label,
  highlight = false,
  children,
}: {
  to: string
  label: string
  highlight?: boolean
  children: ReactNode
}) {
  return (
    <Link
      to={to}
      title={label}
      aria-label={label}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-lg transition ${
        highlight
          ? 'bg-amber-100 text-amber-800 hover:bg-amber-200 dark:bg-amber-900/50 dark:text-amber-200'
          : 'text-blue-700 hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-blue-950/40'
      }`}
    >
      {children}
    </Link>
  )
}

function FlagCheckbox({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <label className="inline-flex items-center gap-2">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  )
}
