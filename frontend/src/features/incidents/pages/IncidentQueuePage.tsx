import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
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

type QueueKind = 'pendiente-cierre' | 'graves'

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
  responsible_area?: string | null
  tracking?: { id: number; ticket: string | null; status_label: string | null } | null
}

const META: Record<
  QueueKind,
  { title: string; description: string; fetcher: () => Promise<{ data: QueueRow[] }> }
> = {
  'pendiente-cierre': {
    title: 'Pendiente de cierre',
    description:
      'Colegios que se recuperaron en PRTG estando en gestión. Cierra el ticket o espera; si vuelven a caer se abre un ticket nuevo desde Caídas.',
    fetcher: () => endpoints.incidentsPendienteCierre() as Promise<{ data: QueueRow[] }>,
  },
  graves: {
    title: 'Incidencias graves',
    description:
      'Casos marcados como incidencia. Si el colegio cae otra vez aparece en Caídas totales con la etiqueta «En incidencia».',
    fetcher: () => endpoints.incidentsGraves() as Promise<{ data: QueueRow[] }>,
  },
}

export function IncidentQueuePage({ kind }: { kind: QueueKind }) {
  const meta = META[kind]
  const { user } = useAuth()
  const canManage = Boolean(user?.permissions?.includes('incidents.manage'))
  const client = useQueryClient()
  const [manageId, setManageId] = useState<number | null>(null)

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
          <Button variant="secondary" onClick={() => void query.refetch()}>
            Refrescar
          </Button>
        }
      />

      <SectionCard title={meta.title} action={<span className="text-xs text-slate-500">{rows.length} registro(s)</span>}>
        {query.isLoading ? <LoadingState /> : null}
        {query.isError ? (
          <ErrorState message={query.error instanceof Error ? query.error.message : 'Error'} />
        ) : null}
        {!query.isLoading && !query.isError && rows.length === 0 ? (
          <EmptyState title="Sin registros" description="No hay elementos en esta cola." />
        ) : null}

        {rows.length > 0 ? (
          <DataTableContainer>
            <table className={tableClassName}>
              <thead className={theadClassName}>
                <tr>
                  <th className={thClassName}>CID</th>
                  <th className={thClassName}>Local</th>
                  <th className={thClassName}>Ubicación</th>
                  <th className={thClassName}>Estado</th>
                  <th className={thClassName}>{kind === 'graves' ? 'Marcada' : 'Recuperada'}</th>
                  <th className={thClassName}>Tracking</th>
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
                        value={kind === 'graves' ? row.grave_opened_at ?? null : row.recovered_at ?? null}
                      />
                    </td>
                    <td className={tdClassName}>
                      {row.tracking?.ticket ?? '—'}
                      {row.tracking?.status_label ? (
                        <span className="block text-[11px] text-slate-500">{row.tracking.status_label}</span>
                      ) : null}
                    </td>
                    <td className={tdClassName}>
                      <div className="flex flex-wrap gap-1">
                        <Button size="sm" variant="secondary" onClick={() => setManageId(row.incident_id)}>
                          Ver
                        </Button>
                        {canManage && kind === 'pendiente-cierre' ? (
                          <Button
                            size="sm"
                            variant="primary"
                            onClick={() => {
                              void endpoints.closeIncidentTicket(row.incident_id).then(refresh)
                            }}
                          >
                            Cerrar ticket
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
          initialTab={canManage ? (kind === 'pendiente-cierre' || kind === 'graves' ? 'seguimiento' : 'management') : 'summary'}
          readOnly={!canManage}
          onClose={() => {
            setManageId(null)
            refresh()
          }}
        />
      ) : null}
    </AppLayout>
  )
}
