import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ImageDown } from 'lucide-react'
import { AppLayout } from '../../../layouts/AppLayout'
import { PageHeader } from '../../../components/ui/PageHeader'
import { SectionCard } from '../../../components/ui/Card'
import { Button } from '../../../components/ui/Button'
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
import { endpoints } from '../../../api/endpoints'
import { useAuth } from '../../auth/context/AuthContext'
import { IncidentManageModal } from '../components/IncidentManageModal'
import { GenerateTicketModal } from '../components/GenerateTicketModal'
import { downloadTicketImageFromIncidentId } from '../lib/ticketImage'

type QueueKind = 'pendiente-cierre' | 'graves' | 'requerimientos'

type QueueRow = {
  incident_id: number
  cid?: string | null
  local_educativo?: string | null
  codigo_local?: string | null
  provincia?: string | null
  distrito?: string | null
  followup_status?: string | null
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
      'Colegios que se recuperaron de Caídas totales en día laboral (lun–vie). Abre el seguimiento o cierra el ticket. Sábados y domingos no entran aquí.',
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
                    <td className={tdClassName}>
                      <Truncate title={row.local_educativo}>{row.local_educativo ?? '—'}</Truncate>
                      <span className="block text-[11px] text-slate-500">{row.codigo_local ?? '—'}</span>
                    </td>
                    <td className={tdClassName}>
                      <Truncate title={row.provincia}>{row.provincia ?? '—'}</Truncate>
                      <span className="block text-[11px] text-slate-500">{row.distrito ?? '—'}</span>
                    </td>
                    <td className={tdClassName}>
                      <FollowupBadge status={row.followup_status} />
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
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => {
                              if (!window.confirm('¿Cerrar este ticket operativamente?')) return
                              void endpoints.closeIncidentTicket(row.incident_id).then(refresh)
                            }}
                          >
                            Cerrar ticket
                          </Button>
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
    </AppLayout>
  )
}
