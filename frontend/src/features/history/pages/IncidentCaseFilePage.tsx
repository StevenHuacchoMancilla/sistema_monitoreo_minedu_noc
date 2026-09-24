import { useMemo, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'
import {
  Activity,
  ChevronRight,
  CircleCheck,
  Clock3,
  FileText,
  History,
  Lock,
  MessageSquare,
  Phone,
  PhoneOff,
  Printer,
  School,
  Ticket,
  TriangleAlert,
  Truck,
  UserRound,
  Users,
  Wrench,
} from 'lucide-react'
import { AppLayout } from '../../../layouts/AppLayout'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Button } from '../../../components/ui/Button'
import { Badge } from '../../../components/ui/SoftBadge'
import { EmptyState, ErrorState, LoadingState } from '../../../components/ui/States'
import { FOLLOWUP_LABELS } from '../../../components/ui/Badge'
import {
  CaseStatusBadge,
  ContactOutcomeBadge,
  PrtgStatusBadge,
} from '../../../components/monitoring/StatusBadges'
import { formatDate, formatDateTime, formatTime } from '../../../lib/datetime'
import type { StatusTone } from '../../../lib/uiTokens'
import { trackingStatusTone } from '../../tracking/lib/trackingStatus'
import { RecoveryReviewPanel } from '../../recoveries/components/RecoveryReviewPanel'
import { FieldDispatchPanel } from '../../incidents/components/FieldDispatchPanel'
import { fetchIncidentCaseFile } from '../api/historyApi'
import type { CaseTimelineEvent, CaseTimelineGroup, IncidentCaseFile } from '../types/history'

const GROUPS: Array<{ value: CaseTimelineGroup | 'ALL'; label: string }> = [
  { value: 'ALL', label: 'Todo' },
  { value: 'GESTION', label: 'Gestión' },
  { value: 'TRACKING', label: 'Tracking' },
  { value: 'CAMPO', label: 'Campo' },
  { value: 'REVISION', label: 'Revisión' },
  { value: 'SISTEMA', label: 'Sistema' },
]

const GROUP_TONE: Record<CaseTimelineGroup, StatusTone> = {
  GESTION: 'info',
  TRACKING: 'indigo',
  CAMPO: 'cyan',
  REVISION: 'warning',
  SISTEMA: 'neutral',
}

const GROUP_DOT: Record<CaseTimelineGroup, string> = {
  GESTION: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300',
  TRACKING:
    'border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950 dark:text-indigo-300',
  CAMPO: 'border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-800 dark:bg-cyan-950 dark:text-cyan-300',
  REVISION:
    'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300',
  SISTEMA:
    'border-slate-200 bg-white text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400',
}

const ICONS: Record<string, LucideIcon> = {
  phone: Phone,
  phone_missed: PhoneOff,
  message: MessageSquare,
  wrench: Wrench,
  check: CircleCheck,
  activity: Activity,
  alert: TriangleAlert,
  truck: Truck,
  ticket: Ticket,
  lock: Lock,
}

export function IncidentCaseFilePage() {
  const params = useParams()
  const incidentId = Number(params.incidentId)
  const valid = Number.isFinite(incidentId) && incidentId > 0

  const caseFile = useQuery({
    queryKey: ['incidents', incidentId, 'case-file'],
    queryFn: () => fetchIncidentCaseFile(incidentId),
    enabled: valid,
    staleTime: 30_000,
  })

  const data = caseFile.data

  return (
    <AppLayout bare onRefresh={() => void caseFile.refetch()}>
      {!valid ? <ErrorState message="Incidencia no válida." /> : null}
      {caseFile.isLoading ? <LoadingState /> : null}
      {caseFile.isError ? (
        <ErrorState message={caseFile.error instanceof Error ? caseFile.error.message : 'Error'} />
      ) : null}
      {data ? <CaseFileContent data={data} /> : null}
    </AppLayout>
  )
}

