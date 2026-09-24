import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, ClipboardList, ExternalLink, MapPin, Phone, Radio, X } from 'lucide-react'
import { endpoints } from '../../../api/endpoints'
import { ClassificationBadge, FollowupBadge, PrtgStatusBadge } from '../../../components/monitoring/StatusBadges'
import { Badge } from '../../../components/ui/SoftBadge'
import { Button } from '../../../components/ui/Button'
import { IconButton } from '../../../components/ui/IconButton'
import { FormField, Select } from '../../../components/ui/FormControls'
import { ErrorState, LoadingState } from '../../../components/ui/States'
import { inputClassName } from '../../../lib/uiTokens'
import { formatDateTime, formatDuration } from '../../../lib/datetime'
import { useNow } from '../../../lib/useNow'
import type { ManagementPayload } from '../../reports/types/operationalReport'
import { trackingStatusTone } from '../../tracking/lib/trackingStatus'
import { incidentCaseFilePath } from '../../history/api/historyApi'
import { VoiceDictationButton } from '../../voice/components/VoiceDictationButton'
import { FieldDispatchPanel } from './FieldDispatchPanel'
import type { IncidentDetail } from '../../../types/api'

type TabKey = 'summary' | 'management' | 'dispatch' | 'history'

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'summary', label: 'Resumen' },
  { key: 'management', label: 'Contacto y gestión' },
  { key: 'dispatch', label: 'Desplazamiento' },
  { key: 'history', label: 'Historial' },
]

const TIMELINE_PAGE = 15

const RESULT_OPTIONS: Array<{
  value: ManagementPayload['classification']
  label: string
  hint: string
  selected: string
}> = [
  {
    value: 'CONTACT_CONFIRMED',
    label: 'Contacto confirmado',
    hint: 'Se confirmó la situación con el local',
    selected: 'border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/40',
  },
  {
    value: 'NO_RESPONSE',
    label: 'Sin respuesta',
    hint: 'No fue posible contactar; sigue caído',
    selected: 'border-orange-300 bg-orange-50 dark:border-orange-800 dark:bg-orange-950/40',
  },
  {
    value: 'COMPLAINT',
    label: 'Queja / reclamo',
    hint: 'El local reportó una queja o reclamo',
    selected: 'border-blue-300 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/40',
  },
]

const panelClass =
  'rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900'
const panelTitleClass =
  'mb-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-slate-900 dark:text-slate-100'
const textareaClass = `${inputClassName} !h-auto min-h-20 resize-y py-2`

function Panel({ title, icon, action, children }: { title: string; icon?: ReactNode; action?: ReactNode; children: ReactNode }) {
  return (
    <section className={panelClass}>
      <div className="flex items-start justify-between gap-2">
        <h3 className={panelTitleClass}>
          {icon}
          {title}
        </h3>
        {action}
      </div>
      {children}
    </section>
  )
}

function KeyValue({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">{label}</dt>
      <dd className="mt-0.5 truncate text-[13px] text-slate-900 dark:text-slate-100">{children ?? '—'}</dd>
    </div>
  )
}

function durationSeconds(estado: IncidentDetail['estado'], now: number): number | null {
  if (!estado.fecha_caida) return estado.duracion_segundos
  const start = Date.parse(estado.fecha_caida)
  if (Number.isNaN(start)) return estado.duracion_segundos
  const end = estado.recovered_at ? Date.parse(estado.recovered_at) : now
  return Math.max(0, Math.floor((end - start) / 1000))
}

