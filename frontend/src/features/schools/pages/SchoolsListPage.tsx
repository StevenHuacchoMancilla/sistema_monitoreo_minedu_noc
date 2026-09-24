import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CircleCheck,
  CircleX,
  Eye,
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
} from 'lucide-react'
import { AppLayout } from '../../../layouts/AppLayout'
import { Button } from '../../../components/ui/Button'
import { IconButton } from '../../../components/ui/IconButton'
import { FilterCard } from '../../../components/ui/FilterCard'
import { FormField, Input, SearchField, Select } from '../../../components/ui/FormControls'
import { MetricCard } from '../../../components/ui/MetricCard'
import { MasterSourceBadge, PageHeader } from '../../../components/ui/PageHeader'
import { PaginationBar } from '../../../components/ui/PaginationBar'
import { Badge } from '../../../components/ui/SoftBadge'
import { TableSkeleton } from '../../../components/ui/TableSkeleton'
import { DataTableContainer, Truncate, tableClassName, tdClassName, thClassName, theadClassName, trClassName } from '../../../components/ui/DataTableFrame'
import { endpoints } from '../../../api/endpoints'
import { techBadgeClass } from '../../../lib/uiTokens'
import { LocationMismatchBadge } from '../../locations/components/LocationMismatchBadge'
import type { SchoolGeneralPayload } from '../types/school'

function formatCapacity(value: string | number | null | undefined): string {
  if (value == null || value === '') return '—'
  const raw = String(value).trim()
  if (/mbps/i.test(raw)) return raw
  return `${raw} Mbps`
}

