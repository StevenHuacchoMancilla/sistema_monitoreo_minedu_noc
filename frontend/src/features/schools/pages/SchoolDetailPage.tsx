import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AppLayout } from '../../../layouts/AppLayout'
import { SectionCard } from '../../../components/ui/Card'
import { EmptyState, ErrorState, LoadingState } from '../../../components/ui/States'
import { CloudnetStatusBadge, FollowupBadge, PrtgStatusBadge } from '../../../components/monitoring/StatusBadges'
import { endpoints } from '../../../api/endpoints'
import { useManualSync } from '../../dashboard/hooks/useDashboard'

export function SchoolDetailPage() {
  const { schoolId } = useParams()
  const id = Number(schoolId)
  const { prtg, cloudnet } = useManualSync()
  const syncing = prtg.isPending || cloudnet.isPending

  const detail = useQuery({
    queryKey: ['schools', id],
    queryFn: () => endpoints.schoolDetail(id),
    enabled: Number.isFinite(id) && id > 0,
  })

  const school = detail.data?.school
  const incident = detail.data?.active_incident
  const prtgSummary = detail.data?.prtg_summary
  const contacts = (school?.contacts ?? []) as SchoolContact[]
  const assignment = (school?.active_assignment ?? null) as NetworkAssignment | null
  const cloudnetSites = (detail.data?.cloudnet_sites ?? []) as CloudnetSiteRow[]
  const history = (detail.data?.incident_history ?? []) as IncidentHistoryRow[]

  return (
    <AppLayout
      title={school?.local_educativo ?? 'Detalle del local'}
      syncing={syncing}
      onRefresh={() => void detail.refetch()}
      onSyncPrtg={() => prtg.mutate()}
      onSyncCloudnet={() => cloudnet.mutate()}
    >
      <div className="mb-3">
        <Link to="/incidents/active" className="text-sm text-noc-info hover:underline">
          ← Volver a caídas activas
        </Link>
      </div>

      {detail.isLoading ? <LoadingState /> : null}
      {detail.isError ? (
        <ErrorState message={detail.error instanceof Error ? detail.error.message : 'Error al cargar'} />
      ) : null}

      {school ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <SectionCard title="Identificación del local">
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs uppercase text-noc-muted">Local educativo</dt>
                  <dd className="font-medium">{school.local_educativo}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase text-noc-muted">Código local</dt>
                  <dd>{school.codigo_local ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase text-noc-muted">Provincia</dt>
                  <dd>{school.provincia ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase text-noc-muted">Distrito</dt>
                  <dd>{school.distrito ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase text-noc-muted">Centro poblado</dt>
                  <dd>{school.centro_poblado ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase text-noc-muted">Nivel</dt>
                  <dd>{school.nivel_iiee ?? '—'}</dd>
                </div>
              </dl>
            </SectionCard>

            <SectionCard title="Asignación de red (CID)">
              {assignment ? (
                <dl className="grid gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-xs uppercase text-noc-muted">CID</dt>
                    <dd className="font-medium">{assignment.cid ?? '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase text-noc-muted">Estado CID</dt>
                    <dd>{String(assignment.cid_status ?? '—')}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase text-noc-muted">Tecnología</dt>
                    <dd>{assignment.tecnologia_acceso ?? '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase text-noc-muted">Nodo / POP</dt>
                    <dd>{assignment.nodo_pop ?? '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase text-noc-muted">IP pública</dt>
                    <dd>{assignment.ip_publica ?? '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase text-noc-muted">IP LAN</dt>
                    <dd>{assignment.ip_lan ?? '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase text-noc-muted">Dispositivo PRTG</dt>
                    <dd>{assignment.prtg_device_name ?? '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase text-noc-muted">Capacidad</dt>
                    <dd>{assignment.capacidad_mbps ? `${assignment.capacidad_mbps} Mbps` : '—'}</dd>
                  </div>
                </dl>
              ) : (
                <EmptyState title="Sin asignación activa" description="No hay CID activo vinculado a este local." />
              )}
            </SectionCard>

            <SectionCard title="Contactos">
              {contacts.length === 0 ? (
                <EmptyState title="Sin contactos" description="No hay contactos registrados para este local." />
              ) : (
                <ul className="divide-y divide-noc-border/70 text-sm">
                  {contacts.map((c) => (
                    <li key={c.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                      <div>
                        <p className="font-medium">{c.name ?? '—'}</p>
                        <p className="text-xs text-noc-muted">{c.role ?? 'Contacto'}</p>
                      </div>
                      <p className="text-noc-muted tabular-nums">{c.phone ?? '—'}</p>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>

            {(() => {
              const lastRecovery = history.find((row) => row.recovered_at)
              if (!lastRecovery) return null
              return (
                <SectionCard title="Última recuperación">
                  <dl className="grid gap-3 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-xs uppercase text-noc-muted">Incidencia</dt>
                      <dd className="font-medium">#{lastRecovery.id}</dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase text-noc-muted">Recuperado</dt>
                      <dd className="font-medium text-noc-success">
                        {lastRecovery.recovered_at
                          ? new Date(lastRecovery.recovered_at).toLocaleString()
                          : '—'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase text-noc-muted">Inicio de caída</dt>
                      <dd>
                        {lastRecovery.started_at
                          ? new Date(lastRecovery.started_at).toLocaleString()
                          : '—'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase text-noc-muted">Seguimiento</dt>
                      <dd>
                        <FollowupBadge status={lastRecovery.followup_status ?? 'RECUPERADO'} />
                      </dd>
                    </div>
                  </dl>
                </SectionCard>
              )
            })()}

            <SectionCard title="Historial de incidencias">
              {history.length === 0 ? (
                <EmptyState title="Sin historial" description="Aún no hay incidencias registradas." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="text-xs uppercase text-noc-muted">
                      <tr>
                        <th className="px-2 py-2">Inicio</th>
                        <th className="px-2 py-2">Recuperación</th>
                        <th className="px-2 py-2">Seguimiento</th>
                        <th className="px-2 py-2">Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((row) => (
                        <tr key={row.id} className="border-t border-noc-border/70">
                          <td className="whitespace-nowrap px-2 py-2">
                            {row.started_at ? new Date(row.started_at).toLocaleString() : '—'}
                          </td>
                          <td className="whitespace-nowrap px-2 py-2">
                            {row.recovered_at ? new Date(row.recovered_at).toLocaleString() : 'Activa'}
                          </td>
                          <td className="px-2 py-2">
                            <FollowupBadge status={row.followup_status} />
                          </td>
                          <td className="px-2 py-2 text-noc-muted">
                            {String(row.status ?? (row.recovered_at ? 'RECUPERADO' : 'ACTIVA'))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>
          </div>

          <div className="space-y-4">
            <SectionCard title="Estado actual">
              <dl className="space-y-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-noc-muted">PRTG</dt>
                  <dd>
                    <PrtgStatusBadge status={prtgSummary?.ping_status ?? null} />
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase text-noc-muted">Último check</dt>
                  <dd>
                    {prtgSummary?.last_check ? new Date(prtgSummary.last_check).toLocaleString() : '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase text-noc-muted">Sensores</dt>
                  <dd>{prtgSummary?.sensor_count ?? 0}</dd>
                </div>
                {incident ? (
                  <>
                    <div className="border-t border-noc-border/70 pt-3">
                      <dt className="text-xs uppercase text-noc-muted">Incidencia activa</dt>
                      <dd className="mt-1">
                        <FollowupBadge status={incident.followup_status} />
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase text-noc-muted">Desde</dt>
                      <dd>
                        {incident.started_at ? new Date(incident.started_at).toLocaleString() : '—'}
                      </dd>
                    </div>
                  </>
                ) : (
                  <p className="border-t border-noc-border/70 pt-3 text-noc-muted">Sin incidencia activa</p>
                )}
              </dl>
            </SectionCard>

            <SectionCard title="Cloudnet">
              {cloudnetSites.length === 0 ? (
                <EmptyState title="Sin site Cloudnet" description="No hay shop vinculado a este local." />
              ) : (
                <ul className="space-y-3 text-sm">
                  {cloudnetSites.map((site) => (
                    <li key={site.id} className="rounded-lg border border-noc-border/60 p-3">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <p className="truncate font-medium" title={site.site_name ?? ''}>
                          {site.site_name ?? String(site.shop_id)}
                        </p>
                        <CloudnetStatusBadge
                          status={String(site.match_status ?? '').startsWith('MATCHED') ? 'ONLINE' : 'UNKNOWN'}
                        />
                      </div>
                      <p className="text-xs text-noc-muted">Shop ID: {site.shop_id}</p>
                      <p className="text-xs text-noc-muted">Match: {site.match_status ?? '—'}</p>
                      <p className="text-xs text-noc-muted">
                        Sync:{' '}
                        {site.last_synced_at ? new Date(site.last_synced_at).toLocaleString() : '—'}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-3 text-xs text-noc-muted">
                Evidencia de plataforma. No implica causa raíz automática de una caída PRTG.
              </p>
            </SectionCard>
          </div>
        </div>
      ) : null}
    </AppLayout>
  )
}

type SchoolContact = {
  id: number
  name?: string | null
  role?: string | null
  phone?: string | null
}

type NetworkAssignment = {
  cid?: string | null
  cid_status?: string | null
  tecnologia_acceso?: string | null
  nodo_pop?: string | null
  ip_publica?: string | null
  ip_lan?: string | null
  prtg_device_name?: string | null
  capacidad_mbps?: string | number | null
}

type IncidentHistoryRow = {
  id: number
  started_at?: string | null
  recovered_at?: string | null
  followup_status?: string | null
  status?: string | null
}

type CloudnetSiteRow = {
  id: number
  shop_id?: string | number
  site_name?: string | null
  match_status?: string | null
  last_synced_at?: string | null
}
