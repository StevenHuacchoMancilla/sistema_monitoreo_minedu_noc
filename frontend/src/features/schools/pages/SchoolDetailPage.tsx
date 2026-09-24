import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import {
  ArrowLeft,
  CircleCheck,
  GraduationCap,
  History,
  Network,
} from 'lucide-react'
import { AppLayout } from '../../../layouts/AppLayout'
import { SectionCard } from '../../../components/ui/Card'
import { EmptyState, ErrorState, LoadingState } from '../../../components/ui/States'
import { CloudnetStatusBadge, FollowupBadge, PrtgStatusBadge } from '../../../components/monitoring/StatusBadges'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Badge } from '../../../components/ui/SoftBadge'
import { Button } from '../../../components/ui/Button'
import { endpoints } from '../../../api/endpoints'
import { useManualSync } from '../../dashboard/hooks/useDashboard'
import { LocationMismatchBadge } from '../../locations/components/LocationMismatchBadge'
import { SchoolGeneralForm } from '../forms/SchoolGeneralForm'
import { NetworkAssignmentForm } from '../forms/NetworkAssignmentForm'
import { ContactForm } from '../forms/ContactForm'
import type { NetworkAssignmentPayload, SchoolGeneralPayload } from '../types/school'
import { techBadgeClass } from '../../../lib/uiTokens'
import { formatDateTime } from '../../../lib/datetime'
import { usePermissions } from '../../auth/hooks/usePermissions'
import { P } from '../../auth/permissions'

const TABS = [
  'GENERAL',
  'RED',
  'CONTACTOS',
  'PRTG',
  'CLOUDNET',
  'INCIDENCIAS',
  'HISTORIAL',
  'AUDITORÍA',
] as const

type Tab = (typeof TABS)[number]

