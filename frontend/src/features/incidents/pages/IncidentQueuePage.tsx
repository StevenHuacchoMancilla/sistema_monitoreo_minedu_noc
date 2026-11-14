import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CircleX, Eye, History, ImageDown, SquarePen, Ticket } from 'lucide-react'
import { AppLayout } from '../../../layouts/AppLayout'
import { PageHeader } from '../../../components/ui/PageHeader'
import { SectionCard } from '../../../components/ui/Card'
import { Button } from '../../../components/ui/Button'
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog'
import { IconButton } from '../../../components/ui/IconButton'
import { EmptyState, ErrorState, LoadingState } from '../../../components/ui/States'
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
} from '../../../components/ui/DataTableFrame'
import { FilterCard } from '../../../components/ui/FilterCard'
import { SearchField } from '../../../components/ui/FormControls'
import { FollowupBadge } from '../../../components/monitoring/StatusBadges'
import { Badge } from '../../../components/ui/SoftBadge'
import { endpoints } from '../../../api/endpoints'
import { useAuth } from '../../auth/context/AuthContext'
import { IncidentManageModal } from '../components/IncidentManageModal'
import { GenerateTicketModal } from '../components/GenerateTicketModal'
import { downloadTicketImageFromIncidentId } from '../lib/ticketImage'

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
  provincia?: string | null
  distrito?: string | null
  tecnologia?: string | null
  followup_status?: string | null
  gestion_lista?: boolean
  started_at?: string | null
  recovered_at?: string | null
  grave_opened_at?: string | null
  requirement_opened_at?: string | null
  responsible_area?: string | null
  ticket_code?: string | null
  has_ticket?: boolean
  tracking?: { id: number; ticket: string | null; status_label: string | null } | null
}

const META: Record<
  QueueKind,
  { title: string; description: string; fetcher: () => Promise<{ data: QueueRow[] }> }
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
    fetcher: () => endpoints.incidentsGraves() as Promise<{ data: QueueRow[] }>,
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
const actionTd =
  'sticky right-0 z-10 overflow-hidden bg-white px-2 py-2 !align-top text-right shadow-[-8px_0_8px_-8px_rgba(15,23,42,0.12)] group-hover:bg-slate-50 dark:bg-slate-900 dark:group-hover:bg-slate-800/60'