export function IncidentManageModal({
  incidentId,
  onClose,
  initialTab = 'summary',
  readOnly = false,
}: {
  incidentId: number
  onClose: () => void
  initialTab?: TabKey
  readOnly?: boolean
}) {
  const client = useQueryClient()
  const titleId = useId()
  const closeRef = useRef<HTMLButtonElement>(null)
  const now = useNow()
  const [tab, setTab] = useState<TabKey>(initialTab)

  const detail = useQuery({
    queryKey: ['incidents', incidentId],
    queryFn: () => endpoints.incidentDetail(incidentId),
  })

  const [classification, setClassification] = useState<ManagementPayload['classification'] | ''>('')
  const [scope, setScope] = useState<'' | 'PEXT' | 'PINT'>('')
  const [contactId, setContactId] = useState<number | ''>('')
  const [detailText, setDetailText] = useState('')
  const [observation, setObservation] = useState('')
  const [savedMsg, setSavedMsg] = useState<string | null>(null)

  // Hidratar una sola vez: los refetch traen duraciones nuevas y no deben pisar lo que se escribe.
  const hydrated = useRef(false)
  useEffect(() => {
    if (!detail.data || hydrated.current) return
    hydrated.current = true
    const g = detail.data.gestion
    const current = g.management_classification
    setClassification(current === 'CONTACT_CONFIRMED' || current === 'NO_RESPONSE' || current === 'COMPLAINT' ? current : '')
    setScope((g.management_scope as '' | 'PEXT' | 'PINT') || '')
    setContactId(g.last_managed_contact_id ?? '')
    setDetailText(g.detail_text ?? '')
    setObservation('')
  }, [detail.data])

  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  // Solo al montar: el padre recrea onClose en cada refresco y no debe robar el foco.
  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current()
    }
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = previousOverflow
    }
  }, [])

  const save = useMutation({
    mutationFn: () => {
      if (!classification) throw new Error('Selecciona un resultado de gestión')
      return endpoints.applyIncidentManagement(incidentId, {
        classification,
        scope: scope || null,
        outage_text: null,
        detail: detailText || null,
        observation: observation || null,
        contact_id: contactId === '' ? null : Number(contactId),
      })
    },
    onSuccess: async (data) => {
      const sync = data.tracking_sync
      const ref = sync ? `#${sync.incident_number ?? sync.tracking_id}` : ''
      setSavedMsg(
        sync?.created
          ? `Gestión registrada · Tracking ${ref} abierto`
          : sync
            ? `Gestión registrada · Tracking ${ref} actualizado`
            : 'Gestión registrada',
      )
      hydrated.current = false
      client.setQueryData(['incidents', incidentId], data)
      await Promise.all([
        client.invalidateQueries({ queryKey: ['dashboard'] }),
        client.invalidateQueries({ queryKey: ['reports'] }),
        client.invalidateQueries({ queryKey: ['tracking'] }),
      ])
      window.setTimeout(() => setSavedMsg(null), 3500)
    },
  })

  const data = detail.data
  const seconds = data ? durationSeconds(data.estado, now) : null
  const recovered = Boolean(data?.estado.recovered_at)

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        tabIndex={-1}
        aria-label="Cerrar panel"
        className="absolute inset-0 cursor-default bg-slate-950/40 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 flex h-full w-full flex-col border-l border-slate-200 bg-slate-50 shadow-2xl sm:w-[min(900px,90vw)] dark:border-slate-800 dark:bg-slate-950"
      >
        <header className="shrink-0 border-b border-slate-200 bg-white px-5 py-3.5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 id={titleId} className="truncate text-base font-bold text-slate-950 dark:text-slate-50">
                {data?.colegio.cid ? `CID ${data.colegio.cid}` : `Incidencia #${incidentId}`}
                {data?.colegio.local_educativo ? (
                  <span className="font-medium text-slate-500 dark:text-slate-400"> · {data.colegio.local_educativo}</span>
                ) : null}
              </h2>
              {data ? (
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <PrtgStatusBadge status={data.estado.estado_prtg} />
                  <Badge tone={recovered ? 'success' : 'danger'} title={recovered ? 'Duración total de la caída' : 'Tiempo caído hasta ahora'}>
                    {recovered ? 'Duró' : 'Caído'} {formatDuration(seconds)}
                  </Badge>
                  {data.active_tracking ? (
                    <Badge tone={trackingStatusTone(data.active_tracking.status)} title="Estado del Tracking vinculado">
                      Tracking · {data.active_tracking.status_label ?? data.active_tracking.status}
                    </Badge>
                  ) : (
                    <Badge tone="neutral" title="Se abre al guardar la primera gestión">
                      Sin Tracking
                    </Badge>
                  )}
                </div>
              ) : null}
            </div>
            <IconButton
              ref={closeRef}
              label="Cerrar"
              onClick={onClose}
              className="focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none"
            >
              <X className="h-4 w-4" aria-hidden />
            </IconButton>
          </div>

          {data ? <SummaryBand data={data} /> : null}

          <div role="tablist" aria-label="Secciones de la incidencia" className="-mb-3.5 mt-3 flex gap-1 overflow-x-auto">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                id={`${titleId}-tab-${t.key}`}
                aria-selected={tab === t.key}
                aria-controls={`${titleId}-panel`}
                onClick={() => setTab(t.key)}
                className={`shrink-0 border-b-2 px-3 py-2 text-[13px] font-semibold whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none ${
                  tab === t.key
                    ? 'border-blue-600 text-blue-700 dark:border-blue-400 dark:text-blue-300'
                    : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </header>

        <div
          id={`${titleId}-panel`}
          role="tabpanel"
          aria-labelledby={`${titleId}-tab-${tab}`}
          className="min-h-0 flex-1 overflow-y-auto px-5 py-4"
        >
          {detail.isLoading ? <LoadingState /> : null}
          {detail.isError ? <ErrorState message={detail.error instanceof Error ? detail.error.message : 'Error'} /> : null}

          {data && tab === 'summary' ? <SummaryTab data={data} onNavigate={onClose} /> : null}

          {data && tab === 'management' ? (
            <div className="space-y-4">
              <ContactsPanel contacts={data.contactos} />
              {readOnly ? (
                <Panel title="Gestión">
                  <p className="text-[13px] text-slate-600 dark:text-slate-300">
                    Tu rol solo permite consulta. Las gestiones se registran con ADMIN o NOC_OPERATOR.
                  </p>
                  <div className="mt-3">
                    <RecentManagements managements={data.managements ?? []} />
                  </div>
                </Panel>
              ) : (
                <>
              <Panel title="Resultado de gestión">
                <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Resultado de gestión">
                  {RESULT_OPTIONS.map((opt) => (
                    <label
                      key={opt.value}
                      className={`flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-blue-500 ${
                        classification === opt.value
                          ? opt.selected
                          : 'border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800'
                      }`}
                    >
                      <input
                        type="radio"
                        className="mt-0.5"
                        name={`${titleId}-result`}
                        checked={classification === opt.value}
                        onChange={() => setClassification(opt.value)}
                      />
                      <span className="min-w-0">
                        <span className="block text-[13px] font-semibold text-slate-900 dark:text-slate-100">{opt.label}</span>
                        <span className="block text-[11px] text-slate-500 dark:text-slate-400">{opt.hint}</span>
                      </span>
                    </label>
                  ))}
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <FormField label="Contacto utilizado">
                    <Select value={contactId} onChange={(e) => setContactId(e.target.value ? Number(e.target.value) : '')}>
                      <option value="">— Sin seleccionar —</option>
                      {data.contactos.map((c, idx) => (
                        <option key={c.id} value={c.id}>
                          {idx + 1}. {c.nombre ?? 'Sin nombre'} · {c.telefono ?? 's/n'}
                        </option>
                      ))}
                    </Select>
                  </FormField>
                  <FormField label="PEXT / PINT">
                    <Select value={scope} onChange={(e) => setScope(e.target.value as '' | 'PEXT' | 'PINT')}>
                      <option value="">— Sin definir —</option>
                      <option value="PEXT">PEXT (externo)</option>
                      <option value="PINT">PINT (interno)</option>
                    </Select>
                  </FormField>
                  <FormField
                    label="Detalle (reporte)"
                    className="sm:col-span-2"
                    action={
                      <VoiceDictationButton
                        lang="es-PE"
                        onFinalTranscript={(text) =>
                          setDetailText((prev) => (prev ? `${prev.trim()} ${text}` : text))
                        }
                      />
                    }
                  >
                    <textarea
                      className={textareaClass}
                      value={detailText}
                      onChange={(e) => setDetailText(e.target.value)}
                      placeholder="Ej. Equipos encendidos / sin internet / queja de usuario"
                    />
                  </FormField>
                  <FormField
                    label="Observación adicional"
                    className="sm:col-span-2"
                    action={
                      <VoiceDictationButton
                        lang="es-PE"
                        onFinalTranscript={(text) =>
                          setObservation((prev) => (prev ? `${prev.trim()} ${text}` : text))
                        }
                      />
                    }
                  >
                    <textarea
                      className={textareaClass}
                      value={observation}
                      onChange={(e) => setObservation(e.target.value)}
                      placeholder="Opcional · queda en historial"
                    />
                  </FormField>
                </div>
              </Panel>
              <RecentManagements managements={data.managements ?? []} />
                </>
              )}
            </div>
          ) : null}

          {data && tab === 'dispatch' ? (
            <FieldDispatchPanel
              incidentId={incidentId}
              active={recovered}
              dispatch={data.field_dispatch}
              history={data.field_dispatches ?? []}
            />
          ) : null}

          {data && tab === 'history' ? <HistoryTab data={data} incidentId={incidentId} onNavigate={onClose} /> : null}
        </div>

        <footer className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-slate-200 bg-white px-5 py-3 dark:border-slate-800 dark:bg-slate-900">
          <div className="mr-auto min-w-0 text-[12px] font-medium" aria-live="polite">
            {savedMsg ? <span className="text-emerald-700 dark:text-emerald-400">{savedMsg}</span> : null}
            {save.isError ? (
              <span className="text-red-700 dark:text-red-400">
                {save.error instanceof Error ? save.error.message : 'Error al guardar'}
              </span>
            ) : null}
            {!savedMsg && !save.isError && !classification ? (
              <span className="text-slate-500 dark:text-slate-400">
                Elige un resultado en <strong>Contacto y gestión</strong> para guardar.
              </span>
            ) : null}
          </div>
          <Button variant="secondary" onClick={onClose}>
            {readOnly ? 'Cerrar' : 'Cancelar'}
          </Button>
          {!readOnly ? (
            <Button variant="primary" disabled={!data || !classification} loading={save.isPending} onClick={() => save.mutate()}>
              Guardar gestión
            </Button>
          ) : null}
        </footer>
      </div>
    </div>
  )
}

function SummaryBand({ data }: { data: IncidentDetail }) {
  const reincidencia = data.antecedentes.reincidencia
  return (
    <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg bg-slate-50 px-3 py-2.5 sm:grid-cols-3 lg:grid-cols-5 dark:bg-slate-950/60">
      <KeyValue label="Caída">{data.estado.fecha_caida ? formatDateTime(data.estado.fecha_caida) : '—'}</KeyValue>
      <KeyValue label={data.estado.recovered_at ? 'Recuperado' : 'Último check'}>
        {data.estado.recovered_at
          ? formatDateTime(data.estado.recovered_at)
          : data.estado.ultima_comprobacion
            ? formatDateTime(data.estado.ultima_comprobacion)
            : '—'}
      </KeyValue>
      <KeyValue label="Seguimiento">
        <FollowupBadge status={data.estado.followup_status} />
      </KeyValue>
      <KeyValue label="Tecnología">{data.colegio.tecnologia ?? '—'}</KeyValue>
      <KeyValue label="Reincidencia">
        {reincidencia && reincidencia.total > 1 ? (
          <span title={reincidencia.label}>
            {reincidencia.numero} de {reincidencia.total}
          </span>
        ) : (
          'Primera caída'
        )}
      </KeyValue>
    </dl>
  )
}

function SummaryTab({ data, onNavigate }: { data: IncidentDetail; onNavigate: () => void }) {
  const c = data.colegio
  const prtgProvince = c.prtg_province ?? c.provincia
  const prtgDistrict = c.prtg_district ?? c.distrito
  const hasAdmin = Boolean(c.admin_provincia || c.admin_distrito)

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel
        title="Ubicación"
        icon={<MapPin className="h-4 w-4 text-slate-500" aria-hidden />}
        action={
          hasAdmin && !c.location_mismatch ? (
            <Badge tone="success" title="La jerarquía PRTG coincide con la ficha administrativa">
              <Check className="h-3 w-3" aria-hidden /> Coincide
            </Badge>
          ) : null
        }
      >
        {c.location_mismatch ? (
          <div className="grid grid-cols-2 gap-3 rounded-lg border border-amber-200 bg-amber-50/60 p-3 dark:border-amber-900 dark:bg-amber-950/30">
            <dl className="space-y-1.5">
              <p className="text-[11px] font-semibold text-amber-800 uppercase dark:text-amber-300">PRTG (operativo)</p>
              <KeyValue label="Provincia">{prtgProvince}</KeyValue>
              <KeyValue label="Distrito">{prtgDistrict}</KeyValue>
            </dl>
            <dl className="space-y-1.5">
              <p className="text-[11px] font-semibold text-slate-600 uppercase dark:text-slate-400">Ficha administrativa</p>
              <KeyValue label="Provincia">{c.admin_provincia}</KeyValue>
              <KeyValue label="Distrito">{c.admin_distrito}</KeyValue>
            </dl>
          </div>
        ) : (
          <dl className="grid grid-cols-2 gap-3">
            <KeyValue label="Provincia">{prtgProvince}</KeyValue>
            <KeyValue label="Distrito">{prtgDistrict}</KeyValue>
          </dl>
        )}
        <dl className="mt-3 grid grid-cols-2 gap-3 border-t border-slate-100 pt-3 dark:border-slate-800">
          <KeyValue label="Código local">{c.codigo_local}</KeyValue>
          <KeyValue label="Centro poblado">{c.centro_poblado}</KeyValue>
        </dl>
      </Panel>

      <Panel title="Estado PRTG" icon={<Radio className="h-4 w-4 text-slate-500" aria-hidden />}>
        <dl className="grid grid-cols-2 gap-3">
          <KeyValue label="Estado">
            <PrtgStatusBadge status={data.estado.estado_prtg} />
          </KeyValue>
          <KeyValue label="Último check">
            {data.estado.ultima_comprobacion ? formatDateTime(data.estado.ultima_comprobacion) : '—'}
          </KeyValue>
          <KeyValue label="Sensor PRTG">{data.estado.prtg_sensor_objid ?? '—'}</KeyValue>
          <KeyValue label="Nodo / POP">{c.nodo_pop}</KeyValue>
        </dl>
        {data.estado.estado_prtg_text ? (
          <p className="mt-3 truncate text-[12px] text-slate-500 dark:text-slate-400" title={data.estado.estado_prtg_text}>
            {data.estado.estado_prtg_text}
          </p>
        ) : null}
      </Panel>

      {c.ip_publica || c.ip_loopback || c.capacidad_mbps ? (
        <Panel title="Red">
          <dl className="grid grid-cols-3 gap-3">
            {c.ip_publica ? <KeyValue label="IP pública">{c.ip_publica}</KeyValue> : null}
            {c.ip_loopback ? <KeyValue label="Loopback">{c.ip_loopback}</KeyValue> : null}
            {c.capacidad_mbps ? <KeyValue label="Capacidad">{`${c.capacidad_mbps} Mbps`}</KeyValue> : null}
          </dl>
        </Panel>
      ) : null}

      <Panel title="Tracking General" icon={<ClipboardList className="h-4 w-4 text-slate-500" aria-hidden />}>
        {data.active_tracking ? (
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                {data.active_tracking.report_ticket ?? data.active_tracking.ticket ?? `#${data.active_tracking.incident_number ?? data.active_tracking.id}`}
              </p>
              <p className="text-[12px] text-slate-500 dark:text-slate-400">
                {data.active_tracking.status_label ?? data.active_tracking.status}
                {data.active_tracking.opened_by_name ? ` · ${data.active_tracking.opened_by_name}` : ''}
              </p>
            </div>
            <Link
              to={`/tracking/${data.active_tracking.id}`}
              onClick={onNavigate}
              className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12px] font-semibold text-blue-700 hover:bg-blue-50 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none dark:text-blue-300 dark:hover:bg-blue-950/40"
            >
              Ver Tracking <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </div>
        ) : (
          <p className="text-[12px] text-slate-500 dark:text-slate-400">
            Se abre automáticamente al guardar la primera gestión.
          </p>
        )}
      </Panel>
    </div>
  )
}

