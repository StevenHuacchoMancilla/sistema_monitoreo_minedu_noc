import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  CircleCheck,
  History,
  RotateCcw,
  TriangleAlert,
} from 'lucide-react'
import { AppLayout } from '../../../layouts/AppLayout'
import { SectionCard } from '../../../components/ui/Card'
import { EmptyState, ErrorState, LoadingState } from '../../../components/ui/States'
import { PrtgStatusBadge } from '../../../components/monitoring/StatusBadges'
import { PageHeader } from '../../../components/ui/PageHeader'
import { DataTableFrame } from '../../../components/ui/DataTableFrame'
import { FilterCard } from '../../../components/ui/FilterCard'
import { FormField, SearchField, Select } from '../../../components/ui/FormControls'
import { MetricCard } from '../../../components/ui/MetricCard'
import { PaginationBar } from '../../../components/ui/PaginationBar'
import { Button } from '../../../components/ui/Button'
import { useManualSync } from '../../dashboard/hooks/useDashboard'
import { PrtgLocationFilterFields } from '../../locations/components/PrtgLocationFilterFields'
import { fetchSchoolHistoryIndex } from '../api/historyApi'

export function SchoolHistoryIndexPage() {
  const [q, setQ] = useState('')
  const [provincia, setProvincia] = useState('')
  const [distrito, setDistrito] = useState('')
  const [tecnologia, setTecnologia] = useState('')
  const [currentStatus, setCurrentStatus] = useState('')
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(25)
  const { prtg, cloudnet } = useManualSync()

  const history = useQuery({
    queryKey: ['history', 'schools', q, provincia, distrito, tecnologia, currentStatus, page, perPage],
    queryFn: () =>
      fetchSchoolHistoryIndex({
        q: q || undefined,
        provincia: provincia || undefined,
        distrito: distrito || undefined,
        tecnologia: tecnologia || undefined,
        current_status: currentStatus || undefined,
        page,
        per_page: perPage,
      }),
  })

  const rows = history.data?.data ?? []
  const meta = history.data?.meta
  const filters = history.data?.filters
  const stats = history.data?.stats
  const tecnologias = filters?.tecnologias ?? []

  const clearFilters = () => {
    setQ('')
    setProvincia('')
    setDistrito('')
    setTecnologia('')
    setCurrentStatus('')
    setPage(1)
  }

  const hasFilters = Boolean(q || provincia || distrito || tecnologia || currentStatus)

  return (
    <AppLayout
      bare
      syncing={prtg.isPending || cloudnet.isPending}
      onRefresh={() => void history.refetch()}
      onSyncPrtg={() => prtg.mutate()}
      onSyncCloudnet={() => cloudnet.mutate()}
    >
      <PageHeader
        icon={<History className="h-5 w-5" aria-hidden />}
        title="Historial por colegio"
        description="Analiza caídas, recuperaciones, duración y estado actual de cada local educativo."
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Colegios con historial"
          value={stats?.colegios_con_historial ?? 0}
          icon={<History className="h-4 w-4" />}
        />
        <MetricCard
          label="Incidencias históricas"
          value={stats?.incidencias_historicas ?? 0}
          icon={<TriangleAlert className="h-4 w-4" />}
        />
        <MetricCard
          label="Recuperadas"
          value={stats?.recuperadas ?? 0}
          icon={<CircleCheck className="h-4 w-4" />}
          tone="success"
        />
        <MetricCard
          label="Actualmente caídos"
          value={stats?.activas ?? 0}
          icon={<TriangleAlert className="h-4 w-4" />}
          tone="danger"
        />
      </div>

      <div className="mb-4">
        <FilterCard
          actions={
            hasFilters ? (
              <Button type="button" size="sm" variant="ghost" onClick={clearFilters}>
                <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                Limpiar
              </Button>
            ) : null
          }
        >
          <SearchField
            label="Buscar"
            value={q}
            placeholder="CID, código local o colegio…"
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
              {tecnologias.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Estado actual">
            <Select
              value={currentStatus}
              onChange={(e) => {
                setCurrentStatus(e.target.value)
                setPage(1)
              }}
            >
              <option value="">Todos</option>
              <option value="OPERATIVO">Operativo</option>
              <option value="CAIDO">Caído</option>
              <option value="SIN_DATOS">Sin datos</option>
            </Select>
          </FormField>
        </FilterCard>
      </div>

      <SectionCard title="Resumen operativo por colegio">
        {history.isLoading ? <LoadingState /> : null}
        {history.isError ? (
          <ErrorState message={history.error instanceof Error ? history.error.message : 'Error'} />
        ) : null}
        {!history.isLoading && rows.length === 0 ? (
          <EmptyState
            title="Sin historial"
            description={hasFilters ? 'Ningún colegio coincide con los filtros.' : 'Aún no hay incidencias por colegio.'}
          />
        ) : null}
        {rows.length > 0 ? (
          <>
            <DataTableFrame>
              <table className="min-w-[1100px] w-full text-left text-sm">
                <thead className="text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-2 py-2">CID</th>
                    <th className="px-2 py-2">Local educativo</th>
                    <th className="px-2 py-2">Caídas</th>
                    <th className="px-2 py-2">Recuperaciones</th>
                    <th className="px-2 py-2">Tiempo total caído</th>
                    <th className="px-2 py-2">Estado actual</th>
                    <th className="px-2 py-2">Última caída</th>
                    <th className="px-2 py-2">Última recuperación</th>
                    <th className="px-2 py-2 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.school_id} className="border-t border-slate-200/80">
                      <td className="px-2 py-2 font-medium tabular-nums text-slate-900">{row.cid ?? '—'}</td>
                      <td className="max-w-[260px] truncate px-2 py-2 text-slate-700" title={row.local_educativo ?? ''}>
                        {row.codigo_local ? `${row.codigo_local} · ` : ''}
                        {row.local_educativo}
                      </td>
                      <td className="px-2 py-2 tabular-nums">{row.caidas}</td>
                      <td className="px-2 py-2 tabular-nums text-emerald-700">{row.recuperaciones}</td>
                      <td className="whitespace-nowrap px-2 py-2 text-slate-600">
                        {row.tiempo_total_caido ?? '—'}
                      </td>
                      <td className="px-2 py-2">
                        <PrtgStatusBadge status={row.estado_actual} />
                      </td>
                      <td className="whitespace-nowrap px-2 py-2 text-slate-500">
                        {row.ultima_caida ? new Date(row.ultima_caida).toLocaleString('es-PE') : '—'}
                      </td>
                      <td className="whitespace-nowrap px-2 py-2 text-slate-500">
                        {row.ultima_recuperacion
                          ? new Date(row.ultima_recuperacion).toLocaleString('es-PE')
                          : '—'}
                      </td>
                      <td className="px-2 py-2 text-right">
                        <Link
                          to={`/history/schools/${row.school_id}`}
                          title="Ver historial completo del colegio"
                          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-semibold text-blue-700 transition hover:bg-blue-50"
                        >
                          <History className="h-4 w-4" aria-hidden />
                          Ver historial
                        </Link>
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
    </AppLayout>
  )
}