export function IncidentQueuePage({ kind }: { kind: QueueKind }) {
  const meta = META[kind]
  const { user } = useAuth()
  const canManage = Boolean(user?.permissions?.includes('incidents.manage'))
  const client = useQueryClient()
  const navigate = useNavigate()
  const [manageId, setManageId] = useState<number | null>(null)
  const [ticketRow, setTicketRow] = useState<QueueRow | null>(null)
  const [pngBusyId, setPngBusyId] = useState<number | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [closeRow, setCloseRow] = useState<QueueRow | null>(null)
  const [closing, setClosing] = useState(false)
  const [keepRow, setKeepRow] = useState<QueueRow | null>(null)
  const [keeping, setKeeping] = useState(false)
  const [closeQueueRow, setCloseQueueRow] = useState<QueueRow | null>(null)
  const [closingQueue, setClosingQueue] = useState(false)

  const [search, setSearch] = useState('')

  const query = useQuery({
    queryKey: ['incidents', 'queue', kind],
    queryFn: meta.fetcher,
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

  const refresh = () => {
    void client.invalidateQueries({ queryKey: ['incidents', 'queue', kind], refetchType: 'active' })
    void client.invalidateQueries({ queryKey: ['dashboard'], refetchType: 'active' })
  }

  const markedLabel = kind === 'graves' || kind === 'requerimientos' ? 'Marcada' : 'Recuperada'

  return (
    <AppLayout>
      <PageHeader
        title={meta.title}
        description={meta.description}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {kind === 'pendiente-cierre' ? (
              <Button variant="secondary" onClick={() => navigate('/incidents/managing')}>
                Ir a En gestión
              </Button>
            ) : null}
            <Button variant="secondary" onClick={() => void query.refetch()}>
              Refrescar
            </Button>
          </div>
        }
      />

      <div className="mb-4">
        <FilterCard>
          <SearchField
            className="sm:col-span-2 xl:col-span-2"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="CID o TSS"
          />
        </FilterCard>
      </div>

      <SectionCard
        title={`${rows.length} registro${rows.length === 1 ? '' : 's'}${
          search.trim() && rows.length !== allRows.length ? ` de ${allRows.length}` : ''
        }`}
        action={
          rows.length > 0 ? (
            <span className="text-[11px] font-medium tracking-wide text-slate-500 uppercase dark:text-slate-400">
              {meta.title}
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
                : 'No hay elementos en esta cola.'
            }
          />
        ) : null}
        {!query.isLoading && !query.isError && allRows.length > 0 && rows.length === 0 ? (
          <EmptyState title="Sin coincidencias" description="Ningún registro coincide con CID o TSS." />
        ) : null}

        {actionError ? <p className="mb-3 text-sm text-red-600">{actionError}</p> : null}

        {rows.length > 0 ? (
          <DataTableContainer>
            <table className={tableClassName}>
              <thead className={theadClassName}>
                <tr>
                  <th className={thClassName}>CID</th>
                  <th className={thClassName}>TSS</th>
                  <th className={thClassName}>Local</th>
                  <th className={thClassName}>Ubicación</th>
                  <th className={thClassName}>Estado</th>
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
                  const markedAt =
                    kind === 'graves'
                      ? row.grave_opened_at ?? null
                      : kind === 'requerimientos'
                        ? row.requirement_opened_at ?? null
                        : row.recovered_at ?? null

                  return (
                    <tr key={row.incident_id} className={`${trClassName} group`}>
                      <td className={`${queueTd} font-medium tabular-nums`}>{row.cid ?? '—'}</td>
                      <td className={`${queueTd} font-semibold tabular-nums text-slate-900 dark:text-slate-100`}>
                        {row.tss ?? '—'}
                      </td>
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
                      <td className={queueTd}>
                        <div className="flex min-w-0 flex-col items-start gap-1">
                          {kind === 'pendiente-cierre' && row.gestion_lista ? (
                            <Badge tone="success" title="Gestión guardada. Cierra el ticket cuando termines.">
                              Gestión lista
                            </Badge>
                          ) : (
                            <FollowupBadge status={row.followup_status} />
                          )}
                        </div>
                      </td>
                      <td className={`${tdDateClassName} !align-top`}>
                        <IsoDateTimeCell value={markedAt} />
                      </td>
                      <td className={actionTd}>
                        <div className="inline-flex flex-wrap items-center justify-end gap-0.5">
                          {kind === 'pendiente-cierre' ? (
                            <>
                              <Button
                                size="sm"
                                variant="primary"
                                className="!h-8 !px-2.5 !text-[11px]"
                                onClick={() => setManageId(row.incident_id)}
                              >
                                Seguir caso
                              </Button>
                              {canManage ? (
                                <>
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    className="!h-8 !px-2.5 !text-[11px]"
                                    onClick={() => setKeepRow(row)}
                                  >
                                    Mantener en gestión
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    className="!h-8 !px-2.5 !text-[11px]"
                                    onClick={() => setCloseRow(row)}
                                  >
                                    Cerrar ticket
                                  </Button>
                                </>
                              ) : null}
                            </>
                          ) : (
                            <>
                              <IconButton
                                label={canManage ? 'Gestionar' : 'Ver detalle'}
                                onClick={() => setManageId(row.incident_id)}
                                className="!size-8 text-blue-700 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none dark:text-blue-300"
                              >
                                {canManage ? (
                                  <SquarePen className="h-4 w-4" aria-hidden />
                                ) : (
                                  <Eye className="h-4 w-4" aria-hidden />
                                )}
                              </IconButton>
                              {canManage ? (
                                <IconButton
                                  label={hasTicket ? 'Ticket / evento' : 'Generar ticket'}
                                  onClick={() => setTicketRow(row)}
                                  className="!size-8 text-indigo-700 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none dark:text-indigo-300"
                                >
                                  <Ticket className="h-4 w-4" aria-hidden />
                                </IconButton>
                              ) : null}
                              {hasTicket ? (
                                <IconButton
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
                                </IconButton>
                              ) : null}
                              {canManage ? (
                                <IconButton
                                  label={kind === 'graves' ? 'Cerrar incidencia' : 'Cerrar requerimiento'}
                                  onClick={() => setCloseQueueRow(row)}
                                  className="!size-8 text-red-600 focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:outline-none dark:text-red-400"
                                >
                                  <CircleX className="h-4 w-4" aria-hidden />
                                </IconButton>
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

      {manageId !== null ? (
        <IncidentManageModal
          incidentId={manageId}
          initialTab={canManage ? 'management' : 'summary'}
          readOnly={!canManage}
          onClose={() => {
            setManageId(null)
            refresh()
          }}
        />
      ) : null}

      {ticketRow ? (
        <GenerateTicketModal
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

      <ConfirmDialog
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

      <ConfirmDialog
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

      <ConfirmDialog
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
    </AppLayout>
  )
}
