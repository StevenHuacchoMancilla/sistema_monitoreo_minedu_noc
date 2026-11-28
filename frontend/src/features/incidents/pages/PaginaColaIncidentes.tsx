import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertOctagon,
  CircleCheck,
  CircleX,
  Eye,
  FileText,
  History,
  Hourglass,
  ImageDown,
  Images,
  ListFilter,
  MessageSquareText,
  RefreshCw,
  ScrollText,
  SquarePen,
  Ticket,
  Trash2,
  Undo2,
} from 'lucide-react'
import { descargarReporteServicioPng } from '../lib/descargarReporteServicioPng'
import { DisenoApp } from '../../../layouts/DisenoApp'
import { EncabezadoPagina } from '../../../components/ui/EncabezadoPagina'
import { SectionCard } from '../../../components/ui/Tarjeta'
import { Boton } from '../../../components/ui/Boton'
import { DialogoConfirmar } from '../../../components/ui/DialogoConfirmar'
import { BotonIcono } from '../../../components/ui/BotonIcono'
import { EmptyState, ErrorState, LoadingState } from '../../../components/ui/Estados'
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
import { FollowupBadge } from '../../../components/monitoring/InsigniasEstado'
import { InsigniaEnergia } from '../../../components/monitoring/InsigniaEnergia'
import { Insignia } from '../../../components/ui/InsigniaSuave'
import { CamposFiltroUbicacionPrtg } from '../../locations/components/CamposFiltroUbicacionPrtg'
import { endpoints } from '../../../api/endpoints'
import { useAuth } from '../../auth/context/ContextoAuth'
import { incidentCaseFilePath } from '../../history/api/apiHistorial'
import { ModalGestionIncidente } from '../components/ModalGestionIncidente'
import {
  PanelComentariosIncidente,
  type ComentariosPanelState,
} from '../components/PanelComentariosIncidente'
import { ModalGenerarTicket } from '../components/ModalGenerarTicket'
import { downloadTicketImageFromIncidentId } from '../lib/imagenTicket'
import { LISTA_ESTADO_BADGE } from '../../reports/types/reporteOperativo'

type GravesTab = 'open' | 'closed'

function matchesCidOrTss(row: { cid?: string | null; tss?: number | string | null }, raw: string): boolean {
  const needle = raw.trim().toLowerCase()
  if (!needle) return true
  const digits = needle.replace(/\D+/g, '')
  const cid = String(row.cid ?? '').toLowerCase()
  if (cid && (cid.includes(needle) || (digits && cid.includes(digits)))) return true
  const tss = row.tss == null || row.tss === '' ? '' : String(row.tss)
  if (!tss) return false
  if (digits && Number(tss) === Number(digits)) return true
  return tss.toLowerCase().includes(needle) || (digits !== '' && tss.includes(digits))
}

function energyBucket(energy?: string | null): 'RED' | 'PANEL' | 'OTHER' | 'NONE' {
  const value = (energy ?? '').trim().toUpperCase()
  if (!value) return 'NONE'
  if (value.includes('PANEL') || value.includes('SOLAR')) return 'PANEL'
  if (value.includes('RED')) return 'RED'
  return 'OTHER'
}

function uniqueSorted(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map((v) => (v ?? '').trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'es', { sensitivity: 'base' }),
  )
}

type QueueKind = 'pendiente-cierre' | 'graves' | 'requerimientos' | 'enlace-parcial'

type QueueRow = {
  incident_id: number
  school_id?: number | null
  cid?: string | null
  tss?: number | string | null
  local_educativo?: string | null
  codigo_local?: string | null
  energy_type?: string | null
  nodo_pop?: string | null
  provincia?: string | null
  distrito?: string | null
  tecnologia?: string | null
  followup_status?: string | null
  gestion_lista?: boolean
  lista_llee_estado?: string | null
  root_cause_code?: string | null
  root_cause_label?: string | null
  started_at?: string | null
  current_down_started_at?: string | null
  recovered_at?: string | null
  recuperada_en?: string | null
  grave_opened_at?: string | null
  grave_closed_at?: string | null
  attachments_count?: number | null
  requirement_opened_at?: string | null
  responsible_area?: string | null
  ticket_code?: string | null
  has_ticket?: boolean
  tracking?: { id: number; ticket: string | null; status_label: string | null } | null
}

const META: Record<
  QueueKind,
  {
    title: string
    description: string
    fetcher: (opts?: { gravesTab?: GravesTab }) => Promise<{
      data: QueueRow[]
      filters?: { nodos: string[]; tecnologias: string[]; energias: string[] }
    }>
  }
> = {
  'pendiente-cierre': {
    title: 'Pendiente de cierre',
    description:
      'Caídas recuperadas a cualquier hora (monitoreo 24h). Al elegir Caída de enlace / Queja pasan a Incidencias; Requerimiento a Requerimientos. Comentario sin resultado queda aquí («Gestión lista»). También puedes cerrar el ticket.',
    fetcher: () =>
      endpoints.incidentsPendienteCierre() as Promise<{
        data: QueueRow[]
        filters?: { nodos: string[]; tecnologias: string[]; energias: string[] }
      }>,
  },
  graves: {
    title: 'Incidencias',
    description:
      'Casos marcados como incidencia. Si el colegio cae otra vez aparece en Caídas totales con la etiqueta «En incidencia».',
    fetcher: ({ gravesTab } = {}) =>
      endpoints.incidentsGraves({ status: gravesTab === 'closed' ? 'closed' : 'open' }) as Promise<{
        data: QueueRow[]
      }>,
  },
  requerimientos: {
    title: 'Requerimientos',
    description:
      'Casos especiales (p. ej. cambio de contraseña) que quedan en esta cola hasta cierre manual. Una caída PRTG nueva genera otro ticket aparte; en Caídas totales verás el aviso «Tiene N requerimientos».',
    fetcher: () => endpoints.incidentsRequerimientos() as Promise<{ data: QueueRow[] }>,
  },
  'enlace-parcial': {
    title: 'Enlace parcial',
    description:
      'Un enlace WAN caído con Ping OPERATIVO (doble WAN / P2P). No entran a Pendientes ni En gestión. Quedan abiertos hasta cierre manual; si el colegio cae por PRTG se genera un ticket nuevo aparte.',
    fetcher: () => endpoints.incidentsEnlaceParcial() as Promise<{ data: QueueRow[] }>,
  },
}

const queueTd = `${tdClassName} !align-top`
const idTd =
  'whitespace-nowrap px-2.5 py-2 !align-top text-[13px] leading-snug text-slate-700 dark:text-slate-300'