export function SchoolDetailPage() {
  const { schoolId } = useParams()
  const id = Number(schoolId)
  const navigate = useNavigate()
  const client = useQueryClient()
  const { prtg, cloudnet } = useManualSync()
  const syncing = prtg.isPending || cloudnet.isPending
  const [tab, setTab] = useState<Tab>('GENERAL')
  const [reassignMode, setReassignMode] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const { can } = usePermissions()
  const canManage = can(P.schoolsManage)

  const detail = useQuery({
    queryKey: ['schools', id],
    queryFn: () => endpoints.schoolDetail(id),
    enabled: Number.isFinite(id) && id > 0,
  })

  const school = detail.data?.school as SchoolRecord | undefined
  const incident = detail.data?.active_incident
  const prtgSummary = detail.data?.prtg_summary
  const contacts = (school?.contacts ?? []) as SchoolContact[]
  const assignment = (school?.active_assignment ?? null) as NetworkAssignment | null
  const cloudnetSites = (detail.data?.cloudnet_sites ?? []) as CloudnetSiteRow[]
  const history = (detail.data?.incident_history ?? []) as IncidentHistoryRow[]
  const auditLogs = ((detail.data as { audit_logs?: AuditRow[] } | undefined)?.audit_logs ?? []) as AuditRow[]

  const refresh = async () => {
    await client.invalidateQueries({ queryKey: ['schools', id] })
    await client.invalidateQueries({ queryKey: ['schools', 'list'] })
  }

  const saveGeneral = useMutation({
    mutationFn: (body: SchoolGeneralPayload) => endpoints.updateSchool(id, body),
    onSuccess: async () => {
      setMsg('Datos generales actualizados')
      await refresh()
    },
  })

  const saveAssignment = useMutation({
    mutationFn: (body: NetworkAssignmentPayload) => {
      if (!assignment?.id) throw new Error('Sin assignment activo')
      return endpoints.updateAssignment(id, assignment.id, body)
    },
    onSuccess: async () => {
      setMsg('Asignación corregida')
      await refresh()
    },
  })

  const reassign = useMutation({
    mutationFn: (body: NetworkAssignmentPayload & { cid: string }) => endpoints.reassignCid(id, body),
    onSuccess: async () => {
      setMsg('CID reasignado (histórico conservado)')
      setReassignMode(false)
      await refresh()
    },
  })

  const toggleActive = useMutation({
    mutationFn: () => (school?.active ? endpoints.deactivateSchool(id) : endpoints.reactivateSchool(id)),
    onSuccess: async () => {
      setMsg(school?.active ? 'Local desactivado' : 'Local reactivado')
      await refresh()
    },
  })

  const saveContact = useMutation({
    mutationFn: (payload: { id?: number; data: Parameters<typeof endpoints.createContact>[1] }) =>
      payload.id
        ? endpoints.updateContact(id, payload.id, payload.data)
        : endpoints.createContact(id, payload.data),
    onSuccess: async () => {
      setMsg('Contacto guardado')
      await refresh()
    },
  })

  const deactivateContact = useMutation({
    mutationFn: (contactId: number) => endpoints.deactivateContact(id, contactId),
    onSuccess: async () => {
      setMsg('Contacto desactivado')
      await refresh()
    },
  })

  return (
    <AppLayout
      bare
      syncing={syncing}
      onRefresh={() => void detail.refetch()}
      onSyncPrtg={() => prtg.mutate()}
      onSyncCloudnet={() => cloudnet.mutate()}
    >
      <div className="space-y-6">
        <div>
          <Link
            to="/schools"
            className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-blue-600 hover:text-blue-700"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver a locales
          </Link>
          <PageHeader
            icon={<GraduationCap className="h-5 w-5" />}
            title={assignment?.cid ? `CID ${assignment.cid}` : (school?.local_educativo ?? 'Detalle del local')}
            description={school?.local_educativo ?? undefined}
            badges={
              school ? (
                <>
                  <Badge tone={school.active ? 'success' : 'neutral'}>
                    {school.active ? <CircleCheck className="h-3 w-3" /> : null}
                    {school.active ? 'Activo' : 'Inactivo'}
                  </Badge>
                  {assignment?.tecnologia_acceso ? (
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${techBadgeClass(assignment.tecnologia_acceso)}`}>
                      <Network className="mr-1 h-3 w-3" />
                      {assignment.tecnologia_acceso}
                    </span>
                  ) : null}
                  <LocationMismatchBadge compact info={detail.data?.location} />
                </>
              ) : null
            }
            actions={
              school ? (
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="secondary" onClick={() => navigate(`/history/schools/${id}`)}>
                    <History className="h-3.5 w-3.5" aria-hidden />
                    Ver historial operativo
                  </Button>
                  {canManage ? (
                    <Button type="button" onClick={() => toggleActive.mutate()} loading={toggleActive.isPending}>
                      {school.active ? 'Desactivar local' : 'Reactivar local'}
                    </Button>
                  ) : null}
                </div>
              ) : null
            }
          />
        </div>

      {msg ? <p className="text-sm font-semibold text-emerald-600">{msg}</p> : null}

      {detail.isLoading ? <LoadingState /> : null}
      {detail.isError ? (
        <ErrorState message={detail.error instanceof Error ? detail.error.message : 'Error al cargar'} />
      ) : null}

      {school ? (
        <>
          <div className="flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-1.5 shadow-sm">
            {TABS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                  tab === t ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {tab === 'GENERAL' ? (
            <SectionCard title="Datos generales">
              <SchoolGeneralForm
                initial={{
                  current_sequence: school.current_sequence ?? null,
                  legacy_reference: school.legacy_reference ?? '',
                  codigo_local: school.codigo_local ?? '',
                  codigo_modular: school.codigo_modular ?? '',
                  local_educativo: school.local_educativo ?? '',
                  departamento: school.departamento ?? '',
                  provincia: school.provincia ?? '',
                  distrito: school.distrito ?? '',
                  centro_poblado: school.centro_poblado ?? '',
                  clasificacion: school.clasificacion ?? '',
                  nivel_iiee: school.nivel_iiee ?? '',
                }}
                saving={saveGeneral.isPending}
                readOnly={!canManage}
                onSubmit={(data) => saveGeneral.mutate(data)}
              />
            </SectionCard>
          ) : null}

          {tab === 'RED' ? (
            <SectionCard
              title="Asignación de red"
              action={
                canManage ? (
                  <button
                    type="button"
                    className="text-xs font-semibold text-amber-700 hover:underline"
                    onClick={() => setReassignMode((v) => !v)}
                  >
                    {reassignMode ? 'Cancelar reasignación' : 'Cambiar asignación CID'}
                  </button>
                ) : undefined
              }
            >
              {assignment || reassignMode ? (
                <NetworkAssignmentForm
                  key={`${assignment?.id ?? 'new'}-${reassignMode ? 're' : 'fix'}`}
                  mode={reassignMode ? 'reassign' : 'correct'}
                  initial={{
                    cid: assignment?.cid ?? '',
                    prtg_device_name: assignment?.prtg_device_name ?? '',
                    capacidad_mbps: String(assignment?.capacidad_mbps ?? ''),
                    tecnologia_acceso: assignment?.tecnologia_acceso ?? '',
                    nodo_pop: assignment?.nodo_pop ?? '',
                    ip_publica: assignment?.ip_publica ?? '',
                    ip_loopback: assignment?.ip_loopback ?? '',
                    ip_wan_principal: assignment?.ip_wan_principal ?? '',
                    ip_lan: assignment?.ip_lan ?? '',
                    gateway_wan: assignment?.gateway_wan ?? '',
                    vlan_internet: assignment?.vlan_internet ?? '',
                    vlan_uplink: assignment?.vlan_uplink ?? '',
                  }}
                  saving={saveAssignment.isPending || reassign.isPending}
                  readOnly={!canManage}
                  onSubmit={(data) => {
                    if (reassignMode) {
                      if (!data.cid) return
                      reassign.mutate({ ...data, cid: data.cid })
                    } else {
                      saveAssignment.mutate(data)
                    }
                  }}
                />
              ) : (
                <EmptyState title="Sin asignación activa" description="Usa Cambiar asignación CID para crear una." />
              )}
              {(school.network_assignments?.length ?? 0) > 1 ? (
                <div className="mt-4">
                  <h3 className="mb-2 text-sm font-semibold">Historial de asignaciones</h3>
                  <ul className="space-y-1 text-xs text-noc-muted">
                    {school.network_assignments?.map((a) => (
                      <li key={a.id}>
                        CID {a.cid ?? '—'} · {a.is_active ? 'ACTIVA' : 'cerrada'}
                        {a.valid_to ? ` · hasta ${formatDateTime(a.valid_to)}` : ''}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </SectionCard>
          ) : null}

          {tab === 'CONTACTOS' ? (
            <div className="space-y-4">
              <SectionCard title="Contactos (1–3)">
                <div className="space-y-3">
                  {contacts.map((c) => (
                    <ContactForm
                      key={c.id}
                      initial={{
                        id: c.id,
                        position: c.position ?? 1,
                        name: c.name,
                        role: c.role,
                        phone: c.phone,
                        validation_status: c.validation_status,
                      }}
                      saving={saveContact.isPending}
                      readOnly={!canManage}
                      onSubmit={(data) => saveContact.mutate({ id: c.id, data })}
                      onDeactivate={canManage ? () => deactivateContact.mutate(c.id) : undefined}
                    />
                  ))}
                  {canManage && contacts.length < 3 ? (
                    <ContactForm
                      initial={{ position: (contacts.length + 1) as 1 | 2 | 3, name: '', role: '', phone: '' }}
                      saving={saveContact.isPending}
                      onSubmit={(data) => saveContact.mutate({ data })}
                    />
                  ) : null}
                </div>
              </SectionCard>
            </div>
          ) : null}

          {tab === 'PRTG' ? (
            <SectionCard title="PRTG (solo monitoreo)">
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs uppercase text-noc-muted">Estado Ping</dt>
                  <dd><PrtgStatusBadge status={prtgSummary?.ping_status ?? null} /></dd>
                </div>
                <div>
                  <dt className="text-xs uppercase text-noc-muted">Último check</dt>
                  <dd>{prtgSummary?.last_check ? formatDateTime(prtgSummary.last_check) : '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase text-noc-muted">Sensores</dt>
                  <dd>{prtgSummary?.sensor_count ?? 0}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase text-noc-muted">Dispositivo</dt>
                  <dd className="truncate">{prtgSummary?.device_name ?? '—'}</dd>
                </div>
              </dl>
              <p className="mt-3 text-xs text-noc-muted">PRTG no sobrescribe datos maestros del CRUD.</p>
            </SectionCard>
          ) : null}

          {tab === 'CLOUDNET' ? (
            <SectionCard title="Cloudnet (solo monitoreo)">
              {cloudnetSites.length === 0 ? (
                <EmptyState title="Sin site Cloudnet" description="No hay shop vinculado." />
              ) : (
                <ul className="space-y-3 text-sm">
                  {cloudnetSites.map((site) => (
                    <li key={site.id} className="rounded-lg border border-noc-border/60 p-3">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <p className="truncate font-medium">{site.site_name ?? String(site.shop_id)}</p>
                        <CloudnetStatusBadge
                          status={String(site.match_status ?? '').startsWith('MATCHED') ? 'ONLINE' : 'UNKNOWN'}
                        />
                      </div>
                      <p className="text-xs text-noc-muted">Shop ID: {site.shop_id}</p>
                      <p className="text-xs text-noc-muted">Match: {site.match_status ?? '—'}</p>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>
          ) : null}

          {tab === 'INCIDENCIAS' ? (
            <SectionCard title="Incidencia activa">
              {incident ? (
                <dl className="grid gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-xs uppercase text-noc-muted">Seguimiento</dt>
                    <dd><FollowupBadge status={incident.followup_status} /></dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase text-noc-muted">Desde</dt>
                    <dd>{incident.started_at ? formatDateTime(incident.started_at) : '—'}</dd>
                  </div>
                </dl>
              ) : (
                <p className="text-sm text-noc-muted">Sin incidencia activa</p>
              )}
            </SectionCard>
          ) : null}

          {tab === 'HISTORIAL' ? (
            <SectionCard
              title="Historial de incidencias"
              action={
                <Link
                  to={`/history/schools/${id}`}
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-700 hover:underline"
                >
                  <History className="h-3.5 w-3.5" aria-hidden />
                  Historial operativo completo
                </Link>
              }
            >
              {history.length === 0 ? (
                <EmptyState title="Sin historial" description="Aún no hay incidencias." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="text-xs uppercase text-noc-muted">
                      <tr>
                        <th className="px-2 py-2">Inicio</th>
                        <th className="px-2 py-2">Recuperación</th>
                        <th className="px-2 py-2">Seguimiento</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((row) => (
                        <tr key={row.id} className="border-t border-noc-border/70">
                          <td className="px-2 py-2">{row.started_at ? formatDateTime(row.started_at) : '—'}</td>
                          <td className="px-2 py-2">{row.recovered_at ? formatDateTime(row.recovered_at) : 'Activa'}</td>
                          <td className="px-2 py-2"><FollowupBadge status={row.followup_status} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>
          ) : null}

          {tab === 'AUDITORÍA' ? (
            <SectionCard title="Auditoría">
              {auditLogs.length === 0 ? (
                <EmptyState title="Sin eventos" description="Las ediciones CRUD aparecerán aquí." />
              ) : (
                <ul className="space-y-2 text-sm">
                  {auditLogs.map((log) => (
                    <li key={log.id} className="rounded-xl border border-noc-border/70 px-3 py-2">
                      <div className="flex flex-wrap gap-2 text-xs text-noc-muted">
                        <span>{log.created_at ? formatDateTime(log.created_at) : '—'}</span>
                        {log.user_name ? <span className="font-medium text-slate-700">{log.user_name}</span> : null}
                        {log.module ? <span className="rounded bg-slate-100 px-1.5 py-0.5 font-semibold text-slate-600">{log.module}</span> : null}
                        <span className="font-semibold text-noc-text">{log.action}</span>
                        <span>{log.entity_type} #{log.entity_id}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>
          ) : null}
        </>
      ) : null}
      </div>
    </AppLayout>
  )
}

type SchoolRecord = {
  id: number
  active?: boolean
  local_educativo?: string | null
  codigo_local?: string | null
  codigo_modular?: string | null
  current_sequence?: number | null
  legacy_reference?: string | null
  departamento?: string | null
  provincia?: string | null
  distrito?: string | null
  centro_poblado?: string | null
  clasificacion?: string | null
  nivel_iiee?: string | null
  contacts?: SchoolContact[]
  active_assignment?: NetworkAssignment | null
  network_assignments?: Array<{
    id: number
    cid?: string | null
    is_active?: boolean
    valid_to?: string | null
  }>
}

type SchoolContact = {
  id: number
  position?: number
  name?: string | null
  role?: string | null
  phone?: string | null
  validation_status?: string | null
}

type NetworkAssignment = {
  id: number
  cid?: string | null
  cid_status?: string | null
  tecnologia_acceso?: string | null
  nodo_pop?: string | null
  ip_publica?: string | null
  ip_loopback?: string | null
  ip_wan_principal?: string | null
  ip_lan?: string | null
  gateway_wan?: string | null
  vlan_internet?: string | null
  vlan_uplink?: string | null
  prtg_device_name?: string | null
  capacidad_mbps?: string | number | null
}

type IncidentHistoryRow = {
  id: number
  started_at?: string | null
  recovered_at?: string | null
  followup_status?: string | null
}

type CloudnetSiteRow = {
  id: number
  shop_id?: string | number
  site_name?: string | null
  match_status?: string | null
  last_synced_at?: string | null
}

type AuditRow = {
  id: number
  entity_type: string
  entity_id: number
  action: string
  module?: string | null
  user_id?: number | null
  user_name?: string | null
  created_at?: string | null
}
