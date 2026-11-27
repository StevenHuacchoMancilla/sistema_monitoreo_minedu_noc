import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  CircleCheck,
  CircleX,
  Eye,
  Gauge,
  GraduationCap,
  History,
  Network,
  Pencil,
  Plus,
  RotateCcw,
  SearchX,
  Server,
  TriangleAlert,
  WifiOff,
  Zap,
} from 'lucide-react'
import { DisenoApp } from '../../../layouts/DisenoApp'
import { Boton } from '../../../components/ui/Boton'
import { BotonIcono } from '../../../components/ui/BotonIcono'
import { TarjetaFiltro } from '../../../components/ui/TarjetaFiltro'
import { FormField, Input, SearchField, Select } from '../../../components/ui/ControlesFormulario'
import { TarjetaMetrica } from '../../../components/ui/TarjetaMetrica'
import { GrillaMetricas } from '../../../components/ui/GrillaMetricas'
import { MasterSourceBadge, EncabezadoPagina } from '../../../components/ui/EncabezadoPagina'
import { BarraPaginacion } from '../../../components/ui/BarraPaginacion'
import { Insignia } from '../../../components/ui/InsigniaSuave'
import { InsigniaEnergia } from '../../../components/monitoring/InsigniaEnergia'
import { EsqueletoTabla } from '../../../components/ui/EsqueletoTabla'
import {
  DataTableContainer,
  Truncate,
  tableClassName,
  tdClassName,
  thClassName,
  theadClassName,
  trClassName,
} from '../../../components/ui/MarcoTablaDatos'
import { endpoints } from '../../../api/endpoints'
import { usePermisos } from '../../auth/hooks/usePermisos'
import { P } from '../../auth/permisos'
import { techBadgeClass } from '../../../lib/tokensUi'
import { InsigniaDesajusteUbicacion } from '../../locations/components/InsigniaDesajusteUbicacion'
import type { SchoolGeneralPayload, SchoolListRow } from '../types/colegio'

function formatMbps(value: string | number | null | undefined): string {
  if (value == null || value === '') return '—'
  const raw = String(value).trim()
  if (/mbps/i.test(raw)) return raw
  return `${raw} Mbps`
}

function CapacityCell({ row }: { row: SchoolListRow }) {
  const tx = row.capacidad_tx_mbps
  const rx = row.capacidad_rx_mbps
  const plan = row.capacidad_mbps

  if (tx == null && rx == null && (plan == null || plan === '')) {
    return <span className="text-slate-400">Sin plan PRTG</span>
  }

  return (
    <div className="min-w-0 space-y-1">
      <p className="text-[12px] font-bold tabular-nums text-slate-900 dark:text-slate-50" title="Plan (desde PRTG TX/RX)">
        {formatMbps(plan ?? tx ?? rx)}
      </p>
      <div className="flex flex-col gap-0.5 text-[10px] font-semibold text-slate-500 dark:text-slate-400">
        <span className="inline-flex items-center gap-1" title="Transmisión (plan en sensor PRTG)">
          <ArrowUpFromLine className="h-3 w-3 text-sky-500" aria-hidden />
          TX {tx != null ? `${tx} Mbps` : '—'}
        </span>
        <span className="inline-flex items-center gap-1" title="Recepción (plan en sensor PRTG)">
          <ArrowDownToLine className="h-3 w-3 text-violet-500" aria-hidden />
          RX {rx != null ? `${rx} Mbps` : '—'}
        </span>
      </div>
    </div>
  )
}

