import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useValorDebounce } from '../../../lib/useValorDebounce'
import { Link } from 'react-router-dom'
import {
  CircleCheck,
  History,
  RotateCcw,
  TriangleAlert,
} from 'lucide-react'
import { DisenoApp } from '../../../layouts/DisenoApp'
import { SectionCard } from '../../../components/ui/Tarjeta'
import { EmptyState, ErrorState, LoadingState } from '../../../components/ui/Estados'
import { PrtgStatusBadge } from '../../../components/monitoring/InsigniasEstado'
import { EncabezadoPagina } from '../../../components/ui/EncabezadoPagina'
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
} from '../../../components/ui/MarcoTablaDatos'
import { TarjetaFiltro } from '../../../components/ui/TarjetaFiltro'
import { FormField, SearchField, Select } from '../../../components/ui/ControlesFormulario'
import { TarjetaMetrica } from '../../../components/ui/TarjetaMetrica'
import { GrillaMetricas } from '../../../components/ui/GrillaMetricas'
import { BarraPaginacion } from '../../../components/ui/BarraPaginacion'
import { Boton } from '../../../components/ui/Boton'
import { useManualSync } from '../../dashboard/hooks/useDashboard'
import { CamposFiltroUbicacionPrtg } from '../../locations/components/CamposFiltroUbicacionPrtg'
import { fetchSchoolHistoryIndex } from '../api/apiHistorial'

export function PaginaHistorialColegios() {
  const [q, setQ] = useState('')
  const [provincia, setProvincia] = useState('')
  const [distrito, setDistrito] = useState('')
  const [tecnologia, setTecnologia] = useState('')
  const [currentStatus, setCurrentStatus] = useState('')
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(25)
  const { prtg } = useManualSync()

  const qDebounced = useValorDebounce(q.trim())

  const history = useQuery({
    queryKey: ['history', 'schools', qDebounced, provincia, distrito, tecnologia, currentStatus, page, perPage],
    placeholderData: keepPreviousData,
    queryFn: () =>
      fetchSchoolHistoryIndex({
        q: qDebounced || undefined,
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
    <DisenoApp
      bare
      syncing={prtg.isPending}
      onRefresh={() => void history.refetch()}
      onSyncPrtg={() => prtg.mutate()}
    >
      <EncabezadoPagina
        icon={<History className="h-5 w-5" aria-hidden />}
        title="Historial por colegio"
        description="Analiza caídas, recuperaciones, duración y estado actual de cada local educativo."
      />

      <GrillaMetricas>
        <TarjetaMetrica label="Colegios con historial" value={stats?.colegios_con_historial ?? 0} icon={<History />} />
        <TarjetaMetrica label="Incidencias históricas" value={stats?.incidencias_historicas ?? 0} icon={<TriangleAlert />} />
        <TarjetaMetrica label="Recuperadas" value={stats?.recuperadas ?? 0} icon={<CircleCheck />} tone="success" />
        <TarjetaMetrica label="Actualmente caídos" value={stats?.activas ?? 0} icon={<TriangleAlert />} tone="danger" />
      </GrillaMetricas>

      <div className="mb-4">
        <TarjetaFiltro
          actions={
            hasFilters ? (
              <Boton type="button" size="sm" variant="ghost" onClick={clearFilters}>
                <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                Limpiar
              </Boton>
            ) : null
          }
        >
          <SearchField
            label="Buscar"
            value={q}
            placeholder="CID o TSS"
            onChange={(e) => {
              setQ(e.target.value)
              setPage(1)
            }}
          />
          <CamposFiltroUbicacionPrtg
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
        </TarjetaFiltro>
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
            <DataTableContainer>
              <table className={`${tableClassName} table-fixed`} style={{ minWidth: 880 }}>
                <thead className={theadClassName}>
                  <tr>
                    <th className={`${thClassName} w-[4.5rem]`}>CID</th>
                    <th className={thClassName}>Local educativo</th>
                    <th className={`${thClassName} w-[4.5rem]`}>Caídas</th>
                    <th className={`${thClassName} w-[5rem]`}>Recup.</th>
                    <th className={`${thClassName} hidden md:table-cell w-[7rem]`}>Tiempo caído</th>
                    <th className={`${thClassName} w-[6.5rem]`}>Estado</th>
                    <th className={`${thClassName} hidden lg:table-cell w-[7rem]`}>Última caída</th>
                    <th className={`${thClassName} hidden xl:table-cell w-[7rem]`}>Última recup.</th>
                    <th className={`${thClassName} sticky right-0 z-10 w-[7.5rem] bg-slate-50 text-right shadow-[-8px_0_8px_-8px_rgba(15,23,42,0.12)] dark:bg-slate-900`}>
                      Acción
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.school_id} className={`${trClassName} group`}>
                      <td className={`${tdClassName} font-medium tabular-nums text-slate-900 dark:text-slate-100`}>
                        {row.cid ?? '—'}
                      </td>
                      <td className={tdClassName}>
                        <Truncate title={row.local_educativo}>
                          {row.codigo_local ? `${row.codigo_local} · ` : ''}
                          {row.local_educativo}
                        </Truncate>
                      </td>
                      <td className={`${tdClassName} tabular-nums`}>{row.caidas}</td>
                      <td className={`${tdClassName} tabular-nums text-emerald-700 dark:text-emerald-400`}>
                        {row.recuperaciones}
                      </td>
                      <td className={`${tdClassName} hidden md:table-cell whitespace-nowrap text-slate-500`}>
                        {row.tiempo_total_caido ?? '—'}
                      </td>
                      <td className={tdClassName}>
                        <PrtgStatusBadge status={row.estado_actual} />
                      </td>
                      <td className={`${tdDateClassName} hidden lg:table-cell`}>
                        <IsoDateTimeCell value={row.ultima_caida} />
                      </td>
                      <td className={`${tdDateClassName} hidden xl:table-cell`}>
                        <IsoDateTimeCell value={row.ultima_recuperacion} />
                      </td>
                      <td className="sticky right-0 z-10 bg-white px-3 py-2.5 text-right shadow-[-8px_0_8px_-8px_rgba(15,23,42,0.12)] group-hover:bg-slate-50 dark:bg-slate-900 dark:group-hover:bg-slate-800/60">
                        <Link
                          to={`/history/schools/${row.school_id}`}
                          title="Ver historial completo del colegio"
                          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[13px] font-semibold whitespace-nowrap text-blue-700 transition hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-blue-950/40"
                        >
                          <History className="h-4 w-4" aria-hidden />
                          Ver historial
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </DataTableContainer>
            {meta ? (
              <BarraPaginacion
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
    </DisenoApp>
  )
}
