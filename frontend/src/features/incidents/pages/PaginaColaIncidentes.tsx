import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CircleX, Eye, FileText, History, ImageDown, Images, SquarePen, Ticket, Trash2 } from 'lucide-react'
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
import { SearchField } from '../../../components/ui/ControlesFormulario'
import { FollowupBadge } from '../../../components/monitoring/InsigniasEstado'
import { InsigniaEnergia } from '../../../components/monitoring/InsigniaEnergia'
import { Insignia } from '../../../components/ui/InsigniaSuave'
import { endpoints } from '../../../api/endpoints'
import { useAuth } from '../../auth/context/ContextoAuth'
import { incidentCaseFilePath } from '../../history/api/apiHistorial'
import { ModalGestionIncidente } from '../components/ModalGestionIncidente'
import { ModalGenerarTicket } from '../components/ModalGenerarTicket'
import { downloadTicketImageFromIncidentId } from '../lib/imagenTicket'

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
    fetcher: (opts?: { gravesTab?: GravesTab }) => Promise<{ data: QueueRow[] }>
  }
> = {
  'pendiente-cierre': {
    title: 'Pendiente de cierre',
    description:
      'Caídas recuperadas a cualquier hora (monitoreo 24h). Al elegir Caída de enlace / Queja pasan a Incidencias; Requerimiento a Requerimientos. Comentario sin resultado queda aquí («Gestión lista»). También puedes cerrar el ticket.',
    fetcher: () => endpoints.incidentsPendienteCierre() as Promise<{ data: QueueRow[] }>,
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

export function PaginaColaIncidentes({ kind }: { kind: QueueKind }) {
  const meta = META[kind]
  const { user } = useAuth()
  const canManage = Boolean(user?.permissions?.includes('incidents.manage'))
  const client = useQueryClient()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [manageId, setManageId] = useState<number | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [bulkIds, setBulkIds] = useState<number[] | null>(null)
  const [bulkCloseOpen, setBulkCloseOpen] = useState(false)
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
  const [gravesTab, setGravesTab] = useState<GravesTab>(() =>
    kind === 'graves' && searchParams.get('tab') === 'cerradas' ? 'closed' : 'open',
  )
  const showingClosedGraves = kind === 'graves' && gravesTab === 'closed'

  useEffect(() => {
    setSelectedIds(new Set())
    setBulkIds(null)
    setBulkCloseOpen(false)
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
  const rows = useMemo(
    () => allRows.filter((row) => matchesCidOrTss(row, search)),
    [allRows, search],
  )
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

  return (
    <DisenoApp>
      <EncabezadoPagina
        title={pageTitle}
        description={pageDescription}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {kind === 'pendiente-cierre' ? (
              <Boton variant="secondary" onClick={() => navigate('/incidents/managing')}>
                Ir a En gestión
              </Boton>
            ) : null}
            <Boton variant="secondary" onClick={() => void query.refetch()}>
              Refrescar
            </Boton>
          </div>
        }
      />

      {kind === 'graves' ? (
        <div className="mb-4 inline-flex rounded-xl border border-slate-200 bg-slate-100 p-1 dark:border-slate-700 dark:bg-slate-900">
          <button
            type="button"
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
              gravesTab === 'open'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-white/70 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100'
            }`}
            onClick={() => {
              setGravesTab('open')
              setSearch('')
            }}
          >
            Incidencias
          </button>
          <button
            type="button"
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
              gravesTab === 'closed'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-white/70 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100'
            }`}
            onClick={() => {
              setGravesTab('closed')
              setSearch('')
            }}
          >
            Incidencias cerradas
          </button>
        </div>
      ) : null}

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

      <SectionCard
        title={`${rows.length} registro${rows.length === 1 ? '' : 's'}${
          search.trim() && rows.length !== allRows.length ? ` de ${allRows.length}` : ''
        }`}
        action={
          rows.length > 0 ? (
            <span className="text-[11px] font-medium tracking-wide text-slate-500 uppercase dark:text-slate-400">
              {pageTitle}
            </span>
          ) : null
        }
      >
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
              onClick={() => setBulkCloseOpen(true)}
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
          <DataTableContainer>
            <table
              className={`${tableClassName}${kind === 'pendiente-cierre' ? ' table-fixed' : ''}`}
              style={kind === 'pendiente-cierre' ? { minWidth: canSelectMany ? 1320 : 1220 } : undefined}
            >
              {kind === 'pendiente-cierre' ? (
                <colgroup>
                  {canSelectMany ? <col className="w-10" /> : null}
                  <col className="w-[7.5rem]" />
                  <col className="w-[4.25rem]" />
                  <col className="w-[7rem]" />
                  <col />
                  <col className="w-[8.5rem]" />
                  <col className="w-[8rem]" />
                  <col className="w-[7.5rem]" />
                  <col className="w-[6.75rem]" />
                  <col className="w-[6.75rem]" />
                  <col className="w-[17rem]" />
                </colgroup>
              ) : null}
              <thead className={theadClassName}>
                <tr>
                  {canSelectMany ? (
                    <th className={thClassName}>
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
                  <th className={thClassName}>CID</th>
                  <th className={thClassName}>TSS</th>
                  {kind === 'pendiente-cierre' ? (
                    <th className={thClassName} title="Fuente de energía del colegio">
                      Tipo de energía
                    </th>
                  ) : null}
                  <th className={thClassName}>Local</th>
                  <th className={thClassName}>Ubicación</th>
                  {kind === 'pendiente-cierre' ? (
                    <th className={thClassName} title="Nodo o POP del colegio">
                      Nodo/POP
                    </th>
                  ) : null}
                  <th className={thClassName}>Estado</th>
                  {kind === 'pendiente-cierre' ? (
                    <th className={thClassName} title="Inicio de la caída">
                      Caída
                    </th>
                  ) : null}
                  <th className={thClassName}>{markedLabel}</th>
                  <th className={`${thClassName} text-right`}>Acción</th>
                </tr>
              </thead>
              <tbody>
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
                        : kind === 'pendiente-cierre'
                          ? row.recuperada_en ?? row.recovered_at ?? null
                          : row.recovered_at ?? null

                  return (
                    <tr key={row.incident_id} className={`${trClassName} group`}>
                      {canSelectMany ? (
                        <td className={idTd}>
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
                      <td className={`${idTd} font-medium tabular-nums`}>{row.cid ?? '—'}</td>
                      <td className={`${idTd} font-semibold tabular-nums text-slate-900 dark:text-slate-100`}>
                        {row.tss ?? '—'}
                      </td>
                      {kind === 'pendiente-cierre' ? (
                        <td className={idTd}>
                          <InsigniaEnergia energy={row.energy_type} size="sm" />
                        </td>
                      ) : null}
                      <td className={queueTd}>
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
                      <td className={queueTd}>
                        <Truncate title={row.provincia}>{row.provincia ?? '—'}</Truncate>
                        <Truncate
                          title={row.distrito}
                          className="text-[11px] text-slate-500 dark:text-slate-400"
                        >
                          {row.distrito ?? '—'}
                        </Truncate>
                      </td>
                      {kind === 'pendiente-cierre' ? (
                        <td className={queueTd}>
                          <Truncate title={row.nodo_pop ?? undefined}>{row.nodo_pop?.trim() || '—'}</Truncate>
                        </td>
                      ) : null}
                      <td className={queueTd}>
                        <div className="flex min-w-0 flex-col items-start gap-1">
                          {kind === 'pendiente-cierre' && row.gestion_lista ? (
                            <Insignia tone="success" title="Gestión guardada. Cierra el ticket cuando termines.">
                              Gestión lista
                            </Insignia>
                          ) : (
                            <FollowupBadge status={row.followup_status} />
                          )}
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
                      {kind === 'pendiente-cierre' ? (
                        <td className={`${tdDateClassName} !align-top`}>
                          <IsoDateTimeCell
                            value={row.current_down_started_at ?? row.started_at ?? null}
                          />
                        </td>
                      ) : null}
                      <td className={`${tdDateClassName} !align-top`}>
                        <IsoDateTimeCell value={markedAt} />
                      </td>
                      <td className={actionTd}>
                        <div className="inline-flex flex-wrap items-center justify-end gap-0.5">
                          {kind === 'pendiente-cierre' ? (
                            <>
                              <Boton
                                size="sm"
                                variant="primary"
                                className="!h-8 !px-2.5 !text-[11px]"
                                onClick={() => setManageId(row.incident_id)}
                              >
                                Seguir caso
                              </Boton>
                              {canManage ? (
                                <>
                                  <Boton
                                    size="sm"
                                    variant="secondary"
                                    className="!h-8 !px-2.5 !text-[11px]"
                                    onClick={() => setKeepRow(row)}
                                  >
                                    Mantener en gestión
                                  </Boton>
                                  <Boton
                                    size="sm"
                                    variant="secondary"
                                    className="!h-8 !px-2.5 !text-[11px]"
                                    onClick={() => setCloseRow(row)}
                                  >
                                    Cerrar ticket
                                  </Boton>
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
      </SectionCard>

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
              }${closeRow.local_educativo ? ` · ${closeRow.local_educativo}` : ''}. El ticket sale de Pendiente de cierre.`
            : undefined
        }
        confirmLabel="Cerrar ticket"
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
            .closeIncidentTicket(closeRow.incident_id)
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
              }`
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
                await endpoints.closeIncidentTicket(id)
                done += 1
              }
              setBulkCloseOpen(false)
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
      />

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

