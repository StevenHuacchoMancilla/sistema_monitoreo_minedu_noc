import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { AppLayout } from '../../../layouts/AppLayout'
import { SearchInput } from '../../../components/ui/SearchInput'
import { SectionCard } from '../../../components/ui/Card'
import { Pagination } from '../../../components/ui/Pagination'
import { EmptyState, ErrorState, LoadingState } from '../../../components/ui/States'
import { PrtgStatusBadge } from '../../../components/monitoring/StatusBadges'
import { useManualSync } from '../../dashboard/hooks/useDashboard'
import { apiGet } from '../../../api/client'

type HistoryRow = {
  school_id: number
  cid: string | null
  local_educativo: string | null
  codigo_local: string | null
  provincia: string | null
  caidas: number
  recuperaciones: number
  estado_actual: string | null
  ultima_caida: string | null
  ultima_recuperacion: string | null
}

const PAGE_SIZE = 20

export function RecoveredIncidentsPage() {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const { prtg, cloudnet } = useManualSync()

  const history = useQuery({
    queryKey: ['dashboard', 'school-history', search],
    queryFn: () =>
      apiGet<{ data: HistoryRow[] }>(
        `/dashboard/school-history${search ? `?q=${encodeURIComponent(search)}` : ''}`,
      ),
  })

  const rows = history.data?.data ?? []
  const pageRows = useMemo(
    () => rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [rows, page],
  )

  return (
    <AppLayout
      title="Historial por colegio"
      syncing={prtg.isPending || cloudnet.isPending}
      onRefresh={() => void history.refetch()}
      onSyncPrtg={() => prtg.mutate()}
      onSyncCloudnet={() => cloudnet.mutate()}
    >
      <div className="mb-3">
        <SearchInput
          value={search}
          placeholder="Buscar CID o colegio…"
          onChange={(e) => {
            setSearch(e.target.value)
            setPage(1)
          }}
        />
      </div>
      <SectionCard
        title="Historial por colegio"
        action={
          <span className="rounded-full bg-[#1d1d1f] px-2.5 py-0.5 text-xs font-semibold tabular-nums text-white">
            {rows.length.toLocaleString('es-PE')}
          </span>
        }
      >
        <p className="mb-3 text-xs text-noc-muted">
          Cuántas veces cayó cada colegio, cuántas veces volvió a operativo y su estado actual.
        </p>
        {history.isLoading ? <LoadingState /> : null}
        {history.isError ? (
          <ErrorState message={history.error instanceof Error ? history.error.message : 'Error'} />
        ) : null}
        {!history.isLoading && rows.length === 0 ? (
          <EmptyState title="Sin historial" description="Aún no hay incidencias por colegio." />
        ) : null}
        {rows.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="text-xs uppercase text-noc-muted">
                  <tr>
                    <th className="px-2 py-2">CID</th>
                    <th className="px-2 py-2">Local</th>
                    <th className="px-2 py-2">Caídas</th>
                    <th className="px-2 py-2">Volvió a operativo</th>
                    <th className="px-2 py-2">Estado actual</th>
                    <th className="px-2 py-2">Última recuperación</th>
                    <th className="px-2 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((row) => (
                    <tr key={row.school_id} className="border-t border-noc-border/70">
                      <td className="px-2 py-2 font-medium tabular-nums">{row.cid ?? '—'}</td>
                      <td className="max-w-[240px] truncate px-2 py-2" title={row.local_educativo ?? ''}>
                        {row.codigo_local ? `${row.codigo_local} · ` : ''}
                        {row.local_educativo}
                      </td>
                      <td className="px-2 py-2 tabular-nums">{row.caidas}</td>
                      <td className="px-2 py-2 tabular-nums text-noc-success">{row.recuperaciones}</td>
                      <td className="px-2 py-2">
                        <PrtgStatusBadge status={row.estado_actual} />
                      </td>
                      <td className="whitespace-nowrap px-2 py-2 text-noc-muted">
                        {row.ultima_recuperacion
                          ? new Date(row.ultima_recuperacion).toLocaleString()
                          : '—'}
                      </td>
                      <td className="px-2 py-2 text-right">
                        <Link to={`/schools/${row.school_id}`} className="text-sm text-noc-info hover:underline">
                          Ver colegio
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} pageSize={PAGE_SIZE} total={rows.length} onPageChange={setPage} />
          </>
        ) : null}
      </SectionCard>
    </AppLayout>
  )
}