function CaseFileContent({ data }: { data: IncidentCaseFile }) {
  const { incident, gestion, recovery, school, prtg, tracking } = data
  const schoolId = school.id

  return (
    <>
      <PageHeader
        icon={<FileText className="h-5 w-5" aria-hidden />}
        breadcrumb={
          <nav className="flex flex-wrap items-center gap-1 text-xs font-medium text-slate-500 dark:text-slate-400">
            <Link to="/history/schools" className="hover:text-blue-700 dark:hover:text-blue-300">
              Historial por colegio
            </Link>
            <ChevronRight className="h-3 w-3" aria-hidden />
            {schoolId ? (
              <Link
                to={`/history/schools/${schoolId}`}
                className="max-w-[16rem] truncate hover:text-blue-700 dark:hover:text-blue-300"
              >
                {school.local_educativo ?? `Colegio #${schoolId}`}
              </Link>
            ) : null}
            <ChevronRight className="h-3 w-3" aria-hidden />
            <span className="text-slate-700 dark:text-slate-200">Incidencia #{incident.id}</span>
          </nav>
        }
        title={`Incidencia #${incident.id}`}
        badges={
          <>
            <CaseStatusBadge status={incident.case_status} />
            {incident.reincidencia.label ? <Badge tone="neutral">{incident.reincidencia.label}</Badge> : null}
          </>
        }
        description={[
          school.cid ? `CID ${school.cid}` : null,
          school.codigo_local,
          school.local_educativo,
          [school.distrito, school.provincia].filter(Boolean).join(', ') || null,
        ]
          .filter(Boolean)
          .join(' · ')}
        actions={
          <>
            {schoolId ? (
              <HeaderLink to={`/history/schools/${schoolId}`} icon={<History className="h-3.5 w-3.5" />}>
                Historial del colegio
              </HeaderLink>
            ) : null}
            {tracking ? (
              <HeaderLink to={`/tracking/${tracking.id}`} icon={<Ticket className="h-3.5 w-3.5" />}>
                Abrir Tracking
              </HeaderLink>
            ) : null}
            {schoolId ? (
              <HeaderLink to={`/schools/${schoolId}`} icon={<School className="h-3.5 w-3.5" />}>
                Ficha maestra
              </HeaderLink>
            ) : null}
            <Button type="button" size="sm" variant="ghost" onClick={() => window.print()}>
              <Printer className="h-3.5 w-3.5" aria-hidden />
              Imprimir
            </Button>
          </>
        }
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        <SummaryTile label="Caída (fecha · hora)" icon={<TriangleAlert className="h-4 w-4" />} tone="danger">
          <DateTimeValue value={incident.started_at} />
        </SummaryTile>
        <SummaryTile label="Recuperación (fecha · hora)" icon={<CircleCheck className="h-4 w-4" />} tone="success">
          {incident.recovered_at ? (
            <DateTimeValue value={incident.recovered_at} hint={incident.same_day ? 'Mismo día' : undefined} />
          ) : (
            <span className="font-semibold text-red-700 dark:text-red-400">Sigue caída</span>
          )}
        </SummaryTile>
        <SummaryTile label="Duración" icon={<Clock3 className="h-4 w-4" />}>
          <span className="font-semibold tabular-nums">{incident.duration ?? '—'}</span>
        </SummaryTile>
        <SummaryTile label="Gestiones" icon={<Phone className="h-4 w-4" />} tone="info">
          <span className="font-semibold tabular-nums">{gestion.managements_count}</span>
          <span className="ml-1.5">
            <ContactOutcomeBadge classification={gestion.classification} label={gestion.classification_label} />
          </span>
        </SummaryTile>
        <SummaryTile label="Tracking" icon={<Ticket className="h-4 w-4" />} tone="indigo">
          {tracking ? (
            <span className="flex flex-col gap-1">
              <span className="truncate font-semibold tabular-nums">{tracking.ticket ?? 'Sin ticket'}</span>
              <Badge tone={trackingStatusTone(tracking.status)}>{tracking.status_label ?? tracking.status}</Badge>
            </span>
          ) : (
            <span className="text-slate-400">Sin Tracking</span>
          )}
        </SummaryTile>
        <SummaryTile label="Cerrado por" icon={<Lock className="h-4 w-4" />}>
          {tracking?.closed_at ? (
            <span className="flex flex-col">
              <span className="truncate font-semibold">{tracking.closed_by_name ?? '—'}</span>
              <span className="text-[11px] text-slate-500 tabular-nums">{formatDateTime(tracking.closed_at)}</span>
            </span>
          ) : (
            <span className="text-slate-400">Abierto</span>
          )}
        </SummaryTile>
      </div>

      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-5">
          <CaseSummary data={data} />
          <CaseTimeline events={data.timeline} />
        </div>

        <aside className="min-w-0 space-y-5">
          <Panel title="Participantes" icon={<Users className="h-4 w-4" />}>
            {data.participants.length === 0 ? (
              <p className="text-[13px] text-slate-500">Solo hay eventos automáticos del sistema.</p>
            ) : (
              <ul className="space-y-2.5">
                {data.participants.map((p) => (
                  <li key={p.name} className="flex items-start gap-2.5">
                    <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      <UserRound className="h-3.5 w-3.5" aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-semibold text-slate-900 dark:text-slate-100">{p.name}</p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        {p.roles.join(' · ')} · {p.events} evento{p.events === 1 ? '' : 's'}
                      </p>
                      <p className="text-[11px] tabular-nums text-slate-400">Último: {formatDateTime(p.last_at)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {tracking ? (
            <Panel title="Tracking" icon={<Ticket className="h-4 w-4" />}>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
                <Field label="Ticket" value={tracking.ticket} />
                <Field label="Caso" value={tracking.case_code} />
                <Field
                  label="Estado"
                  value={<Badge tone={trackingStatusTone(tracking.status)}>{tracking.status_label}</Badge>}
                />
                <Field label="Seguimientos" value={String(tracking.updates_count)} />
                <Field label="Abierto por" value={tracking.opened_by_name} />
                <Field label="Apertura (fecha · hora)" value={formatDateTime(tracking.opened_at)} />
                <Field label="Cerrado por" value={tracking.closed_by_name} />
                <Field label="Cierre (fecha · hora)" value={tracking.closed_at ? formatDateTime(tracking.closed_at) : null} />
              </dl>
              {tracking.closing_note ? (
                <div className="mt-3">
                  <Note label="Nota de cierre" text={tracking.closing_note} />
                </div>
              ) : null}
            </Panel>
          ) : null}

          <Panel title="Colegio y red" icon={<School className="h-4 w-4" />}>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
              <Field label="CID" value={school.cid} />
              <Field label="Código local" value={school.codigo_local} />
              <Field label="Tecnología" value={school.tecnologia} />
              <Field label="Capacidad" value={school.capacidad_mbps ? `${school.capacidad_mbps} Mbps` : null} />
              <Field label="Nodo / POP" value={school.nodo_pop} />
              <Field label="Distrito" value={school.distrito} />
              <Field label="Equipo PRTG" value={school.prtg_device_name} wide />
            </dl>
          </Panel>

          <Panel title="Monitoreo PRTG actual" icon={<Activity className="h-4 w-4" />}>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
              <Field label="Estado" value={<PrtgStatusBadge status={prtg.estado} />} />
              <Field label="Sensor" value={prtg.sensor_objid != null ? String(prtg.sensor_objid) : null} />
              <Field label="Texto" value={prtg.estado_texto} wide />
              <Field label="Última lectura" value={formatDateTime(prtg.last_check)} wide />
            </dl>
          </Panel>

          {incident.recovered_at ? (
            <RecoveryReviewPanel
              incidentId={incident.id}
              requiresReview={recovery.requires_review}
              recoveredWhileManaging={recovery.recovered_while_managing}
              reviewStatus={recovery.review_status}
              reviewLabel={recovery.review_label}
              reviewedAt={recovery.reviewed_at}
              hadFieldTech={recovery.had_field_tech || recovery.has_active_dispatch}
              hasActiveDispatch={recovery.has_active_dispatch}
            />
          ) : null}

          <FieldDispatchPanel
            incidentId={incident.id}
            active={Boolean(incident.recovered_at)}
            dispatch={data.field_dispatch}
            history={data.field_dispatches}
          />
        </aside>
      </div>
    </>
  )
}

function CaseSummary({ data }: { data: IncidentCaseFile }) {
  const { gestion, recovery, tracking } = data
  const notes: Array<{ label: string; text: string | null | undefined }> = [
    { label: 'Motivo de la caída', text: gestion.outage_text },
    { label: 'Detalle de la gestión', text: gestion.detail_text },
    { label: 'Diagnóstico', text: gestion.diagnosis },
    { label: 'Causa', text: gestion.cause },
    { label: 'Motivo de recuperación', text: recovery.recovery_note },
    { label: 'Nota de cierre (Tracking)', text: tracking?.closing_note },
    { label: 'Resultado del contacto', text: gestion.contact_result },
    { label: 'Evidencias / observaciones', text: gestion.evidence_observations },
  ]
  const filled = notes.filter((n) => n.text && n.text.trim() !== '')

  return (
    <Panel title="Resumen del caso" icon={<FileText className="h-4 w-4" />}>
      <dl className="mb-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
        <Field label="Seguimiento" value={data.incident.followup_label} />
        <Field label="PEXT / PINT" value={gestion.scope} />
        <Field label="Área responsable" value={gestion.responsible_area} />
        <Field label="Ticket GLPI" value={gestion.glpi_ticket} />
        <Field label="Último contacto" value={gestion.last_contact_at ? formatDateTime(gestion.last_contact_at) : null} />
        <Field
          label="Revisión recuperación"
          value={recovery.review_label ?? (recovery.requires_review ? 'Pendiente' : null)}
        />
        <Field label="Recuperó en gestión" value={recovery.recovered_while_managing ? 'Sí' : 'No'} />
        <Field label="Técnico en campo" value={recovery.had_field_tech ? 'Sí' : 'No'} />
      </dl>
      {filled.length === 0 ? (
        <p className="text-[13px] text-slate-500">Aún no se registraron motivos ni notas para esta incidencia.</p>
      ) : (
        <div className="grid gap-2.5 md:grid-cols-2">
          {filled.map((n) => (
            <Note key={n.label} label={n.label} text={n.text as string} />
          ))}
        </div>
      )}
    </Panel>
  )
}

function CaseTimeline({ events }: { events: CaseTimelineEvent[] }) {
  const [group, setGroup] = useState<CaseTimelineGroup | 'ALL'>('ALL')

  const counts = useMemo(() => {
    const out: Record<string, number> = { ALL: events.length }
    for (const e of events) out[e.group] = (out[e.group] ?? 0) + 1
    return out
  }, [events])

  const days = useMemo(() => {
    const filtered = group === 'ALL' ? events : events.filter((e) => e.group === group)
    const byDay = new Map<string, CaseTimelineEvent[]>()
    for (const e of filtered) {
      const key = formatDate(e.at)
      const list = byDay.get(key)
      if (list) list.push(e)
      else byDay.set(key, [e])
    }
    return [...byDay.entries()]
  }, [events, group])

  return (
    <Panel
      title="Historial completo del caso"
      icon={<History className="h-4 w-4" />}
      action={
        <div className="flex flex-wrap gap-1">
          {GROUPS.filter((g) => g.value === 'ALL' || counts[g.value]).map((g) => (
            <button
              key={g.value}
              type="button"
              onClick={() => setGroup(g.value)}
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                group === g.value
                  ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
              }`}
            >
              {g.label} <span className="tabular-nums opacity-70">{counts[g.value] ?? 0}</span>
            </button>
          ))}
        </div>
      }
    >
      {days.length === 0 ? (
        <EmptyState title="Sin eventos" description="No hay eventos registrados para este filtro." />
      ) : (
        <div className="space-y-5">
          {days.map(([day, dayEvents]) => (
            <section key={day}>
              <p className="mb-2 text-[11px] font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">
                {day}
              </p>
              <ol className="relative ml-2.5 border-l border-slate-200 dark:border-slate-800">
                {dayEvents.map((event) => (
                  <TimelineItem key={event.id} event={event} />
                ))}
              </ol>
            </section>
          ))}
        </div>
      )}
    </Panel>
  )
}

function TimelineItem({ event }: { event: CaseTimelineEvent }) {
  const Icon = ICONS[event.icon] ?? Activity
  const before = event.status_before ? FOLLOWUP_LABELS[event.status_before] ?? event.status_before : null
  const after = event.status_after ? FOLLOWUP_LABELS[event.status_after] ?? event.status_after : null

  return (
    <li className="relative pb-4 pl-6 last:pb-0">
      <span
        className={`absolute top-0 -left-[11px] inline-flex h-[22px] w-[22px] items-center justify-center rounded-full border ${GROUP_DOT[event.group]}`}
      >
        <Icon className="h-3 w-3" aria-hidden />
      </span>
      <div className="min-w-0 rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2 dark:border-slate-800 dark:bg-slate-800/40">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <time className="text-[11px] font-semibold tabular-nums text-slate-500 dark:text-slate-400">
            {formatTime(event.at)}
          </time>
          <p className="text-[13px] font-semibold text-slate-900 dark:text-slate-100">{event.title}</p>
          <Badge tone={GROUP_TONE[event.group]}>{event.role}</Badge>
        </div>
        <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
          Por <span className="font-medium text-slate-700 dark:text-slate-300">{event.actor ?? 'Sistema'}</span>
        </p>
        {event.detail ? (
          <p className="mt-1 text-[13px] whitespace-pre-line text-slate-700 dark:text-slate-300">{event.detail}</p>
        ) : null}
        {before || after ? (
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            Estado: {before ?? '—'} → <span className="font-semibold">{after ?? '—'}</span>
          </p>
        ) : null}
        {event.contact ? (
          <p className="mt-1.5 inline-flex flex-wrap items-center gap-1.5 rounded-md bg-white px-2 py-1 text-[11px] text-slate-600 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700">
            <Phone className="h-3 w-3" aria-hidden />
            {[event.contact.name, event.contact.role].filter(Boolean).join(' · ') || 'Contacto sin nombre'}
            {event.contact.phone ? <span className="tabular-nums">· {event.contact.phone}</span> : null}
          </p>
        ) : null}
      </div>
    </li>
  )
}

function Panel({
  title,
  icon,
  action,
  children,
}: {
  title: string
  icon?: ReactNode
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
          {icon ? <span className="text-slate-400">{icon}</span> : null}
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  )
}

function SummaryTile({
  label,
  icon,
  tone = 'neutral',
  children,
}: {
  label: string
  icon: ReactNode
  tone?: StatusTone
  children: ReactNode
}) {
  const toneClass: Record<StatusTone, string> = {
    success: 'text-emerald-600 dark:text-emerald-400',
    warning: 'text-amber-600 dark:text-amber-400',
    danger: 'text-red-600 dark:text-red-400',
    info: 'text-blue-600 dark:text-blue-400',
    cyan: 'text-cyan-600 dark:text-cyan-400',
    indigo: 'text-indigo-600 dark:text-indigo-400',
    neutral: 'text-slate-500 dark:text-slate-400',
  }
  return (
    <div className="min-w-0 rounded-xl border border-slate-200 bg-white px-3.5 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">
        <span className={toneClass[tone]}>{icon}</span>
        {label}
      </p>
      <div className="mt-1.5 min-w-0 text-[13px] text-slate-900 dark:text-slate-100">{children}</div>
    </div>
  )
}

function DateTimeValue({ value, hint }: { value: string | null; hint?: string }) {
  if (!value) return <span className="text-slate-400">—</span>
  return (
    <span className="flex flex-col leading-tight">
      <span className="font-semibold tabular-nums">{formatDate(value)}</span>
      <span className="text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
        {formatTime(value)}
        {hint ? ` · ${hint}` : ''}
      </span>
    </span>
  )
}

function Field({ label, value, wide = false }: { label: string; value: ReactNode; wide?: boolean }) {
  const empty = value == null || value === '' || value === '—'
  return (
    <div className={`min-w-0 ${wide ? 'col-span-2' : ''}`}>
      <dt className="text-[10.5px] font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">
        {label}
      </dt>
      <dd className="mt-0.5 truncate text-[13px] text-slate-900 dark:text-slate-100">
        {empty ? <span className="text-slate-400">—</span> : value}
      </dd>
    </div>
  )
}

function Note({ label, text }: { label: string; text: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2 dark:border-slate-700 dark:bg-slate-800/40">
      <p className="text-[10.5px] font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">{label}</p>
      <p className="mt-0.5 text-[13px] whitespace-pre-line text-slate-800 dark:text-slate-200">{text}</p>
    </div>
  )
}

function HeaderLink({ to, icon, children }: { to: string; icon: ReactNode; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[13px] font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
    >
      {icon}
      {children}
    </Link>
  )
}