export function PaginaListaColegios() {
  const client = useQueryClient()
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [provincia, setProvincia] = useState('')
  const [distrito, setDistrito] = useState('')
  const [tecnologia, setTecnologia] = useState('')
  const [energia, setEnergia] = useState('')
  const [active, setActive] = useState('1')
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(25)
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState<SchoolGeneralPayload>({
    codigo_local: '',
    local_educativo: '',
    provincia: '',
    distrito: '',
    cid: '',
  })

  const list = useQuery({
    queryKey: ['schools', 'list', q, provincia, distrito, tecnologia, energia, active, page, perPage],
    queryFn: () =>
      endpoints.schools({
        q: q || undefined,
        provincia: provincia || undefined,
        distrito: distrito || undefined,
        tecnologia: tecnologia || undefined,
        energia: energia || undefined,
        active,
        per_page: String(perPage),
        page: String(page),
      }),
  })

  const create = useMutation({
    mutationFn: () => endpoints.createSchool(form),
    onSuccess: async (data) => {
      setShowCreate(false)
      await client.invalidateQueries({ queryKey: ['schools'] })
      if (data.school?.id) navigate(`/schools/${data.school.id}`)
    },
  })

  const { can } = usePermisos()
  const canManage = can(P.schoolsManage)

  const provinces = list.data?.filters?.provincias ?? []
  const districts = list.data?.filters?.distritos ?? []
  const technologies = list.data?.filters?.tecnologias ?? []
  const stats = list.data?.stats
  const rows = list.data?.data ?? []
  const meta = list.data?.meta

  const clearFilters = () => {
    setQ('')
    setProvincia('')
    setDistrito('')
    setTecnologia('')
    setEnergia('')
    setActive('1')
    setPage(1)
  }

  const hasFilters = Boolean(q || provincia || distrito || tecnologia || energia || active !== '1')

  return (
    <DisenoApp bare>
      <div className="min-w-0 space-y-6">
        <EncabezadoPagina
          icon={<GraduationCap className="h-5 w-5" aria-hidden />}
          title="Locales educativos"
          description="Ficha maestra del LLEE: energía (panel / red pública), plan TX·RX desde PRTG, red y contactos."
          badges={<MasterSourceBadge />}
          breadcrumb={
            <p className="text-xs font-medium text-slate-500">
              NOC Loreto <span className="text-slate-300">/</span> Locales educativos
            </p>
          }
          actions={
            canManage ? (
              <Boton type="button" variant="primary" onClick={() => setShowCreate((v) => !v)}>
                <Plus className="h-4 w-4" aria-hidden />
                Nuevo local
              </Boton>
            ) : undefined
          }
        />

        <GrillaMetricas>
          <TarjetaMetrica icon={<GraduationCap />} label="Total locales" value={stats?.total ?? meta?.total ?? '—'} tone="info" />
          <TarjetaMetrica icon={<Network />} label="Con CID" value={stats?.with_cid ?? '—'} tone="cyan" />
          <TarjetaMetrica icon={<WifiOff />} label="Sin CID" value={stats?.without_cid ?? '—'} tone="warning" />
          <TarjetaMetrica icon={<CircleCheck />} label="Activos" value={stats?.active ?? '—'} tone="success" />
        </GrillaMetricas>

        <TarjetaFiltro
          actions={
            <Boton type="button" size="sm" onClick={clearFilters} disabled={!hasFilters}>
              <RotateCcw className="h-3.5 w-3.5" aria-hidden />
              Limpiar
            </Boton>
          }
        >
          <SearchField
            className="min-w-0 sm:col-span-2 xl:col-span-2"
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
              setPage(1)
            }}
            placeholder="CID o TSS"
          />
          <FormField label="Provincia" className="min-w-0">
            <Select
              value={provincia}
              onChange={(e) => {
                setProvincia(e.target.value)
                setDistrito('')
                setPage(1)
              }}
            >
              <option value="">Todas</option>
              {provinces.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Distrito" className="min-w-0">
            <Select
              value={distrito}
              onChange={(e) => {
                setDistrito(e.target.value)
                setPage(1)
              }}
            >
              <option value="">Todos</option>
              {districts.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Tecnología" className="min-w-0">
            <Select
              value={tecnologia}
              onChange={(e) => {
                setTecnologia(e.target.value)
                setPage(1)
              }}
            >
              <option value="">Todas</option>
              {technologies.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Energía" className="min-w-0">
            <Select
              value={energia}
              onChange={(e) => {
                setEnergia(e.target.value)
                setPage(1)
              }}
            >
              <option value="">Todas</option>
              <option value="PANEL">Panel solar</option>
              <option value="RED">Red pública</option>
              <option value="SIN">Sin dato</option>
            </Select>
          </FormField>
          <FormField label="Estado" className="min-w-0">
            <Select
              value={active}
              onChange={(e) => {
                setActive(e.target.value)
                setPage(1)
              }}
            >
              <option value="1">Activos</option>
              <option value="0">Inactivos</option>
              <option value="all">Todos</option>
            </Select>
          </FormField>
        </TarjetaFiltro>

        {showCreate ? (
          <section className="rounded-2xl border border-blue-200 bg-blue-50/40 p-4 shadow-sm dark:border-blue-900/50 dark:bg-blue-950/20 sm:p-5">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-50">Nuevo local educativo</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <FormField label="Código local">
                <Input value={form.codigo_local ?? ''} onChange={(e) => setForm((f) => ({ ...f, codigo_local: e.target.value }))} />
              </FormField>
              <FormField label="Local educativo" className="sm:col-span-2">
                <Input
                  value={form.local_educativo ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, local_educativo: e.target.value }))}
                />
              </FormField>
              <FormField label="Provincia">
                <Input value={form.provincia ?? ''} onChange={(e) => setForm((f) => ({ ...f, provincia: e.target.value }))} />
              </FormField>
              <FormField label="Distrito">
                <Input value={form.distrito ?? ''} onChange={(e) => setForm((f) => ({ ...f, distrito: e.target.value }))} />
              </FormField>
              <FormField label="CID">
                <Input value={form.cid ?? ''} onChange={(e) => setForm((f) => ({ ...f, cid: e.target.value }))} />
              </FormField>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Boton type="button" loading={create.isPending} onClick={() => create.mutate()}>
                Crear
              </Boton>
              <Boton type="button" variant="secondary" onClick={() => setShowCreate(false)}>
                Cancelar
              </Boton>
              {create.isError ? (
                <span className="self-center text-sm font-semibold text-red-600">No se pudo crear el local</span>
              ) : null}
            </div>
          </section>
        ) : null}

        {list.isLoading ? <EsqueletoTabla rows={10} cols={8} /> : null}

        {list.isError ? (
          <section className="rounded-xl border border-red-200 bg-red-50 p-6 text-center dark:border-red-900 dark:bg-red-950/40">
            <TriangleAlert className="mx-auto h-8 w-8 text-red-600" />
            <p className="mt-2 text-sm font-semibold text-red-800">No pudimos cargar los locales educativos.</p>
            <Boton type="button" className="mt-3" onClick={() => void list.refetch()}>
              Reintentar
            </Boton>
          </section>
        ) : null}

        {!list.isLoading && !list.isError && rows.length === 0 ? (
          <section className="rounded-xl border border-slate-200 bg-white px-6 py-12 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <SearchX className="mx-auto h-10 w-10 text-slate-400" />
            <p className="mt-3 text-base font-semibold text-slate-900 dark:text-slate-50">No se encontraron locales educativos.</p>
            <p className="mt-1 text-sm text-slate-500">Prueba modificando los filtros de búsqueda.</p>
            <Boton type="button" className="mt-4" onClick={clearFilters}>
              Limpiar filtros
            </Boton>
          </section>
        ) : null}

        {!list.isLoading && rows.length > 0 && meta ? (
          <section className="min-w-0 overflow-hidden rounded-md border border-noc-border bg-noc-surface">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 sm:px-5 sm:py-4 dark:border-slate-800">
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50">Locales educativos</h2>
                <p className="mt-0.5 text-[13px] text-slate-500">
                  {meta.total.toLocaleString('es-PE')} registros · capacidad TX/RX desde sensores PRTG · energía IMPLEMENTACION
                </p>
              </div>
              <p className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                <Gauge className="h-3.5 w-3.5" aria-hidden />
                Plan = nombre sensor TRANSMISION / RECEPCION
              </p>
            </div>

            <DataTableContainer>
              <table className={`${tableClassName} table-fixed`} style={{ minWidth: 1080 }}>
                <thead className={theadClassName}>
                  <tr>
                    <th className={`${thClassName} w-[3.25rem]`}>N°</th>
                    <th className={`${thClassName} w-[5.25rem]`}>CID</th>
                    <th className={thClassName}>Local educativo</th>
                    <th className={`${thClassName} hidden lg:table-cell w-[8rem]`}>Ubicación</th>
                    <th className={`${thClassName} hidden md:table-cell w-[6.5rem]`}>Tecnología</th>
                    <th className={`${thClassName} w-[7.5rem]`}>
                      <span className="inline-flex items-center gap-1">
                        <Zap className="h-3.5 w-3.5" aria-hidden />
                        Energía
                      </span>
                    </th>
                    <th className={`${thClassName} w-[8.5rem]`}>
                      <span className="block">Capacidad</span>
                      <span className="block text-[10px] font-normal normal-case tracking-normal text-slate-400">
                        plan PRTG TX · RX
                      </span>
                    </th>
                    <th className={`${thClassName} hidden xl:table-cell w-[7rem]`}>Nodo/POP</th>
                    <th
                      className={`${thClassName} sticky right-[7.25rem] z-20 w-[6.5rem] bg-slate-50 shadow-[-8px_0_8px_-8px_rgba(15,23,42,0.12)] dark:bg-slate-900`}
                    >
                      Estado
                    </th>
                    <th
                      className={`${thClassName} sticky right-0 z-20 w-[7.25rem] bg-slate-50 text-right shadow-[-8px_0_8px_-8px_rgba(15,23,42,0.18)] dark:bg-slate-900`}
                    >
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className={`${trClassName} group`}>
                      <td className={`${tdClassName} font-medium tabular-nums text-slate-500`}>{row.n ?? '—'}</td>
                      <td className={`${tdClassName} font-mono text-xs font-semibold tabular-nums text-slate-900 dark:text-slate-100`}>
                        {row.cid ?? '—'}
                      </td>
                      <td className={tdClassName}>
                        <Truncate title={row.local_educativo} className="font-medium text-slate-900 dark:text-slate-100">
                          {row.local_educativo}
                        </Truncate>
                        <span className="mt-0.5 block truncate text-[11px] text-slate-500">
                          {[row.codigo_local ? `Cód. ${row.codigo_local}` : null, row.codigo_modular ? `Mod. ${row.codigo_modular}` : null]
                            .filter(Boolean)
                            .join(' · ') || '—'}
                        </span>
                      </td>
                      <td className={`${tdClassName} hidden lg:table-cell`}>
                        <Truncate title={row.provincia} className="font-medium">
                          {row.provincia ?? '—'}
                        </Truncate>
                        <span className="mt-0.5 flex min-w-0 items-center gap-1">
                          <Truncate title={row.distrito} className="text-[11px] text-slate-500">
                            {row.distrito ?? '—'}
                          </Truncate>
                          <InsigniaDesajusteUbicacion
                            compact
                            info={{
                              location_mismatch: row.location_mismatch,
                              provincia: row.prtg_province,
                              distrito: row.prtg_district,
                              prtg_province: row.prtg_province,
                              prtg_district: row.prtg_district,
                              admin_provincia: row.provincia,
                              admin_distrito: row.distrito,
                              location_source: row.location_source,
                            }}
                          />
                        </span>
                      </td>
                      <td className={`${tdClassName} hidden md:table-cell`}>
                        {row.tecnologia ? (
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${techBadgeClass(row.tecnologia)}`}>
                            {row.tecnologia}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className={tdClassName}>
                        <InsigniaEnergia energy={row.energy_type} size="sm" />
                      </td>
                      <td className={tdClassName}>
                        <CapacityCell row={row} />
                      </td>
                      <td className={`${tdClassName} hidden xl:table-cell`}>
                        <span className="inline-flex max-w-full items-center gap-1" title={row.nodo_pop ?? undefined}>
                          {row.nodo_pop ? <Server className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden /> : null}
                          <Truncate title={row.nodo_pop}>{row.nodo_pop ?? '—'}</Truncate>
                        </span>
                      </td>
                      <td className="sticky right-[7.25rem] z-10 bg-white px-3 py-2.5 shadow-[-8px_0_8px_-8px_rgba(15,23,42,0.08)] group-hover:bg-slate-50 dark:bg-slate-900 dark:group-hover:bg-slate-800/60">
                        <Insignia tone={row.active ? 'success' : 'neutral'}>
                          {row.active ? <CircleCheck className="h-3 w-3" /> : <CircleX className="h-3 w-3" />}
                          {row.active ? 'Activo' : 'Inactivo'}
                        </Insignia>
                      </td>
                      <td className="sticky right-0 z-10 bg-white px-3 py-2.5 shadow-[-8px_0_8px_-8px_rgba(15,23,42,0.14)] group-hover:bg-slate-50 dark:bg-slate-900 dark:group-hover:bg-slate-800/60">
                        <div className="flex items-center justify-end gap-1">
                          <BotonIcono label="Ver historial operativo" onClick={() => navigate(`/history/schools/${row.id}`)}>
                            <History className="h-4 w-4" />
                          </BotonIcono>
                          <BotonIcono label="Ver ficha maestra" onClick={() => navigate(`/schools/${row.id}`)}>
                            <Eye className="h-4 w-4" />
                          </BotonIcono>
                          {canManage ? (
                            <Link to={`/schools/${row.id}`} aria-label="Editar">
                              <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800">
                                <Pencil className="h-4 w-4" />
                              </span>
                            </Link>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </DataTableContainer>

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
          </section>
        ) : null}
      </div>
    </DisenoApp>
  )
}
