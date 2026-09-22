import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  CircleCheck,
  Clock3,
  Eye,
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
import { DataTableFrame } from '../../../components/ui/DataTableFrame'
import { PaginationBar } from '../../../components/ui/PaginationBar'
import { EmptyState, ErrorState, LoadingState } from '../../../components/ui/States'
import { ClassificationBadge } from '../../../components/monitoring/StatusBadges'
import { useManualSync } from '../../dashboard/hooks/useDashboard'
import { PrtgLocationFilterFields } from '../../locations/components/PrtgLocationFilterFields'
import { LocationMismatchBadge } from '../../locations/components/LocationMismatchBadge'
import { IncidentHistoryDrawer } from '../../history/components/IncidentHistoryDrawer'
import { fetchRecoveredIncidents, fetchRecoveredSummary } from '../api/recoveriesApi'

const PRESETS = [
  { value: 'today', label: 'Hoy' },
  { value: 'yesterday', label: 'Ayer' },
  { value: 'last_7_days', label: 'Últimos 7 días' },
  { value: 'this_month', label: 'Este mes' },
  { value: 'custom', label: 'Rango personalizado' },
] as const

export function RecoveriesPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { prtg, cloudnet } = useManualSync()

  const focusFromUrl = Number(searchParams.get('focus') || '')
  const reviewFromUrl = searchParams.get('review_status') || ''

  const [preset, setPreset] = useState(() => (focusFromUrl || reviewFromUrl ? 'last_7_days' : 'today'))
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
  const [detailId, setDetailId] = useState<number | null>(
    Number.isFinite(focusFromUrl) && focusFromUrl > 0 ? focusFromUrl : null,
  )

  useEffect(() => {
    const focus = Number(searchParams.get('focus') || '')
    const review = searchParams.get('review_status') || ''
    if (review) setReviewStatus(review)
    if (Number.isFinite(focus) && focus > 0) {
      setDetailId(focus)
      setPreset((p) => (p === 'today' ? 'last_7_days' : p))
    }
  }, [searchParams])

  const clearFocusParam = () => {
    if (!searchParams.has('focus')) return
    const next = new URLSearchParams(searchParams)
    next.delete('focus')
    setSearchParams(next, { replace: true })
  }

  const filterParams = {
    preset: preset === 'custom' ? 'custom' : preset,
    date_from: preset === 'custom' ? dateFrom || undefined : undefined,
    date_to: preset === 'custom' ? dateTo || undefined : undefined,
    q: q || undefined,
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
  })

  const summary = useQuery({
    queryKey: ['recoveries', 'summary', filterParams],
    queryFn: () => fetchRecoveredSummary(filterParams),
  })

  const rows = list.data?.data ?? []
  const meta = list.data?.meta
  const filters = list.data?.filters
  const stats = summary.data?.data

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

  return (
    <AppLayout
      bare
      syncing={prtg.isPending || cloudnet.isPending}
      onRefresh={() => {
        void list.refetch()
        void summary.refetch()
      }}
      onSyncPrtg={() => prtg.mutate()}
      onSyncCloudnet={() => cloudnet.mutate()}
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
        />
        <MetricCard
          label="Esta semana"
          value={stats?.recovered_this_week ?? 0}
          icon={<Clock3 className="h-4 w-4" />}
        />
        <MetricCard
          label="Durante gestión"
          value={stats?.recovered_during_management ?? 0}
          icon={<Wrench className="h-4 w-4" />}
          tone="warning"
        />
        <MetricCard
          label="Con técnico en campo"
          value={stats?.recovered_with_field_tech ?? 0}
          icon={<Truck className="h-4 w-4" />}
          tone="danger"
        />
        <MetricCard
          label="Sin contacto"
          value={stats?.recovered_without_contact ?? 0}
          icon={<PhoneOff className="h-4 w-4" />}
        />
        <MetricCard
          label="Con contacto"
          value={stats?.recovered_with_contact ?? 0}
          icon={<Phone className="h-4 w-4" />}
          tone="info"
        />
      </div>

      <div className="mb-4">
        <FilterCard
          actions={
            <Button type="button" size="sm" variant="ghost" onClick={clearFilters}>
              Limpiar
            </Button>
          }
        >
          <FormField label="Periodo">
            <Select
              value={preset}
              onChange={(e) => {
                setPreset(e.target.value)
                setPage(1)
              }}
            >
              {PRESETS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </Select>
          </FormField>
          {preset === 'custom' ? (
            <>
              <FormField label="Desde">
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => {
                    setDateFrom(e.target.value)
                    setPage(1)
                  }}
                />
              </FormField>
              <FormField label="Hasta">
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => {
                    setDateTo(e.target.value)
                    setPage(1)
                  }}
                />
              </FormField>
            </>
          ) : null}
          <SearchField
            label="Buscar"
            value={q}
            placeholder="CID, código o colegio…"
            onChange={(e) => {
              setQ(e.target.value)
              setPage(1)
            }}
          />
          <PrtgLocationFilterFields
            province={provincia}
            district={distrito}
            onProvinceChange={(value) => {
              setProvincia(value)
              setPage(1)
            }}
            onDistrictChange={(value) => {
              setDistrito(value)
              setPage(1)
            }}
          />
          <FormField label="Tecnología">
            <Select
              value={tecnologia}
              onChange={(e) => {
                setTecnologia(e.target.value)
                setPage(1)
              }}
            >
              <option value="">Todas</option>
              {(filters?.tecnologias ?? []).map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
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
              {(filters?.classifications ?? []).map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
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
              {(filters?.scopes ?? []).map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Revisión">
            <Select
              value={reviewStatus}
              onChange={(e) => {
                setReviewStatus(e.target.value)
                setPage(1)
              }}
            >
              <option value="">Todas</option>
              <option value="PENDING_REVIEW">Pendiente de revisión</option>
              <option value="ACKNOWLEDGED">Confirmada</option>
              <option value="CONTINUE_MONITORING">Seguimiento activo</option>
            </Select>
          </FormField>
          <FormField label="Flags">
            <div className="flex flex-col gap-1.5 pt-1 text-sm text-slate-700">
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={sameDay}
                  onChange={(e) => {
                    setSameDay(e.target.checked)
                    setPage(1)
                  }}
                />
                Mismo día
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={duringManagement}
                  onChange={(e) => {
                    setDuringManagement(e.target.checked)
                    setPage(1)
                  }}
                />
                Durante gestión
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={hadFieldTech}
                  onChange={(e) => {
                    setHadFieldTech(e.target.checked)
                    setPage(1)
                  }}
                />
                Técnico en campo
              </label>
            </div>
          </FormField>
        </FilterCard>
      </div>

      <SectionCard
        title="Recuperaciones del periodo"
        action={
          <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-600/15">
            {(meta?.total ?? 0).toLocaleString('es-PE')}
          </span>
        }
      >
        {list.isLoading ? <LoadingState /> : null}
        {list.isError ? (
          <ErrorState message={list.error instanceof Error ? list.error.message : 'Error'} />
        ) : null}
        {!list.isLoading && rows.length === 0 ? (
          <EmptyState title="Sin recuperaciones" description="No hay recuperaciones en el periodo seleccionado." />
        ) : null}

        {rows.length > 0 ? (
          <>
            <DataTableFrame>
              <table className="min-w-[1200px] w-full text-left text-sm">
                <thead className="text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-2 py-2">CID</th>
                    <th className="px-2 py-2">Local educativo</th>
                    <th className="px-2 py-2">Caída</th>
                    <th className="px-2 py-2">Recuperación</th>
                    <th className="px-2 py-2">Duración</th>
                    <th className="px-2 py-2">Tipo</th>
                    <th className="px-2 py-2">Gestión</th>
                    <th className="px-2 py-2">PEXT/PINT</th>
                    <th className="px-2 py-2">Alertas</th>
                    <th className="px-2 py-2">Provincia</th>
                    <th className="px-2 py-2 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.id}
                      className={`border-t border-slate-200/80 ${row.requires_review ? 'bg-amber-50/40' : ''}`}
                    >
                      <td className="px-2 py-2 font-medium tabular-nums">{row.cid ?? '—'}</td>
                      <td className="max-w-[220px] truncate px-2 py-2" title={row.local_educativo ?? ''}>
                        {row.codigo_local ? `${row.codigo_local} · ` : ''}
                        {row.local_educativo}
                      </td>
                      <td className="whitespace-nowrap px-2 py-2 text-slate-600">
                        {row.started_at ? new Date(row.started_at).toLocaleString('es-PE') : '—'}
                      </td>
                      <td className="whitespace-nowrap px-2 py-2 text-emerald-700">
                        {row.recovered_at ? new Date(row.recovered_at).toLocaleString('es-PE') : '—'}
                      </td>
                      <td className="px-2 py-2 tabular-nums">{row.duration ?? '—'}</td>
                      <td className="px-2 py-2">{row.tecnologia ?? '—'}</td>
                      <td className="px-2 py-2">
                        <ClassificationBadge
                          classification={row.management_classification}
                          label={row.management_classification_label}
                        />
                      </td>
                      <td className="px-2 py-2 font-medium">{row.management_scope ?? '—'}</td>
                      <td className="px-2 py-2">
                        <div className="flex flex-wrap gap-1">
                          {row.requires_review ? (
                            <Badge tone="warning">Revisar gestión</Badge>
                          ) : null}
                          {row.had_field_tech && row.requires_review ? (
                            <Badge tone="danger">Personal movilizado</Badge>
                          ) : null}
                          {row.active_field_dispatch ? (
                            <Badge tone="cyan">Desplazamiento activo</Badge>
                          ) : null}
                          {row.same_day ? <Badge tone="success">Mismo día</Badge> : null}
                          {row.recovery_review_status === 'ACKNOWLEDGED' ? (
                            <Badge tone="success">Confirmada</Badge>
                          ) : null}
                          {row.recovery_review_status === 'CONTINUE_MONITORING' ? (
                            <Badge tone="info">Seguimiento</Badge>
                          ) : null}
                          {!row.requires_review &&
                          !row.same_day &&
                          !row.recovery_review_status ? (
                            <span className="text-slate-400">—</span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-2 py-2 text-slate-600">
                        <div className="flex flex-col gap-1">
                          <span>{row.provincia ?? '—'}</span>
                          <LocationMismatchBadge info={row} compact />
                        </div>
                      </td>
                      <td className="px-2 py-2 text-right">
                        <div className="inline-flex flex-wrap justify-end gap-1">
                          <Button type="button" size="sm" variant="ghost" onClick={() => setDetailId(row.id)}>
                            <Eye className="h-3.5 w-3.5" aria-hidden />
                            {row.requires_review ? 'Revisar' : 'Ver'}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => navigate(`/history/schools/${row.school_id}`)}
                          >
                            Historial
                          </Button>
                        </div>
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
        <div className="mt-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>
            Hay <strong>{stats.recovered_during_management}</strong> recuperación(es) durante gestión en el
            periodo. PRTG cerró el estado técnico; conviene revisar la gestión operativa pendiente.
          </p>
        </div>
      ) : null}

      {detailId != null ? (
        <IncidentHistoryDrawer
          incidentId={detailId}
          onClose={() => {
            setDetailId(null)
            clearFocusParam()
          }}
        />
      ) : null}
    </AppLayout>
  )
}