function ContactsPanel({ contacts }: { contacts: IncidentDetail['contactos'] }) {
  return (
    <Panel title="Contactos del local" icon={<Phone className="h-4 w-4 text-slate-500" aria-hidden />}>
      {contacts.length === 0 ? (
        <p className="text-[13px] text-slate-500 dark:text-slate-400">Sin contactos registrados.</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {contacts.map((c, idx) => (
            <li key={c.id} className="rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700">
              <p className="truncate text-[13px] font-semibold text-slate-900 dark:text-slate-100">
                {idx + 1}. {c.nombre ?? '—'}
              </p>
              <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">{c.cargo ?? 'Sin cargo'}</p>
              {c.telefono ? (
                <a
                  href={`tel:${c.telefono}`}
                  className="mt-0.5 inline-block text-[13px] font-medium text-blue-700 tabular-nums hover:underline dark:text-blue-300"
                >
                  {c.telefono}
                </a>
              ) : (
                <p className="mt-0.5 text-[13px] text-slate-400">—</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

function RecentManagements({ managements }: { managements: NonNullable<IncidentDetail['managements']> }) {
  if (managements.length === 0) {
    return (
      <p className="px-1 text-[12px] text-slate-500 dark:text-slate-400">Aún no hay gestiones registradas en esta caída.</p>
    )
  }
  return (
    <Panel title={`Gestiones anteriores (${managements.length})`}>
      <ul className="space-y-2">
        {managements.slice(0, 3).map((m) => (
          <li key={m.id} className="rounded-lg border border-slate-200 px-3 py-2 text-[12px] dark:border-slate-700">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-semibold text-slate-500 tabular-nums">{formatDateTime(m.created_at)}</span>
              <ClassificationBadge classification={m.classification} label={m.classification_label} colorKey={m.color_key} />
              {m.scope ? <span className="font-semibold text-slate-600 dark:text-slate-300">{m.scope}</span> : null}
              {m.created_by_name ? <span className="text-slate-500">· {m.created_by_name}</span> : null}
            </div>
            {m.detail ? <p className="mt-1 text-slate-700 dark:text-slate-300">{m.detail}</p> : null}
            {m.observation ? <p className="text-slate-500 dark:text-slate-400">{m.observation}</p> : null}
          </li>
        ))}
      </ul>
      {managements.length > 3 ? (
        <p className="mt-2 text-[11px] text-slate-500">Las demás gestiones están en la pestaña Historial.</p>
      ) : null}
    </Panel>
  )
}

function HistoryTab({
  data,
  incidentId,
  onNavigate,
}: {
  data: IncidentDetail
  incidentId: number
  onNavigate: () => void
}) {
  const [visible, setVisible] = useState(TIMELINE_PAGE)
  const events = useMemo(() => data.timeline ?? [], [data.timeline])
  const previous = data.historial.filter((h) => !h.es_actual).slice(0, 5)

  return (
    <div className="space-y-4">
      <Panel
        title="Línea de tiempo"
        action={
          <Link
            to={incidentCaseFilePath(incidentId)}
            onClick={onNavigate}
            className="inline-flex items-center gap-1 text-[12px] font-semibold text-blue-700 hover:underline focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none dark:text-blue-300"
          >
            Expediente completo <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </Link>
        }
      >
        {events.length === 0 ? (
          <p className="text-[13px] text-slate-500 dark:text-slate-400">Sin eventos registrados.</p>
        ) : (
          <ol className="relative space-y-3 border-l border-slate-200 pl-4 dark:border-slate-700">
            {events.slice(0, visible).map((e) => (
              <li key={e.id} className="relative">
                <span className="absolute top-1.5 -left-[21px] h-2 w-2 rounded-full bg-slate-400 ring-4 ring-white dark:bg-slate-500 dark:ring-slate-900" />
                <div className="flex flex-wrap items-baseline gap-x-2 text-[12px]">
                  <time className="font-semibold text-slate-500 tabular-nums">{formatDateTime(e.at)}</time>
                  <span className="font-semibold text-slate-900 dark:text-slate-100">{e.title}</span>
                  {e.actor ? <span className="text-slate-500">· {e.actor}</span> : null}
                </div>
                {e.detail ? <p className="mt-0.5 text-[12px] text-slate-600 dark:text-slate-300">{e.detail}</p> : null}
              </li>
            ))}
          </ol>
        )}
        {events.length > visible ? (
          <Button size="sm" variant="ghost" className="mt-3" onClick={() => setVisible((v) => v + TIMELINE_PAGE)}>
            Ver {Math.min(TIMELINE_PAGE, events.length - visible)} más
          </Button>
        ) : null}
      </Panel>

      <Panel title={`Caídas anteriores (${data.antecedentes.incidencias_registradas})`}>
        {previous.length === 0 ? (
          <p className="text-[13px] text-slate-500 dark:text-slate-400">No hay caídas anteriores para este CID.</p>
        ) : (
          <ul className="divide-y divide-slate-100 text-[12px] dark:divide-slate-800">
            {previous.map((h) => (
              <li key={h.id} className="flex items-center justify-between gap-3 py-1.5">
                <span className="tabular-nums text-slate-700 dark:text-slate-300">{formatDateTime(h.started_at)}</span>
                <span className="text-slate-500">{h.duracion ?? '—'}</span>
                <Link
                  to={incidentCaseFilePath(h.id)}
                  onClick={onNavigate}
                  className="font-semibold text-blue-700 hover:underline dark:text-blue-300"
                >
                  Ver
                </Link>
              </li>
            ))}
          </ul>
        )}
        {data.colegio.school_id ? (
          <Link
            to={`/history/schools/${data.colegio.school_id}`}
            onClick={onNavigate}
            className="mt-2 inline-block text-[12px] font-semibold text-blue-700 hover:underline dark:text-blue-300"
          >
            Historial completo del colegio
          </Link>
        ) : null}
      </Panel>
    </div>
  )
}