export function SchoolsListPage() {
  const client = useQueryClient()
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [provincia, setProvincia] = useState('')
  const [distrito, setDistrito] = useState('')
  const [tecnologia, setTecnologia] = useState('')
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
    queryKey: ['schools', 'list', q, provincia, distrito, tecnologia, active, page, perPage],
    queryFn: () =>
      endpoints.schools({
        q: q || undefined,
        provincia: provincia || undefined,
        distrito: distrito || undefined,
        tecnologia: tecnologia || undefined,
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
    setActive('1')
    setPage(1)
  }

  const hasFilters = Boolean(q || provincia || distrito || tecnologia || active !== '1')

  return (
    <AppLayout bare>
      <div className="min-w-0 space-y-6">
        <PageHeader
          icon={<GraduationCap className="h-5 w-5" aria-hidden />}
          title="Locales educativos"
          description="Administra información maestra, red y contactos de los locales."
          badges={<MasterSourceBadge />}
          breadcrumb={
            <p className="text-xs font-medium text-slate-500">
              NOC Loreto <span className="text-slate-300">/</span> Locales educativos
            </p>
          }
          actions={
            <Button type="button" variant="primary" onClick={() => setShowCreate((v) => !v)}>
              <Plus className="h-4 w-4" aria-hidden />
              Nuevo local
            </Button>
          }
        />

        <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            icon={<GraduationCap className="h-5 w-5" />}
            label="Total locales"
            value={stats?.total ?? meta?.total ?? '—'}
            tone="info"
          />
          <MetricCard
            icon={<Network className="h-5 w-5" />}
            label="Con CID"
            value={stats?.with_cid ?? '—'}
            tone="cyan"
          />
          <MetricCard
            icon={<WifiOff className="h-5 w-5" />}
            label="Sin CID"
            value={stats?.without_cid ?? '—'}
            tone="warning"
          />
          <MetricCard
            icon={<CircleCheck className="h-5 w-5" />}
            label="Activos"
            value={stats?.active ?? '—'}
            tone="success"
          />
        </div>

        <FilterCard
          actions={
            <Button type="button" size="sm" onClick={clearFilters} disabled={!hasFilters}>
              <RotateCcw className="h-3.5 w-3.5" aria-hidden />
              Limpiar
            </Button>
          }
        >
          <SearchField
            className="min-w-0 sm:col-span-2 xl:col-span-2"
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
              setPage(1)
            }}
            placeholder="Buscar por CID, código local, modular o nombre..."
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
                <option key={p} value={p}>{p}</option>
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
                <option key={d} value={d}>{d}</option>
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
                <option key={t} value={t}>{t}</option>
              ))}
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
        </FilterCard>

        {showCreate ? (
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-slate-50">Crear local educativo</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {(
                [
                  ['codigo_local', 'Código local *'],
                  ['local_educativo', 'Local educativo *'],
                  ['codigo_modular', 'Código modular'],
                  ['provincia', 'Provincia'],
                  ['distrito', 'Distrito'],
                  ['cid', 'CID inicial'],
                  ['tecnologia_acceso', 'Tecnología'],
                  ['nodo_pop', 'Nodo/POP'],
                  ['prtg_device_name', 'Presentación PRTG'],
                ] as const
              ).map(([key, label]) => (
                <FormField key={key} label={label}>
                  <Input
                    value={(form[key] as string | undefined) ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                  />
                </FormField>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                type="button"
                variant="primary"
                loading={create.isPending}
                disabled={!form.codigo_local || !form.local_educativo}
                onClick={() => create.mutate()}
              >
                Crear local
              </Button>
              <Button type="button" onClick={() => setShowCreate(false)}>
                Cancelar
              </Button>
              {create.isError ? (
                <span className="self-center text-sm font-semibold text-red-600">No se pudo crear el local</span>
              ) : null}
            </div>
          </section>
        ) : null}

        {list.isLoading ? <TableSkeleton rows={10} cols={8} /> : null}

        {list.isError ? (
          <section className="rounded-xl border border-red-200 bg-red-50 p-6 text-center dark:border-red-900 dark:bg-red-950/40">
            <TriangleAlert className="mx-auto h-8 w-8 text-red-600" />
            <p className="mt-2 text-sm font-semibold text-red-800">No pudimos cargar los locales educativos.</p>
            <Button type="button" className="mt-3" onClick={() => void list.refetch()}>
              Reintentar
            </Button>
          </section>
        ) : null}

        {!list.isLoading && !list.isError && rows.length === 0 ? (
          <section className="rounded-xl border border-slate-200 bg-white px-6 py-12 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <SearchX className="mx-auto h-10 w-10 text-slate-400" />
            <p className="mt-3 text-base font-semibold text-slate-900 dark:text-slate-50">No se encontraron locales educativos.</p>
            <p className="mt-1 text-sm text-slate-500">Prueba modificando los filtros de búsqueda.</p>
            <Button type="button" className="mt-4" onClick={clearFilters}>
              Limpiar filtros
            </Button>
          </section>
        ) : null}

        {!list.isLoading && rows.length > 0 && meta ? (
          <section className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 sm:px-5 sm:py-4 dark:border-slate-800">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">Locales educativos</h2>
                <p className="text-sm font-medium text-slate-500">
                  {meta.total.toLocaleString('es-PE')} registros
                  <span className="ml-2 hidden text-xs text-slate-400 sm:inline">
                    · desliza horizontalmente para ver más columnas
                  </span>
                </p>
              </div>
            </div>

            <DataTableContainer>
              <table className={`${tableClassName} table-fixed`} style={{ minWidth: 780 }}>
                <thead className={theadClassName}>
                  <tr>
                    <th className={`${thClassName} w-[3.5rem]`}>N°</th>
                    <th className={`${thClassName} w-[5.5rem]`}>CID</th>
                    <th className={`${thClassName} hidden md:table-cell w-[6rem]`}>Cód. local</th>
                    <th className={`${thClassName} hidden xl:table-cell w-[6rem]`}>Modular</th>
                    <th className={thClassName}>Local educativo</th>
                    <th className={`${thClassName} hidden lg:table-cell w-[8rem]`}>Provincia</th>
                    <th className={`${thClassName} hidden xl:table-cell w-[8rem]`}>Distrito</th>
                    <th className={`${thClassName} hidden md:table-cell w-[6.5rem]`}>Tecnología</th>
                    <th className={`${thClassName} hidden xl:table-cell w-[5.5rem]`}>Capacidad</th>
                    <th className={`${thClassName} hidden xl:table-cell w-[7rem]`}>Nodo/POP</th>
                    <th className={`${thClassName} sticky right-[7.25rem] z-20 w-[6.5rem] bg-slate-50 shadow-[-8px_0_8px_-8px_rgba(15,23,42,0.12)] dark:bg-slate-900`}>
                      Estado
                    </th>
                    <th className={`${thClassName} sticky right-0 z-20 w-[7.25rem] bg-slate-50 text-right shadow-[-8px_0_8px_-8px_rgba(15,23,42,0.18)] dark:bg-slate-900`}>
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className={`${trClassName} group h-12`}>
                      <td className={`${tdClassName} font-medium tabular-nums text-slate-500`}>{row.n ?? '—'}</td>
                      <td className={`${tdClassName} font-mono text-xs font-semibold tabular-nums text-slate-900 dark:text-slate-100`}>
                        {row.cid ?? '—'}
                      </td>
                      <td className={`${tdClassName} hidden md:table-cell font-mono text-xs text-slate-600`}>
                        {row.codigo_local ?? '—'}
                      </td>
                      <td className={`${tdClassName} hidden xl:table-cell font-mono text-xs text-slate-600`}>
                        {row.codigo_modular ?? '—'}
                      </td>
                      <td className={tdClassName}>
                        <Truncate title={row.local_educativo} className="font-medium text-slate-900 dark:text-slate-100">
                          {row.local_educativo}
                        </Truncate>
                      </td>
                      <td className={`${tdClassName} hidden lg:table-cell`}>
                        <div className="flex min-w-0 flex-col gap-1">
                          <Truncate title={row.provincia}>{row.provincia ?? '—'}</Truncate>
                          <LocationMismatchBadge
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
                        </div>
                      </td>
                      <td className={`${tdClassName} hidden xl:table-cell`}>{row.distrito ?? '—'}</td>
                      <td className={`${tdClassName} hidden md:table-cell`}>
                        {row.tecnologia ? (
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${techBadgeClass(row.tecnologia)}`}>
                            {row.tecnologia}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className={`${tdClassName} hidden xl:table-cell tabular-nums`}>
                        {formatCapacity(row.capacidad_mbps)}
                      </td>
                      <td className={`${tdClassName} hidden xl:table-cell`}>
                        <span className="inline-flex max-w-full items-center gap-1" title={row.nodo_pop ?? undefined}>
                          {row.nodo_pop ? <Server className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden /> : null}
                          <Truncate title={row.nodo_pop}>{row.nodo_pop ?? '—'}</Truncate>
                        </span>
                      </td>
                      <td className="sticky right-[7.25rem] z-10 bg-white px-3 py-2.5 shadow-[-8px_0_8px_-8px_rgba(15,23,42,0.08)] group-hover:bg-slate-50 dark:bg-slate-900 dark:group-hover:bg-slate-800/60">
                        <Badge tone={row.active ? 'success' : 'neutral'}>
                          {row.active ? <CircleCheck className="h-3 w-3" /> : <CircleX className="h-3 w-3" />}
                          {row.active ? 'Activo' : 'Inactivo'}
                        </Badge>
                      </td>
                      <td className="sticky right-0 z-10 bg-white px-3 py-2.5 shadow-[-8px_0_8px_-8px_rgba(15,23,42,0.14)] group-hover:bg-slate-50 dark:bg-slate-900 dark:group-hover:bg-slate-800/60">
                        <div className="flex items-center justify-end gap-1">
                          <IconButton
                            label="Ver historial operativo"
                            onClick={() => navigate(`/history/schools/${row.id}`)}
                          >
                            <History className="h-4 w-4" />
                          </IconButton>
                          <IconButton label="Ver ficha maestra" onClick={() => navigate(`/schools/${row.id}`)}>
                            <Eye className="h-4 w-4" />
                          </IconButton>
                          <Link to={`/schools/${row.id}`} aria-label="Editar">
                            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800">
                              <Pencil className="h-4 w-4" />
                            </span>
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </DataTableContainer>

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
          </section>
        ) : null}
      </div>
    </AppLayout>
  )
}
