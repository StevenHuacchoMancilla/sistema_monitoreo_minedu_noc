import { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { AppLayout } from '../../../layouts/AppLayout'
import { SearchInput } from '../../../components/ui/SearchInput'
import { Pagination } from '../../../components/ui/Pagination'
import { SectionCard } from '../../../components/ui/Card'
import { EmptyState, ErrorState, LoadingState } from '../../../components/ui/States'
import {
  ClassificationBadge,
  FollowupBadge,
  PrtgStatusBadge,
  ReincidenteBadge,
} from '../../../components/monitoring/StatusBadges'
import { FOLLOWUP_LABELS } from '../../../components/ui/Badge'
import { useDashboardSummary, useManualSync, useOutages } from '../../dashboard/hooks/useDashboard'
import { usePrtgLocationCatalog } from '../../locations/hooks/usePrtgLocationCatalog'
import { LocationMismatchBadge } from '../../locations/components/LocationMismatchBadge'
import { IncidentManageModal } from '../components/IncidentManageModal'
import { DataTableFrame } from '../../../components/ui/DataTableFrame'
import type { OutageRow } from '../../../types/api'

const PAGE_SIZE = 20

const FOLLOWUP_FILTERS = [
  { value: '', label: 'Todos los estados de gestión' },
  { value: 'PENDIENTE_CONTACTO', label: FOLLOWUP_LABELS.PENDIENTE_CONTACTO },
  { value: 'EN_GESTION', label: FOLLOWUP_LABELS.EN_GESTION },
  { value: 'EN_DESCARTE', label: FOLLOWUP_LABELS.EN_DESCARTE },
  { value: 'EN_ESPERA', label: FOLLOWUP_LABELS.EN_ESPERA },
  { value: 'ESCALADO', label: FOLLOWUP_LABELS.ESCALADO },
  { value: 'TECNICO_EN_CAMPO', label: FOLLOWUP_LABELS.TECNICO_EN_CAMPO },
]

const MANAGING = new Set([
  'EN_GESTION',
  'EN_DESCARTE',
  'EN_ESPERA',
  'ESCALADO',
  'TECNICO_EN_CAMPO',
])

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
  const [followup, setFollowup] = useState(presetFollowup ?? '')
  const [provincia, setProvincia] = useState(searchParams.get('provincia') ?? '')
  const [distrito, setDistrito] = useState(searchParams.get('distrito') ?? '')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [manageId, setManageId] = useState<number | null>(null)
  const client = useQueryClient()

  useEffect(() => {
    setProvincia(searchParams.get('provincia') ?? '')
    setDistrito(searchParams.get('distrito') ?? '')
    setPage(1)
  }, [searchParams])

  const outages = useOutages(search)
  const summary = useDashboardSummary()
  const { prtg, cloudnet } = useManualSync()
  const syncing = prtg.isPending || cloudnet.isPending
  const { provinces: provincias, districts: distritos } = usePrtgLocationCatalog(provincia)

  const rows = useMemo(() => {
    let data = outages.data?.data ?? []
    if (filter) data = data.filter(filter)
    if (followup === 'EN_GESTION_GROUP') {
      data = data.filter((r) => MANAGING.has(r.followup_status ?? ''))
    } else if (followup) {
      data = data.filter((r) => r.followup_status === followup)
    }
    if (provincia) {
      const p = provincia.toUpperCase()
      data = data.filter((r) => (r.provincia ?? '').toUpperCase() === p)
    }
    if (distrito) {
      const d = distrito.toUpperCase()
      data = data.filter((r) => (r.distrito ?? '').toUpperCase() === d)
    }
    if (fromDate) {
      const from = new Date(fromDate)
      data = data.filter((r) => (r.started_at ? new Date(r.started_at) >= from : false))
    }
    if (toDate) {
      const to = new Date(toDate)
      to.setHours(23, 59, 59, 999)
      data = data.filter((r) => (r.started_at ? new Date(r.started_at) <= to : false))
    }
    return data
  }, [outages.data, filter, followup, provincia, distrito, fromDate, toDate])

  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const selectClass =
    'min-w-0 max-w-full flex-1 basis-[140px] rounded-xl border border-noc-border bg-white px-3 py-2 text-sm text-noc-text shadow-sm outline-none sm:basis-[160px] md:max-w-[220px]'

  return (
    <AppLayout
      title={title}
      syncing={syncing}
      onRefresh={() => {
        void outages.refetch()
        void summary.refetch()
      }}
      onSyncPrtg={() => prtg.mutate()}
      onSyncCloudnet={() => cloudnet.mutate()}
    >
      <div className="mb-3 flex min-w-0 flex-col gap-2">
        <SearchInput
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setPage(1)
          }}
          placeholder="Buscar CID, colegio, IP, responsable…"
        />
        <div className="flex min-w-0 flex-wrap gap-2">
          <select
            className={selectClass}
            value={followup}
            disabled={Boolean(filter)}
            onChange={(e) => {
              setFollowup(e.target.value)
              setPage(1)
            }}
          >
            {FOLLOWUP_FILTERS.map((f) => (
              <option key={f.value || 'all'} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
          <select
            className={selectClass}
            value={provincia}
            onChange={(e) => {
              setProvincia(e.target.value)
              setDistrito('')
              setPage(1)
            }}
            aria-label="Provincia (PRTG)"
            title="Provincia operativa PRTG"
          >
            <option value="">Todas las provincias</option>
            {provincias.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <select
            className={selectClass}
            value={distrito}
            onChange={(e) => {
              setDistrito(e.target.value)
              setPage(1)
            }}
            aria-label="Distrito (PRTG)"
            title="Distrito operativo PRTG"
          >
            <option value="">Todos los distritos</option>
            {distritos.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <input
            type="date"
            className={selectClass}
            value={fromDate}
            onChange={(e) => {
              setFromDate(e.target.value)
              setPage(1)
            }}
            title="Caída desde"
            aria-label="Caída desde"
          />
          <input
            type="date"
            className={selectClass}
            value={toDate}
            onChange={(e) => {
              setToDate(e.target.value)
              setPage(1)
            }}
            title="Caída hasta"
            aria-label="Caída hasta"
          />
        </div>
      </div>

      {(provincia || distrito) && (
        <p className="mb-3 text-sm text-noc-muted">
          Filtro zona:{' '}
          <span className="font-medium text-noc-text">
            {[provincia, distrito].filter(Boolean).join(' > ')}
          </span>
        </p>
      )}

      <SectionCard
        title={title}
        action={
          <span className="rounded-full bg-[#ff3b30] px-2.5 py-0.5 text-xs font-semibold tabular-nums text-white">
            {rows.length.toLocaleString('es-PE')}
          </span>
        }
      >
        <p className="mb-3 text-xs text-noc-muted">
          Usa <strong className="font-medium text-noc-text">Ver / Gestionar</strong> para abrir el detalle
          completo y registrar la gestión del incidente.
        </p>

        {outages.isLoading ? <LoadingState /> : null}
        {outages.isError ? (
          <ErrorState message={outages.error instanceof Error ? outages.error.message : 'Error'} />
        ) : null}
        {!outages.isLoading && rows.length === 0 ? (
          <EmptyState title="Sin registros" description="No hay incidencias para este filtro." />
        ) : null}

        {rows.length > 0 ? (
          <>
            <div className="min-w-0">
              <DataTableFrame>
              <table className="w-full min-w-[960px] text-left text-sm">
                <thead className="sticky top-0 bg-noc-surface text-xs uppercase tracking-wide text-noc-muted">
                  <tr>
                    <th className="whitespace-nowrap px-2 py-2">Estado</th>
                    <th className="whitespace-nowrap px-2 py-2">CID</th>
                    <th className="min-w-[180px] px-2 py-2">Local educativo</th>
                    <th className="whitespace-nowrap px-2 py-2">Provincia</th>
                    <th className="whitespace-nowrap px-2 py-2">Fecha caída</th>
                    <th className="whitespace-nowrap px-2 py-2">Tiempo caído</th>
                    <th className="whitespace-nowrap px-2 py-2">Seguimiento</th>
                    <th className="whitespace-nowrap px-2 py-2">Responsable</th>
                    <th className="whitespace-nowrap px-2 py-2">Ticket</th>
                    <th className="sticky right-0 z-10 whitespace-nowrap bg-noc-surface px-2 py-2 text-right shadow-[-8px_0_8px_-8px_rgba(15,23,42,0.12)]">
                      Acción
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((row) => (
                    <tr key={row.incident_id} className="border-t border-noc-border/70 hover:bg-black/[0.02]">
                      <td className="px-2 py-2">
                        <PrtgStatusBadge status={row.estado_prtg} />
                      </td>
                      <td className="px-2 py-2 font-medium tabular-nums">{row.cid}</td>
                      <td className="max-w-[220px] truncate px-2 py-2" title={row.local_educativo ?? ''}>
                        {row.codigo_local ? `${row.codigo_local} · ` : ''}
                        {row.local_educativo}
                      </td>
                      <td className="max-w-[160px] px-2 py-2">
                        <div className="flex flex-col gap-1">
                          <span className="truncate">{row.provincia}</span>
                          <LocationMismatchBadge info={row} compact />
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-2 py-2 text-noc-muted">
                        {row.started_at ? new Date(row.started_at).toLocaleString() : '—'}
                      </td>
                      <td className="whitespace-nowrap px-2 py-2 text-noc-muted">{row.duracion}</td>
                      <td className="px-2 py-2">
                        <div className="flex flex-wrap items-center gap-1">
                          <ClassificationBadge
                            classification={row.management_classification}
                            label={row.management_classification_label}
                            colorKey={row.color_key}
                          />
                          <FollowupBadge status={row.followup_status} />
                          <ReincidenteBadge count={row.reincidente_count} />
                        </div>
                      </td>
                      <td className="max-w-[120px] truncate px-2 py-2 text-noc-muted">
                        {row.responsible_area ?? '—'}
                      </td>
                      <td className="max-w-[100px] truncate px-2 py-2 text-noc-muted">
                        {row.glpi_ticket ?? '—'}
                      </td>
                      <td className="sticky right-0 z-10 whitespace-nowrap bg-noc-surface px-2 py-2 text-right shadow-[-8px_0_8px_-8px_rgba(15,23,42,0.12)]">
                        <button
                          type="button"
                          onClick={() => setManageId(row.incident_id)}
                          className="rounded-xl bg-[#1d1d1f] px-3 py-1.5 text-xs font-semibold text-white hover:bg-black"
                        >
                          Ver / Gestionar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </DataTableFrame>
            </div>
            <Pagination page={page} pageSize={PAGE_SIZE} total={rows.length} onPageChange={setPage} />
          </>
        ) : null}
      </SectionCard>

      {manageId !== null ? (
        <IncidentManageModal
          incidentId={manageId}
          onClose={() => {
            setManageId(null)
            void outages.refetch()
            void summary.refetch()
            void client.invalidateQueries({ queryKey: ['reports'] })
          }}
        />
      ) : null}
    </AppLayout>
  )
}
