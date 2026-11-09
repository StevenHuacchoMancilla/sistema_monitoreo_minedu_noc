import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ImageDown } from 'lucide-react'
import { AppLayout } from '../../../layouts/AppLayout'
import { PageHeader } from '../../../components/ui/PageHeader'
import { SectionCard } from '../../../components/ui/Card'
import { Button } from '../../../components/ui/Button'
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog'
import { EmptyState, ErrorState, LoadingState } from '../../../components/ui/States'
import {
  DataTableContainer,
  IsoDateTimeCell,
  Truncate,
  tableClassName,
  tdClassName,
  thClassName,
  theadClassName,
  trClassName,
} from '../../../components/ui/DataTableFrame'
import { FollowupBadge } from '../../../components/monitoring/StatusBadges'
import { Badge } from '../../../components/ui/SoftBadge'
import { endpoints } from '../../../api/endpoints'
import { useAuth } from '../../auth/context/AuthContext'
import { IncidentManageModal } from '../components/IncidentManageModal'
import { GenerateTicketModal } from '../components/GenerateTicketModal'
import { downloadTicketImageFromIncidentId } from '../lib/ticketImage'

type QueueKind = 'pendiente-cierre' | 'graves' | 'requerimientos'

type QueueRow = {
  incident_id: number
  cid?: string | null
  tss?: number | string | null
  local_educativo?: string | null
  codigo_local?: string | null
  provincia?: string | null
  distrito?: string | null
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
      'Recuperados en día laboral (lun–vie). Al elegir Caída de enlace / Queja pasa a Incidencias; Requerimiento a Requerimientos (re-cae sin ticket nuevo). Comentario sin resultado queda aquí («Gestión lista»). También puedes cerrar el ticket. Sáb/dom no entran aquí.',
    fetcher: () => endpoints.incidentsPendienteCierre() as Promise<{ data: QueueRow[] }>,
  },
  graves: {
    title: 'Incidencias graves',
    description:
      'Casos marcados como incidencia. Si el colegio cae otra vez aparece en Caídas totales con la etiqueta «En incidencia».',
    fetcher: () => endpoints.incidentsGraves() as Promise<{ data: QueueRow[] }>,
  },
  requerimientos: {
    title: 'Requerimientos',
    description:
      'Casos etiquetados como Requerimiento. Si el colegio se restablece y vuelve a caer, reaparece con la misma etiqueta salvo que cambies el resultado de gestión.',
    fetcher: () => endpoints.incidentsRequerimientos() as Promise<{ data: QueueRow[] }>,
  },
}

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

  const query = useQuery({
    queryKey: ['incidents', 'queue', kind],
    queryFn: meta.fetcher,
    refetchInterval: 60_000,
    staleTime: 30_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
  })

  const rows = useMemo(() => query.data?.data ?? [], [query.data])

  const refresh = () => {
    void client.invalidateQueries({ queryKey: ['incidents', 'queue', kind], refetchType: 'active' })
    void client.invalidateQueries({ queryKey: ['dashboard'], refetchType: 'active' })
  }

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

      <SectionCard title={meta.title} action={<span className="text-xs text-slate-500">{rows.length} registro(s)</span>}>
        {query.isLoading ? <LoadingState /> : null}
        {query.isError ? (
          <ErrorState message={query.error instanceof Error ? query.error.message : 'Error'} />
        ) : null}
        {!query.isLoading && !query.isError && rows.length === 0 ? (
          <EmptyState
            title="Sin registros"
            description={
              kind === 'pendiente-cierre'
                ? 'No hay tickets pendientes de cierre. El seguimiento activo está en En gestión.'
                : 'No hay elementos en esta cola.'
            }
          />
        ) : null}

        {actionError ? <p className="mb-3 text-sm text-red-600">{actionError}</p> : null}

        {rows.length > 0 ? (
          <DataTableContainer>
            <table className={tableClassName}>
              <thead className={theadClassName}>
                <tr>
                  <th className={thClassName}>CID</th>
                  {kind === 'pendiente-cierre' ? <th className={thClassName}>TSS</th> : null}
                  <th className={thClassName}>Local</th>
                  <th className={thClassName}>Ubicación</th>
                  <th className={thClassName}>Estado</th>
                  <th className={thClassName}>
                    {kind === 'graves' || kind === 'requerimientos' ? 'Marcada' : 'Recuperada'}
                  </th>
                  <th className={thClassName}>Acción</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.incident_id} className={trClassName}>
                    <td className={tdClassName}>{row.cid ?? '—'}</td>
                    {kind === 'pendiente-cierre' ? (
                      <td className={`${tdClassName} font-semibold tabular-nums`}>{row.tss ?? '—'}</td>
                    ) : null}
                    <td className={tdClassName}>
                      <Truncate title={row.local_educativo}>{row.local_educativo ?? '—'}</Truncate>
                      <span className="block text-[11px] text-slate-500">{row.codigo_local ?? '—'}</span>
                    </td>
                    <td className={tdClassName}>
                      <Truncate title={row.provincia}>{row.provincia ?? '—'}</Truncate>
                      <span className="block text-[11px] text-slate-500">{row.distrito ?? '—'}</span>
                    </td>
                    <td className={tdClassName}>
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
                    <td className={tdClassName}>
                      <IsoDateTimeCell
                        value={
                          kind === 'graves'
                            ? row.grave_opened_at ?? null
                            : kind === 'requerimientos'
                              ? row.requirement_opened_at ?? null
                              : row.recovered_at ?? null
                        }
                      />
                    </td>
                    <td className={tdClassName}>
                      <div className="flex flex-wrap gap-1">
                        {kind === 'pendiente-cierre' ? (
                          <Button size="sm" variant="primary" onClick={() => setManageId(row.incident_id)}>
                            Seguir caso
                          </Button>
                        ) : (
                          <Button size="sm" variant="secondary" onClick={() => setManageId(row.incident_id)}>
                            Ver
                          </Button>
                        )}
                        {canManage && kind === 'pendiente-cierre' ? (
                          <>
                            <Button size="sm" variant="secondary" onClick={() => setKeepRow(row)}>
                              Mantener en gestión
                            </Button>
                            <Button size="sm" variant="secondary" onClick={() => setCloseRow(row)}>
                              Cerrar ticket
                            </Button>
                          </>
                        ) : null}
                        {canManage && (kind === 'graves' || kind === 'requerimientos') ? (
                          <Button size="sm" variant="primary" onClick={() => setTicketRow(row)}>
                            {row.has_ticket || row.ticket_code ? 'Ticket / evento' : 'Generar ticket'}
                          </Button>
                        ) : null}
                        {(kind === 'graves' || kind === 'requerimientos') &&
                        (row.has_ticket || row.ticket_code) ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            loading={pngBusyId === row.incident_id}
                            onClick={() => {
                              setActionError(null)
                              setPngBusyId(row.incident_id)
                              void downloadTicketImageFromIncidentId(row.incident_id)
                                .catch((err: unknown) =>
                                  setActionError(err instanceof Error ? err.message : 'No se pudo generar la imagen.'),
                                )
                                .finally(() => setPngBusyId(null))
                            }}
                          >
                            <ImageDown className="h-3.5 w-3.5" />
                            Imagen
                          </Button>
                        ) : null}
                        {canManage && kind === 'graves' ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => {
                              void endpoints.closeIncidentGrave(row.incident_id).then(refresh)
                            }}
                          >
                            Cerrar incidencia
                          </Button>
                        ) : null}
                        {canManage && kind === 'requerimientos' ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => {
                              void endpoints.closeIncidentRequirement(row.incident_id).then(refresh)
                            }}
                          >
                            Cerrar requerimiento
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
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
                closeRow.local_educativo ? ` · ${closeRow.local_educativo}` : ''
              }. El ticket sale de Pendiente de cierre.`
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
    </AppLayout>
  )
}