const actionTd =
  'sticky right-0 z-10 overflow-hidden bg-white px-2 py-2 !align-top text-right shadow-[-8px_0_8px_-8px_rgba(15,23,42,0.12)] group-hover:bg-slate-50 dark:bg-slate-900 dark:group-hover:bg-slate-800/60'

const gravesTh =
  'px-3 py-2.5 text-left text-[10.5px] font-semibold tracking-[0.08em] whitespace-nowrap text-slate-500 uppercase dark:text-slate-400'
const gravesTd =
  'min-w-0 px-3 py-3 align-top text-[13px] leading-snug text-slate-700 dark:text-slate-300'
const gravesIdTd =
  'whitespace-nowrap px-3 py-3 align-top text-[13px] leading-snug text-slate-700 dark:text-slate-300'
const gravesActionTd =
  'sticky right-0 z-10 overflow-hidden bg-white/95 px-3 py-3 align-top text-right shadow-[-10px_0_12px_-10px_rgba(15,23,42,0.14)] backdrop-blur group-hover:bg-blue-50/70 dark:bg-slate-900/95 dark:group-hover:bg-slate-800/80'

export function PaginaColaIncidentes({ kind }: { kind: QueueKind }) {
  const meta = META[kind]
  const { user } = useAuth()
  const canManage = Boolean(user?.permissions?.includes('incidents.manage'))
  const client = useQueryClient()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [manageId, setManageId] = useState<number | null>(null)
  const [comentariosPanel, setComentariosPanel] = useState<ComentariosPanelState | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [bulkIds, setBulkIds] = useState<number[] | null>(null)
  const [bulkCloseOpen, setBulkCloseOpen] = useState(false)
  const [bulkListaActivo, setBulkListaActivo] = useState(true)
  const [bulkClosing, setBulkClosing] = useState(false)
  const [reportBusy, setReportBusy] = useState(false)
  const [ticketRow, setTicketRow] = useState<QueueRow | null>(null)
  const [pngBusyId, setPngBusyId] = useState<number | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [closeRow, setCloseRow] = useState<QueueRow | null>(null)
  const [closing, setClosing] = useState(false)
  const [keepRow, setKeepRow] = useState<QueueRow | null>(null)
  const [keeping, setKeeping] = useState(false)
  const [closeQueueRow, setCloseQueueRow] = useState<QueueRow | null>(null)
  const [closingQueue, setClosingQueue] = useState(false)
  const [deleteReqRow, setDeleteReqRow] = useState<QueueRow | null>(null)
  const [deletingReq, setDeletingReq] = useState(false)

  const [search, setSearch] = useState('')
  const [nodoPop, setNodoPop] = useState('')
  const [energy, setEnergy] = useState('')
  const [provincia, setProvincia] = useState('')
  const [distrito, setDistrito] = useState('')
  const [tecnologia, setTecnologia] = useState('')
  const [estadoCola, setEstadoCola] = useState('')
  const [gravesTab, setGravesTab] = useState<GravesTab>(() =>
    kind === 'graves' && searchParams.get('tab') === 'cerradas' ? 'closed' : 'open',
  )
  const showingClosedGraves = kind === 'graves' && gravesTab === 'closed'
  const isGraves = kind === 'graves'
  const isPendienteCierre = kind === 'pendiente-cierre'
  const isPolished = isGraves || isPendienteCierre
  const showEnergyCol = isPendienteCierre || isGraves
  const showQueueFilters = isPendienteCierre

  useEffect(() => {
    setSelectedIds(new Set())
    setBulkIds(null)
    setBulkCloseOpen(false)
    setSearch('')
    setNodoPop('')
    setEnergy('')
    setProvincia('')
    setDistrito('')
    setTecnologia('')
    setEstadoCola('')
  }, [kind])

  useEffect(() => {
    if (kind !== 'graves') return
    const next = gravesTab === 'closed' ? 'cerradas' : null
    const current = searchParams.get('tab')
    if (next && current !== next) {
      setSearchParams({ tab: next }, { replace: true })
    } else if (!next && current) {
      setSearchParams({}, { replace: true })
    }
  }, [kind, gravesTab, searchParams, setSearchParams])

  const query = useQuery({
    queryKey: ['incidents', 'queue', kind, kind === 'graves' ? gravesTab : 'default'],
    queryFn: () => meta.fetcher({ gravesTab }),
    refetchInterval: 60_000,
    staleTime: 30_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
  })

  const allRows = useMemo(() => query.data?.data ?? [], [query.data])
  const catalogFilters = query.data?.filters
  const nodoOptions = useMemo(
    () => uniqueSorted([...(catalogFilters?.nodos ?? []), ...allRows.map((row) => row.nodo_pop)]),
    [catalogFilters?.nodos, allRows],
  )
  const tecnologiaOptions = useMemo(
    () => uniqueSorted([...(catalogFilters?.tecnologias ?? []), ...allRows.map((row) => row.tecnologia)]),
    [catalogFilters?.tecnologias, allRows],
  )
  const energyOptions = useMemo(() => {
    const labels = uniqueSorted([
      'RED pública',
      'PANEL SOLAR',
      ...(catalogFilters?.energias ?? []),
      ...allRows.map((row) => row.energy_type),
    ])
    const options: Array<{ value: string; label: string }> = []
    const seen = new Set<string>()
    for (const label of labels) {
      const bucket = energyBucket(label)
      if (bucket === 'NONE' || seen.has(bucket)) continue
      seen.add(bucket)
      options.push({
        value: bucket,
        label: bucket === 'RED' ? 'Red pública' : bucket === 'PANEL' ? 'Panel solar' : label,
      })
    }
    options.push({ value: 'NONE', label: 'Sin energía' })
    return options
  }, [catalogFilters?.energias, allRows])

  const rows = useMemo(() => {
    return allRows.filter((row) => {
      if (!matchesCidOrTss(row, search)) return false
      if (!showQueueFilters) return true
      if (nodoPop && (row.nodo_pop ?? '').trim().toUpperCase() !== nodoPop.toUpperCase()) return false
      if (energy && energyBucket(row.energy_type) !== energy) return false
      if (provincia && (row.provincia ?? '').toUpperCase() !== provincia.toUpperCase()) return false
      if (distrito && (row.distrito ?? '').toUpperCase() !== distrito.toUpperCase()) return false
      if (tecnologia && (row.tecnologia ?? '').toUpperCase() !== tecnologia.toUpperCase()) return false
      if (estadoCola === 'gestion_lista' && !row.gestion_lista) return false
      if (estadoCola === 'pendiente' && row.gestion_lista) return false
      return true
    })
  }, [allRows, search, showQueueFilters, nodoPop, energy, provincia, distrito, tecnologia, estadoCola])

  const hasQueueFilters = Boolean(
    search.trim() || nodoPop || energy || provincia || distrito || tecnologia || estadoCola,
  )
  const hasGravesSearch = Boolean(search.trim())

  const energyStats = useMemo(() => {
    let red = 0
    let panel = 0
    let other = 0
    let none = 0
    for (const row of allRows) {
      const bucket = energyBucket(row.energy_type)
      if (bucket === 'RED') red += 1
      else if (bucket === 'PANEL') panel += 1
      else if (bucket === 'OTHER') other += 1
      else none += 1
    }
    return { red, panel, other, none }
  }, [allRows])

  const pendienteStats = useMemo(() => {
    let lista = 0
    for (const row of allRows) {
      if (row.gestion_lista) lista += 1
    }
    return { lista, pendiente: Math.max(0, allRows.length - lista) }
  }, [allRows])

  const clearQueueFilters = () => {
    setSearch('')
    setNodoPop('')
    setEnergy('')
    setProvincia('')
    setDistrito('')
    setTecnologia('')
    setEstadoCola('')
  }

  const canSelectMany = kind === 'pendiente-cierre' && canManage
  const visibleIds = rows.map((row) => row.incident_id)
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id))
  const selectedRows = allRows.filter((row) => selectedIds.has(row.incident_id))
  const selectedWithGestion = selectedRows.filter((row) => row.gestion_lista).length

  const refresh = () => {
    void client.invalidateQueries({ queryKey: ['incidents', 'queue', kind], refetchType: 'active' })
    void client.invalidateQueries({ queryKey: ['dashboard'], refetchType: 'active' })
  }

  const markedLabel = showingClosedGraves
    ? 'Cerrada'
    : kind === 'graves' || kind === 'requerimientos'
      ? 'Marcada'
      : 'Recuperada'

  const pageTitle = showingClosedGraves ? 'Incidencias cerradas' : meta.title
  const pageDescription = showingClosedGraves
    ? 'Registro de incidencias ya cerradas. Abre el expediente para ver gestiones y las fotos de evidencia.'
    : meta.description

  const thCell = isPolished ? gravesTh : thClassName
  const tdCell = isPolished ? gravesTd : queueTd
  const tdIdCell = isPolished ? gravesIdTd : idTd
  const tdActionCell = isPolished ? gravesActionTd : actionTd
  const recordsLabel = `${rows.length} registro${rows.length === 1 ? '' : 's'}${
    (hasQueueFilters || hasGravesSearch) && rows.length !== allRows.length ? ` de ${allRows.length}` : ''
  }`

  return (
    <DisenoApp bare title={pageTitle}>
      {isGraves ? (
        <div className="mb-5 space-y-4">
          <section className="rounded-md border border-noc-border bg-noc-surface">
            <div className="flex flex-col gap-4 p-5 md:flex-row md:items-start md:justify-between md:p-6">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold tracking-[0.14em] text-slate-500 uppercase">
                  Operación · cola grave
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-2.5">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-noc-raised text-noc-faint">
                    {showingClosedGraves ? (
                      <CircleCheck className="h-5 w-5" aria-hidden />
                    ) : (
                      <AlertOctagon className="h-5 w-5" aria-hidden />
                    )}
                  </span>
                  <h1 className="text-2xl font-bold tracking-tight text-slate-950 dark:text-slate-50">
                    {pageTitle}
                  </h1>
                  <Insignia tone={showingClosedGraves ? 'success' : 'danger'}>
                    {allRows.length} {showingClosedGraves ? 'cerrada' : 'activa'}
                    {allRows.length === 1 ? '' : 's'}
                  </Insignia>
                </div>
                <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-slate-600 dark:text-slate-300">
                  {pageDescription}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <Boton type="button" variant="secondary" size="sm" onClick={() => void query.refetch()}>
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                  Refrescar
                </Boton>
              </div>
            </div>
          </section>

          <div className="noc-card grid overflow-hidden rounded-xl border border-noc-border sm:grid-cols-2 xl:grid-cols-4">
            <GravesStatCard
              label="En esta vista"
              value={allRows.length}
              hint={showingClosedGraves ? 'Incidencias cerradas' : 'Incidencias abiertas'}
              tone={showingClosedGraves ? 'success' : 'danger'}
            />
            <GravesStatCard label="Red pública" value={energyStats.red} hint="Colegios con red" tone="emerald" />
            <GravesStatCard label="Panel solar" value={energyStats.panel} hint="Colegios con panel" tone="amber" />
            <GravesStatCard
              label="Sin energía"
              value={energyStats.none + energyStats.other}
              hint="Sin dato o otro tipo"
              tone="neutral"
            />
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => {
                setGravesTab('open')
                setSearch('')
              }}
              className={`rounded-md border px-4 py-3 text-left transition duration-150 ${
                gravesTab === 'open'
                  ? 'border-noc-copper bg-noc-interactive text-noc-text'
                  : 'border-noc-border bg-noc-surface text-noc-muted hover:bg-noc-raised'
              }`}
            >
              <span className={`block text-[12px] font-semibold ${gravesTab === 'open' ? 'opacity-90' : 'text-slate-600 dark:text-slate-300'}`}>
                Incidencias
              </span>
              <span className={`mt-1 block text-[13px] ${gravesTab === 'open' ? 'opacity-80' : 'text-slate-500'}`}>
                Casos marcados como incidencia grave
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                setGravesTab('closed')
                setSearch('')
              }}
              className={`rounded-md border px-4 py-3 text-left transition duration-150 ${
                gravesTab === 'closed'
                  ? 'border-noc-copper bg-noc-interactive text-noc-text'
                  : 'border-noc-border bg-noc-surface text-noc-muted hover:bg-noc-raised'
              }`}
            >
              <span className={`block text-[12px] font-semibold ${gravesTab === 'closed' ? 'opacity-90' : 'text-slate-600 dark:text-slate-300'}`}>
                Incidencias cerradas
              </span>
              <span className={`mt-1 block text-[13px] ${gravesTab === 'closed' ? 'opacity-80' : 'text-slate-500'}`}>
                Historial con gestiones y evidencias
              </span>
            </button>
          </div>

          <section className="rounded-md border border-noc-border bg-noc-surface p-3 md:p-4">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-50">
                  <ListFilter className="h-4 w-4 text-slate-500" aria-hidden />
                  Filtros
                </h2>
                <p className="mt-0.5 text-[12px] text-slate-500">Busca por CID o TSS en {pageTitle.toLowerCase()}</p>
              </div>
              <Boton type="button" size="sm" variant="ghost" disabled={!hasGravesSearch} onClick={() => setSearch('')}>
                Limpiar
              </Boton>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <SearchField
                className="sm:col-span-2"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="CID o TSS"
              />
            </div>
          </section>
        </div>
      ) : isPendienteCierre ? (
        <div className="mb-5 space-y-4">
          <section className="rounded-md border border-noc-border bg-noc-surface">
            <div className="flex flex-col gap-4 p-4 sm:p-5 md:flex-row md:items-start md:justify-between md:p-6">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold tracking-[0.14em] text-slate-500 uppercase">
                  Operación · recuperación
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-2.5">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-noc-raised text-noc-faint">
                    <Hourglass className="h-5 w-5" aria-hidden />
                  </span>
                  <h1 className="text-xl font-bold tracking-tight text-slate-950 sm:text-2xl dark:text-slate-50">
                    {pageTitle}
                  </h1>
                  <Insignia tone="warning">
                    {allRows.length} {allRows.length === 1 ? 'ticket' : 'tickets'}
                  </Insignia>
                </div>
                <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-slate-600 sm:text-[14px] dark:text-slate-300">
                  {pageDescription}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <Boton type="button" variant="secondary" size="sm" onClick={() => navigate('/incidents/managing')}>
                  Ir a En gestión
                </Boton>
                <Boton type="button" variant="secondary" size="sm" onClick={() => void query.refetch()}>
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                  Refrescar
                </Boton>
              </div>
            </div>
          </section>

          <div className="noc-card grid overflow-hidden rounded-xl border border-noc-border sm:grid-cols-2 xl:grid-cols-4">
            <GravesStatCard label="En esta cola" value={allRows.length} hint="Pendientes de cierre" tone="amber" />
            <GravesStatCard
              label="Gestión lista"
              value={pendienteStats.lista}
              hint="Listos para cerrar"
              tone="success"
            />
            <GravesStatCard
              label="Sin cerrar aún"
              value={pendienteStats.pendiente}
              hint="Falta gestión o cierre"
              tone="neutral"
            />
            <GravesStatCard label="Panel solar" value={energyStats.panel} hint="Colegios con panel" tone="amber" />
          </div>

          <section className="rounded-md border border-noc-border bg-noc-surface p-3 md:p-4">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-50">
                  <ListFilter className="h-4 w-4 text-slate-500" aria-hidden />
                  Filtros
                </h2>
                <p className="mt-0.5 text-[12px] text-slate-500">
                  Busca por CID/TSS o acota por nodo, energía, ubicación y estado
                </p>
              </div>
              <Boton type="button" size="sm" variant="ghost" disabled={!hasQueueFilters} onClick={clearQueueFilters}>
                Limpiar
              </Boton>
            </div>
            <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6">
              <SearchField
                className="sm:col-span-2"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="CID o TSS"
              />
              <FormField label="Nodo / POP">
                <Select value={nodoPop} onChange={(e) => setNodoPop(e.target.value)}>
                  <option value="">Todos</option>
                  {nodoOptions.map((nodo) => (
                    <option key={nodo} value={nodo}>
                      {nodo}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label="Tipo de energía">
                <Select value={energy} onChange={(e) => setEnergy(e.target.value)}>
                  <option value="">Todas</option>
                  {energyOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </Select>
              </FormField>
              <CamposFiltroUbicacionPrtg
                province={provincia}
                district={distrito}
                onProvinceChange={setProvincia}
                onDistrictChange={setDistrito}
              />
              <FormField label="Tecnología">
                <Select value={tecnologia} onChange={(e) => setTecnologia(e.target.value)}>
                  <option value="">Todas</option>
                  {tecnologiaOptions.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label="Estado">
                <Select value={estadoCola} onChange={(e) => setEstadoCola(e.target.value)}>
                  <option value="">Todos</option>
                  <option value="gestion_lista">Gestión lista</option>
                  <option value="pendiente">Pendiente de cierre</option>
                </Select>
              </FormField>
            </div>
          </section>
        </div>
      ) : (
        <>
          <EncabezadoPagina
            title={pageTitle}
            description={pageDescription}
            actions={
              <div className="flex flex-wrap items-center gap-2">
                <Boton variant="secondary" onClick={() => void query.refetch()}>
                  Refrescar
                </Boton>
              </div>
            }
          />

          <div className="mb-4">
            <TarjetaFiltro>
              <SearchField
                className="sm:col-span-2 xl:col-span-2"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="CID o TSS"
              />
            </TarjetaFiltro>
          </div>
        </>
      )}

      {(() => {
        const listBody = (
          <>
        {query.isLoading ? <LoadingState /> : null}
        {query.isError ? (
          <ErrorState message={query.error instanceof Error ? query.error.message : 'Error'} />
        ) : null}
        {!query.isLoading && !query.isError && allRows.length === 0 ? (
          <EmptyState
            title="Sin registros"
            description={
              kind === 'pendiente-cierre'
                ? 'No hay tickets pendientes de cierre. El seguimiento activo está en En gestión.'
                : showingClosedGraves
                  ? 'Aún no hay incidencias cerradas en el registro.'
                  : 'No hay elementos en esta cola.'
            }
          />
        ) : null}
        {!query.isLoading && !query.isError && allRows.length > 0 && rows.length === 0 ? (
          <EmptyState title="Sin coincidencias" description="Ningún registro coincide con CID o TSS." />
        ) : null}

        {actionError ? <p className="mb-3 text-sm text-red-600">{actionError}</p> : null}

        {canSelectMany && rows.length > 0 ? (
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="text-[13px] font-medium text-slate-600 dark:text-slate-300">
              {selectedIds.size} seleccionados
            </span>
            <Boton
              type="button"
              variant="primary"
              size="sm"
              disabled={selectedIds.size === 0}
              onClick={() => {
                const ids = selectedRows.map((row) => row.incident_id)
                if (ids.length === 1) {
                  setManageId(ids[0])
                  return
                }
                setBulkIds(ids)
              }}
            >
              Gestionar selección
            </Boton>
            <Boton
              type="button"
              variant="danger"
              size="sm"
              disabled={selectedIds.size === 0 || bulkClosing}
              onClick={() => {
                setBulkListaActivo(true)
                setBulkCloseOpen(true)
              }}
            >
              Cerrar selección
            </Boton>
            {kind === 'pendiente-cierre' ? (
              <Boton
                type="button"
                variant="secondary"
                size="sm"
                disabled={selectedIds.size === 0 || reportBusy}
                loading={reportBusy}
                onClick={() => {
                  setActionError(null)
                  setReportBusy(true)
                  void descargarReporteServicioPng({
                    kind: 'restablecido',
                    responsable: user?.name ?? 'NOC',
                    rows: selectedRows.map((row) => ({
                      cid: row.cid ?? null,
                      tss: row.tss == null || row.tss === '' ? null : String(row.tss),
                      codigoLocal: row.codigo_local ?? null,
                      nodoPop: row.nodo_pop ?? null,
                      caidaIso: row.current_down_started_at ?? row.started_at ?? null,
                      restablecidoIso: row.recuperada_en ?? row.recovered_at ?? null,
                      causaRaiz: row.root_cause_label ?? row.root_cause_code ?? null,
                    })),
                  })
                    .catch((err: unknown) =>
                      setActionError(err instanceof Error ? err.message : 'No se pudo generar el reporte de restablecimiento.'),
                    )
                    .finally(() => setReportBusy(false))
                }}
              >
                Imagen restablecido
              </Boton>
            ) : null}
            {selectedIds.size > 0 ? (
              <Boton type="button" variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
                Limpiar
              </Boton>
            ) : null}
          </div>
        ) : null}

        {rows.length > 0 ? (
          <DataTableContainer className={isPolished ? 'rounded-xl border-slate-200/80 shadow-none dark:border-slate-800' : ''}>
            <table
              className={`${tableClassName}${isPendienteCierre ? ' table-fixed' : ''}${isPolished ? ' min-w-[1080px]' : ''}`}
              style={isPendienteCierre ? { minWidth: canSelectMany ? 1280 : 1180 } : undefined}
            >
              {isPendienteCierre ? (
                <colgroup>
                  {canSelectMany ? <col className="w-10" /> : null}
                  <col className="w-[7.5rem]" />
                  <col className="w-[4.25rem]" />
                  <col className="w-[7.5rem]" />
                  <col />
                  <col className="w-[8.5rem]" />
                  <col className="w-[7.5rem]" />
                  <col className="w-[7.5rem]" />
                  <col className="w-[7rem]" />
                  <col className="w-[7rem]" />
                  <col className="w-[9.5rem]" />
                </colgroup>
              ) : isGraves ? (
                <colgroup>
                  <col className="w-[7.5rem]" />
                  <col className="w-[4.5rem]" />
                  <col className="w-[8rem]" />
                  <col />
                  <col className="w-[9rem]" />
                  <col className="w-[8.5rem]" />
                  <col className="w-[8rem]" />
                  <col className="w-[12rem]" />
                </colgroup>
              ) : null}
              <thead className={isPolished ? 'border-b border-slate-200 bg-slate-50/90 dark:border-slate-800 dark:bg-slate-950/50' : theadClassName}>
                <tr>
                  {canSelectMany ? (
                    <th className={thCell}>
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-300"
                        checked={allVisibleSelected}
                        onChange={() => {
                          setSelectedIds((prev) => {
                            const next = new Set(prev)
                            if (allVisibleSelected) {
                              visibleIds.forEach((id) => next.delete(id))
                            } else {
                              visibleIds.forEach((id) => next.add(id))
                            }
                            return next
                          })
                        }}
                        aria-label="Seleccionar los tickets visibles"
                      />
                    </th>
                  ) : null}
                  <th className={thCell}>CID</th>
                  <th className={thCell}>TSS</th>
                  {showEnergyCol ? (
                    <th className={thCell} title="Fuente de energía del colegio">
                      Tipo de energía
                    </th>
                  ) : null}
                  <th className={thCell}>Local</th>
                  <th className={thCell}>Ubicación</th>
                  {isPendienteCierre ? (
                    <th className={thCell} title="Nodo o POP del colegio">
                      Nodo/POP
                    </th>
                  ) : null}
                  <th className={thCell}>Estado</th>
                  {isPendienteCierre ? (
                    <th className={thCell} title="Inicio de la caída">
                      <span className="block">Caída</span>
                      <span className="block text-[10px] font-normal normal-case tracking-normal text-slate-400">
                        fecha · hora
                      </span>
                    </th>
                  ) : null}
                  <th className={thCell}>
                    {isPolished ? (
                      <>
                        <span className="block">{markedLabel}</span>
                        <span className="block text-[10px] font-normal normal-case tracking-normal text-slate-400">
                          fecha · hora
                        </span>
                      </>
                    ) : (
                      markedLabel
                    )}
                  </th>
                  <th className={`${thCell} ${isPolished ? 'sticky right-0 z-10 bg-slate-50/95 text-right dark:bg-slate-950/80' : 'text-right'}`}>
                    Acción
                  </th>
                </tr>
              </thead>
              <tbody className={isPolished ? 'divide-y divide-slate-100 dark:divide-slate-800/80' : undefined}>
                {rows.map((row) => {
                  const localSub = [row.ticket_code, row.codigo_local, row.tecnologia]
                    .filter(Boolean)
                    .join(' · ')
                  const hasTicket = Boolean(row.has_ticket || row.ticket_code)
                  const attachmentsCount = Number(row.attachments_count ?? 0)
                  const markedAt = showingClosedGraves
                    ? row.grave_closed_at ?? row.grave_opened_at ?? null
                    : kind === 'graves'
                      ? row.grave_opened_at ?? null
                      : kind === 'requerimientos'
                        ? row.requirement_opened_at ?? null
                        : isPendienteCierre
                          ? row.recuperada_en ?? row.recovered_at ?? null
                          : row.recovered_at ?? null

                  return (
                    <tr
                      key={row.incident_id}
                      className={
                        isPolished ? 'noc-row group' : `${trClassName} group`
                      }
                    >
                      {canSelectMany ? (
                        <td className={tdIdCell}>
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-slate-300"
                            checked={selectedIds.has(row.incident_id)}
                            onChange={() => {
                              setSelectedIds((prev) => {
                                const next = new Set(prev)
                                if (next.has(row.incident_id)) next.delete(row.incident_id)
                                else next.add(row.incident_id)
                                return next
                              })
                            }}
                            aria-label={`Seleccionar CID ${row.cid ?? row.incident_id}`}
                          />
                        </td>
                      ) : null}
                      <td className={`${tdIdCell} font-medium tabular-nums`}>{row.cid ?? '—'}</td>
                      <td className={`${tdIdCell} font-semibold tabular-nums text-slate-900 dark:text-slate-100`}>
                        {row.tss ?? '—'}
                      </td>
                      {showEnergyCol ? (
                        <td className={tdIdCell}>
                          <InsigniaEnergia energy={row.energy_type} size="sm" />
                        </td>
                      ) : null}
                      <td className={tdCell}>
                        <Truncate
                          title={row.local_educativo}
                          className="font-medium text-slate-900 dark:text-slate-100"
                        >
                          {row.local_educativo ?? '—'}
                        </Truncate>
                        <span
                          className="block truncate text-[11px] text-slate-500 dark:text-slate-400"
                          title={localSub || undefined}
                        >
                          {localSub || '—'}
                        </span>
                      </td>
                      <td className={tdCell}>
                        <Truncate title={row.provincia}>{row.provincia ?? '—'}</Truncate>
                        <Truncate
                          title={row.distrito}
                          className="text-[11px] text-slate-500 dark:text-slate-400"
                        >
                          {row.distrito ?? '—'}
                        </Truncate>
                      </td>
                      {isPendienteCierre ? (
                        <td className={tdCell}>
                          <Truncate title={row.nodo_pop ?? undefined}>{row.nodo_pop?.trim() || '—'}</Truncate>
                        </td>
                      ) : null}
                      <td className={tdCell}>
                        <div className="flex min-w-0 flex-col items-start gap-1">
                          {isPendienteCierre && row.gestion_lista ? (
                            <Insignia tone="success" title="Gestión guardada. Cierra el ticket cuando termines.">
                              Gestión lista
                            </Insignia>
                          ) : (
                            <FollowupBadge status={row.followup_status} />
                          )}
                          {isPendienteCierre && row.lista_llee_estado ? (
                            <span
                              className={`inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
                                LISTA_ESTADO_BADGE[row.lista_llee_estado] ??
                                'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
                              }`}
                              title="Opción Lista (igual que en En gestión / Lista para reporte)"
                            >
                              {row.lista_llee_estado}
                            </span>
                          ) : null}
                          {attachmentsCount > 0 ? (
                            <Insignia
                              tone="info"
                              title={`${attachmentsCount} evidencia${attachmentsCount === 1 ? '' : 's'} con foto`}
                            >
                              <span className="inline-flex items-center gap-1">
                                <Images className="h-3 w-3" aria-hidden />
                                {attachmentsCount}
                              </span>
                            </Insignia>
                          ) : null}
                        </div>
                      </td>
                      {isPendienteCierre ? (
                        <td className={isPolished ? gravesIdTd : `${tdDateClassName} !align-top`}>
                          <IsoDateTimeCell
                            value={row.current_down_started_at ?? row.started_at ?? null}
                          />
                        </td>
                      ) : null}
                      <td className={isPolished ? gravesIdTd : `${tdDateClassName} !align-top`}>
                        <IsoDateTimeCell value={markedAt} />
                      </td>
                      <td className={tdActionCell}>
                        <div className="inline-flex flex-nowrap items-center justify-end gap-1">
                          {isPendienteCierre ? (
                            <>
                              <BotonIcono
                                label="Ver detalle (todos los comentarios)"
                                onClick={() =>
                                  setComentariosPanel({
                                    incidentId: row.incident_id,
                                    kind: 'detalle',
                                    cid: row.cid,
                                    local: row.local_educativo,
                                    ticket: row.ticket_code,
                                  })
                                }
                                className="!size-8 text-sky-700 focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:outline-none dark:text-sky-300"
                              >
                                <MessageSquareText className="h-4 w-4" aria-hidden />
                              </BotonIcono>
                              <BotonIcono
                                label="Detalle de evento"
                                onClick={() =>
                                  setComentariosPanel({
                                    incidentId: row.incident_id,
                                    kind: 'evento',
                                    cid: row.cid,
                                    local: row.local_educativo,
                                    ticket: row.ticket_code,
                                  })
                                }
                                className="!size-8 text-violet-700 focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:outline-none dark:text-violet-300"
                              >
                                <ScrollText className="h-4 w-4" aria-hidden />
                              </BotonIcono>
                              <BotonIcono
                                label="Seguir caso"
                                onClick={() => setManageId(row.incident_id)}
                                className="!size-8 text-blue-700 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none dark:text-blue-300"
                              >
                                <SquarePen className="h-4 w-4" aria-hidden />
                              </BotonIcono>
                              {canManage ? (
                                <>
                                  <BotonIcono
                                    label="Mantener en gestión"
                                    onClick={() => setKeepRow(row)}
                                    className="!size-8 text-cyan-700 focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:outline-none dark:text-cyan-300"
                                  >
                                    <Undo2 className="h-4 w-4" aria-hidden />
                                  </BotonIcono>
                                  <BotonIcono
                                    label="Cerrar ticket"
                                    onClick={() => setCloseRow(row)}
                                    className="!size-8 text-red-600 focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:outline-none dark:text-red-400"
                                  >
                                    <CircleX className="h-4 w-4" aria-hidden />
                                  </BotonIcono>
                                </>
                              ) : null}
                            </>
                          ) : (
                            <>
                              <BotonIcono
                                label={
                                  showingClosedGraves
                                    ? 'Ver detalle'
                                    : canManage
                                      ? 'Gestionar'
                                      : 'Ver detalle'
                                }
                                onClick={() => setManageId(row.incident_id)}
                                className="!size-8 text-blue-700 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none dark:text-blue-300"
                              >
                                {showingClosedGraves || !canManage ? (
                                  <Eye className="h-4 w-4" aria-hidden />
                                ) : (
                                  <SquarePen className="h-4 w-4" aria-hidden />
                                )}
                              </BotonIcono>
                              <Link
                                to={incidentCaseFilePath(row.incident_id)}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-violet-700 hover:bg-violet-50 focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:outline-none dark:text-violet-300 dark:hover:bg-violet-950/40"
                                title="Expediente (gestiones y fotos)"
                                aria-label="Expediente (gestiones y fotos)"
                              >
                                <FileText className="h-4 w-4" aria-hidden />
                              </Link>
                              {canManage && !showingClosedGraves ? (
                                <BotonIcono
                                  label={hasTicket ? 'Ticket / evento' : 'Generar ticket'}
                                  onClick={() => setTicketRow(row)}
                                  className="!size-8 text-indigo-700 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none dark:text-indigo-300"
                                >
                                  <Ticket className="h-4 w-4" aria-hidden />
                                </BotonIcono>
                              ) : null}
                              {hasTicket ? (
                                <BotonIcono
                                  label={`Descargar imagen${row.ticket_code ? ` ${row.ticket_code}` : ''}`}
                                  disabled={pngBusyId === row.incident_id}
                                  onClick={() => {
                                    setActionError(null)
                                    setPngBusyId(row.incident_id)
                                    void downloadTicketImageFromIncidentId(row.incident_id)
                                      .catch((err: unknown) =>
                                        setActionError(
                                          err instanceof Error ? err.message : 'No se pudo generar la imagen.',
                                        ),
                                      )
                                      .finally(() => setPngBusyId(null))
                                  }}
                                  className="!size-8 text-teal-700 focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:outline-none dark:text-teal-300"
                                >
                                  <ImageDown className="h-4 w-4" aria-hidden />
                                </BotonIcono>
                              ) : null}
                              {canManage && !showingClosedGraves ? (
                                <BotonIcono
                                  label={kind === 'graves' ? 'Cerrar incidencia' : 'Cerrar requerimiento'}
                                  onClick={() => setCloseQueueRow(row)}
                                  className="!size-8 text-red-600 focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:outline-none dark:text-red-400"
                                >
                                  <CircleX className="h-4 w-4" aria-hidden />
                                </BotonIcono>
                              ) : null}
                              {canManage && kind === 'requerimientos' ? (
                                <BotonIcono
                                  label="Eliminar requerimiento"
                                  onClick={() => setDeleteReqRow(row)}
                                  className="!size-8 text-rose-700 focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:outline-none dark:text-rose-400"
                                >
                                  <Trash2 className="h-4 w-4" aria-hidden />
                                </BotonIcono>
                              ) : null}
                              {row.school_id ? (
                                <Link
                                  to={`/history/schools/${row.school_id}`}
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                                  title="Historial del colegio"
                                  aria-label="Historial del colegio"
                                >
                                  <History className="h-4 w-4" aria-hidden />
                                </Link>
                              ) : null}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </DataTableContainer>
        ) : null}
          </>
        )

        return isPolished ? (
          <section className="overflow-hidden rounded-md border border-noc-border bg-noc-surface">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-4 py-4 sm:px-5 dark:border-slate-800">
              <div className="min-w-0">
                <h2 className="text-base font-semibold tracking-tight text-slate-950 dark:text-slate-50">
                  {pageTitle}
                  <span className="ml-2 text-sm font-medium text-slate-400">· listado</span>
                </h2>
                <p className="mt-1 text-[13px] text-slate-500 dark:text-slate-400">
                  {isPendienteCierre
                    ? 'Iconos: ver comentarios, detalle de evento, seguir caso, mantener en gestión y cerrar ticket.'
                    : 'Incluye tipo de energía del colegio para priorizar atención en campo.'}
                </p>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-[12px] font-semibold text-slate-600 tabular-nums dark:bg-slate-800 dark:text-slate-300">
                {recordsLabel}
              </span>
            </div>
            <div className="p-3 sm:p-4 md:p-5">{listBody}</div>
          </section>
        ) : (
          <SectionCard
            title={recordsLabel}
            action={
              rows.length > 0 ? (
                <span className="text-[11px] font-medium tracking-wide text-slate-500 uppercase dark:text-slate-400">
                  {pageTitle}
                </span>
              ) : null
            }
          >
            {listBody}
          </SectionCard>
        )
      })()}

      {bulkIds !== null && bulkIds.length > 1 ? (
        <ModalGestionIncidente
          incidentId={bulkIds[0]}
          bulkIncidentIds={bulkIds}
          initialTab="management"
          readOnly={!canManage}
          onClose={() => {
            setBulkIds(null)
            refresh()
          }}
          onApplied={() => setSelectedIds(new Set())}
        />
      ) : null}

      {comentariosPanel ? (
        <PanelComentariosIncidente panel={comentariosPanel} onClose={() => setComentariosPanel(null)} />
      ) : null}

      {manageId !== null && bulkIds === null ? (
        <ModalGestionIncidente
          incidentId={manageId}
          initialTab={showingClosedGraves ? 'history' : canManage ? 'management' : 'summary'}
          readOnly={!canManage || showingClosedGraves}
          onClose={() => {
            setManageId(null)
            refresh()
          }}
        />
      ) : null}

      {ticketRow ? (
        <ModalGenerarTicket
          open
          incidentId={ticketRow.incident_id}
          cid={ticketRow.cid}
          schoolLabel={ticketRow.local_educativo}
          defaultKind="CORRECTIVO"
          hasTicket={Boolean(ticketRow.has_ticket || ticketRow.ticket_code)}
          onClose={() => setTicketRow(null)}
          onDone={() => {
            setTicketRow(null)
            refresh()
            setManageId(ticketRow.incident_id)
          }}
        />
      ) : null}

      <DialogoConfirmar
        open={closeRow !== null}
        title="Cerrar ticket"
        description={
          closeRow
            ? `Se cerrará el caso${closeRow.cid ? ` CID ${closeRow.cid}` : ''}${
                closeRow.tss != null ? ` · TSS ${closeRow.tss}` : ''
              }${closeRow.local_educativo ? ` · ${closeRow.local_educativo}` : ''}. Sale de Pendiente de cierre y su opción Lista queda en Activo. Si el mismo CID ya tiene una caída más nueva, esa conserva su propia opción de lista.`
            : undefined
        }
        confirmLabel="Cerrar y marcar Activo"
        cancelLabel="Cancelar"
        tone="danger"
        loading={closing}
        onClose={() => {
          if (!closing) setCloseRow(null)
        }}
        onConfirm={() => {
          if (!closeRow) return
          setClosing(true)
          setActionError(null)
          void endpoints
            .closeIncidentTicket(closeRow.incident_id, undefined, true)
            .then(() => {
              setCloseRow(null)
              refresh()
            })
            .catch((err: unknown) => {
              setActionError(err instanceof Error ? err.message : 'No se pudo cerrar el ticket.')
            })
            .finally(() => setClosing(false))
        }}
      />

      <DialogoConfirmar
        open={bulkCloseOpen}
        title="Cerrar selección"
        description={
          selectedRows.length > 0
            ? `Se cerrarán ${selectedRows.length} ticket${selectedRows.length === 1 ? '' : 's'} y salen de Pendiente de cierre. ${selectedWithGestion} ya tienen gestión${
                selectedRows.length - selectedWithGestion > 0
                  ? `; ${selectedRows.length - selectedWithGestion} todavía no.`
                  : '.'
              } Una caída más nueva del mismo CID conserva su opción de lista.`
            : undefined
        }
        confirmLabel={`Cerrar ${selectedRows.length || ''}`.trim()}
        cancelLabel="Cancelar"
        tone="danger"
        loading={bulkClosing}
        onClose={() => {
          if (!bulkClosing) setBulkCloseOpen(false)
        }}
        onConfirm={() => {
          const ids = selectedRows.map((row) => row.incident_id)
          if (ids.length === 0) return
          setBulkClosing(true)
          setActionError(null)
          void (async () => {
            let done = 0
            try {
              for (const id of ids) {
                await endpoints.closeIncidentTicket(id, undefined, bulkListaActivo)
                done += 1
              }
              setBulkCloseOpen(false)
              setBulkListaActivo(true)
              setSelectedIds(new Set())
              refresh()
            } catch (err: unknown) {
              const message = err instanceof Error ? err.message : 'No se pudo cerrar el ticket.'
              setActionError(
                done > 0 ? `Se cerraron ${done} de ${ids.length}. Falló el siguiente: ${message}` : message,
              )
              refresh()
            } finally {
              setBulkClosing(false)
            }
          })()
        }}
      >
        <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[13px] text-slate-700 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            checked={bulkListaActivo}
            disabled={bulkClosing}
            onChange={(e) => setBulkListaActivo(e.target.checked)}
          />
          <span>
            <span className="font-semibold">Poner a todos como Activo en la Lista</span>
            <span className="mt-0.5 block text-[12px] text-slate-500 dark:text-slate-400">
              Recomendado. Solo afecta a estos tickets que cierras; no pisa la opción de una caída nueva del mismo CID.
            </span>
          </span>
        </label>
      </DialogoConfirmar>

      <DialogoConfirmar
        open={keepRow !== null}
        title="Mantener en gestión"
        description={
          keepRow
            ? `Aunque esté recuperado en PRTG, el caso${keepRow.cid ? ` CID ${keepRow.cid}` : ''}${
                keepRow.tss != null ? ` · TSS ${keepRow.tss}` : ''
              }${
                keepRow.local_educativo ? ` · ${keepRow.local_educativo}` : ''
              } seguirá en En gestión. Si vuelve a caer, se reutiliza el mismo ticket (no se crea uno nuevo).`
            : undefined
        }
        confirmLabel="Mantener en gestión"
        cancelLabel="Cancelar"
        tone="primary"
        loading={keeping}
        onClose={() => {
          if (!keeping) setKeepRow(null)
        }}
        onConfirm={() => {
          if (!keepRow) return
          setKeeping(true)
          setActionError(null)
          void endpoints
            .keepIncidentManaging(keepRow.incident_id)
            .then(() => {
              setKeepRow(null)
              refresh()
              void client.invalidateQueries({ queryKey: ['dashboard', 'managing'], refetchType: 'active' })
            })
            .catch((err: unknown) => {
              setActionError(err instanceof Error ? err.message : 'No se pudo mantener en gestión.')
            })
            .finally(() => setKeeping(false))
        }}
      />

      <DialogoConfirmar
        open={closeQueueRow !== null}
        title={kind === 'graves' ? 'Cerrar incidencia' : 'Cerrar requerimiento'}
        description={
          closeQueueRow
            ? `Se cerrará ${kind === 'graves' ? 'la incidencia' : 'el requerimiento'}${
                closeQueueRow.cid ? ` CID ${closeQueueRow.cid}` : ''
              }${closeQueueRow.tss != null ? ` · TSS ${closeQueueRow.tss}` : ''}${
                closeQueueRow.local_educativo ? ` · ${closeQueueRow.local_educativo}` : ''
              }.`
            : undefined
        }
        confirmLabel={kind === 'graves' ? 'Cerrar incidencia' : 'Cerrar requerimiento'}
        cancelLabel="Cancelar"
        tone="danger"
        loading={closingQueue}
        onClose={() => {
          if (!closingQueue) setCloseQueueRow(null)
        }}
        onConfirm={() => {
          if (!closeQueueRow) return
          setClosingQueue(true)
          setActionError(null)
          const closeFn =
            kind === 'graves'
              ? endpoints.closeIncidentGrave
              : endpoints.closeIncidentRequirement
          void closeFn(closeQueueRow.incident_id)
            .then(() => {
              setCloseQueueRow(null)
              refresh()
              if (kind === 'graves') {
                setGravesTab('closed')
              }
            })
            .catch((err: unknown) => {
              setActionError(
                err instanceof Error
                  ? err.message
                  : kind === 'graves'
                    ? 'No se pudo cerrar la incidencia.'
                    : 'No se pudo cerrar el requerimiento.',
              )
            })
            .finally(() => setClosingQueue(false))
        }}
      />

      <DialogoConfirmar
        open={deleteReqRow !== null}
        title="Eliminar requerimiento"
        description={
          deleteReqRow
            ? `Se eliminará el requerimiento${deleteReqRow.cid ? ` CID ${deleteReqRow.cid}` : ''}${
                deleteReqRow.tss != null ? ` · TSS ${deleteReqRow.tss}` : ''
              }${
                deleteReqRow.local_educativo ? ` · ${deleteReqRow.local_educativo}` : ''
              }. Úsalo para quitar duplicados o altas por error. Esta acción no se puede deshacer.`
            : undefined
        }
        confirmLabel="Eliminar"
        cancelLabel="Cancelar"
        tone="danger"
        loading={deletingReq}
        onClose={() => {
          if (!deletingReq) setDeleteReqRow(null)
        }}
        onConfirm={() => {
          if (!deleteReqRow) return
          setDeletingReq(true)
          setActionError(null)
          void endpoints
            .deleteIncidentRequirement(deleteReqRow.incident_id)
            .then(() => {
              setDeleteReqRow(null)
              refresh()
            })
            .catch((err: unknown) => {
              setActionError(err instanceof Error ? err.message : 'No se pudo eliminar el requerimiento.')
            })
            .finally(() => setDeletingReq(false))
        }}
      />
    </DisenoApp>
  )
}

function GravesStatCard({
  label,
  value,
  hint,
  tone = 'neutral',
}: {
  label: string
  value: number
  hint: string
  tone?: 'danger' | 'success' | 'emerald' | 'amber' | 'neutral'
}) {
  const dot: Record<typeof tone, string> = {
    danger: 'bg-noc-danger',
    success: 'bg-noc-success',
    emerald: 'bg-noc-success',
    amber: 'bg-noc-warning',
    neutral: 'bg-noc-faint',
  }

  return (
    <div className="bg-noc-surface p-4">
      <div className="flex items-center gap-2">
        <span className={`h-1.5 w-1.5 rounded-full ${dot[tone]}`} aria-hidden />
        <p className="text-[11px] font-medium tracking-[0.12em] text-noc-faint uppercase">
          {label}
        </p>
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-noc-text tabular-nums">{value}</p>
      <p className="mt-1 text-[12px] text-noc-faint">{hint}</p>
    </div>
  )
}

