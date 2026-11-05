import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, ExternalLink, MapPin, Phone, Radio, Timer, X } from 'lucide-react'
import { endpoints } from '../../../api/endpoints'
import { ClassificationBadge, FollowupBadge, PrtgStatusBadge } from '../../../components/monitoring/StatusBadges'
import { Badge } from '../../../components/ui/SoftBadge'
import { Button } from '../../../components/ui/Button'
import { IconButton } from '../../../components/ui/IconButton'
import { FormField, Select } from '../../../components/ui/FormControls'
import { ErrorState, LoadingState } from '../../../components/ui/States'
import { inputClassName } from '../../../lib/uiTokens'
import { formatDateTime, formatDuration } from '../../../lib/datetime'
import { useBodyScrollLock } from '../../../lib/useBodyScrollLock'
import { useNow } from '../../../lib/useNow'
import type { ManagementPayload, MineduReason } from '../../reports/types/operationalReport'
import { incidentCaseFilePath } from '../../history/api/historyApi'
import { VoiceDictationButton } from '../../voice/components/VoiceDictationButton'
import { FieldDispatchPanel } from './FieldDispatchPanel'
import type { IncidentDetail } from '../../../types/api'
import rootCauseLegend from '../data/rootCauseLegend.json' with { type: 'json' }

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
  radio: string
  dot: string
}> = [
  {
    value: 'CONTACT_CONFIRMED',
    label: 'TIPO 1',
    hint: 'Para reporte',
    selected: 'border-red-500 bg-red-50 shadow-sm dark:border-red-500 dark:bg-red-950/40',
    radio: 'text-red-600',
    dot: 'bg-red-500',
  },
  {
    value: 'LINK_OUTAGE',
    label: 'TIPO 2',
    hint: 'Caída solo de un enlace en P2P',
    selected: 'border-orange-400 bg-orange-50 shadow-sm dark:border-orange-400 dark:bg-orange-950/35',
    radio: 'text-orange-500',
    dot: 'bg-orange-500',
  },
  {
    value: 'NO_RESPONSE',
    label: 'TIPO 3',
    hint: 'Equipos apagados, corte de energía, sin respuesta',
    selected: 'border-yellow-400 bg-yellow-50 shadow-sm dark:border-yellow-400 dark:bg-yellow-950/30',
    radio: 'text-yellow-500',
    dot: 'bg-yellow-400',
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
    <div className="min-w-0 bg-slate-50 px-3 py-2 dark:bg-slate-950">
      <dt className="text-[10px] font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">{label}</dt>
      <dd className="mt-0.5 truncate text-[13px] font-medium text-slate-900 dark:text-slate-100">{children ?? '—'}</dd>
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
  const [causeGroup, setCauseGroup] = useState('')
  const [causeCode, setCauseCode] = useState('')
  const [causeText, setCauseText] = useState('')
  const [mineduReason, setMineduReason] = useState<'' | MineduReason>('')
  const [savedMsg, setSavedMsg] = useState<string | null>(null)

  // Hidratar una sola vez: los refetch traen duraciones nuevas y no deben pisar lo que se escribe.
  const hydrated = useRef(false)
  useEffect(() => {
    if (!detail.data || hydrated.current) return
    hydrated.current = true
    const g = detail.data.gestion
    const current = g.management_classification
    setClassification(
      current === 'CONTACT_CONFIRMED' || current === 'LINK_OUTAGE' || current === 'NO_RESPONSE' ? current : '',
    )
    setScope((g.management_scope as '' | 'PEXT' | 'PINT') || '')
    setContactId(g.last_managed_contact_id ?? '')
    setDetailText(g.detail_text ?? '')
    setObservation('')
    setCauseGroup(g.root_cause_group_code ?? '')
    setCauseCode(g.root_cause_code ?? '')
    setCauseText(g.cause ?? '')
    setMineduReason(
      g.minedu_reason === 'CAIDA_ENLACE' || g.minedu_reason === 'CAIDA_ENERGIA' || g.minedu_reason === 'REQUERIMIENTO'
        ? g.minedu_reason
        : '',
    )
  }, [detail.data])

  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useBodyScrollLock(true)

  // Solo al montar: el padre recrea onClose en cada refresco y no debe robar el foco.
  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const invalidateOps = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: ['dashboard'], refetchType: 'active' }),
      client.invalidateQueries({ queryKey: ['incidents', 'queue'], refetchType: 'active' }),
      client.invalidateQueries({ queryKey: ['incidents', incidentId], refetchType: 'active' }),
    ])
  }

  const clockStop = useMutation({
    mutationFn: (action: 'start' | 'end') => endpoints.clockStop(incidentId, action),
    onSuccess: async (data) => {
      setSavedMsg(data.sla?.clock_paused ? 'Parada de reloj iniciada' : 'Reloj reanudado')
      client.setQueryData(['incidents', incidentId], data)
      window.setTimeout(() => setSavedMsg(null), 3000)
    },
  })

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
        root_cause_group_code: causeGroup || null,
        root_cause_code: causeCode || null,
        cause: causeText || null,
        minedu_reason: mineduReason || null,
      })
    },
    onSuccess: async (data) => {
      setSavedMsg('Gestión registrada')
      hydrated.current = false
      client.setQueryData(['incidents', incidentId], data)
      await invalidateOps()
      window.setTimeout(() => setSavedMsg(null), 3500)
    },
  })

  const markGrave = useMutation({
    mutationFn: () => endpoints.markIncidentGrave(incidentId, observation || undefined),
    onSuccess: async () => {
      setSavedMsg('Marcado como incidencia grave')
      await invalidateOps()
      window.setTimeout(() => setSavedMsg(null), 3000)
    },
  })

  const closeTicket = useMutation({
    mutationFn: () => endpoints.closeIncidentTicket(incidentId, observation || undefined),
    onSuccess: async () => {
      setSavedMsg('Ticket cerrado')
      await invalidateOps()
      window.setTimeout(() => {
        setSavedMsg(null)
        onClose()
      }, 1200)
    },
  })

  const data = detail.data
  const seconds = data ? durationSeconds(data.estado, now) : null
  const recovered = Boolean(data?.estado.recovered_at)

  const modal = (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        tabIndex={-1}
        aria-label="Cerrar panel"
        className="absolute inset-0 cursor-default bg-slate-950/50"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 flex h-full w-full flex-col border-l border-slate-200 bg-slate-100 shadow-2xl sm:w-[min(1040px,94vw)] dark:border-slate-800 dark:bg-slate-950"
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

          {data?.sla ? (
            <ClockStopBar
              sla={data.sla}
              disabled={readOnly}
              pending={clockStop.isPending}
              onClock={(action) => clockStop.mutate(action)}
            />
          ) : null}

          <div role="tablist" aria-label="Secciones de la incidencia" className="mt-3 flex gap-1 overflow-x-auto rounded-lg bg-slate-100 p-1 dark:bg-slate-950">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                id={`${titleId}-tab-${t.key}`}
                aria-selected={tab === t.key}
                aria-controls={`${titleId}-panel`}
                onClick={() => setTab(t.key)}
                className={`shrink-0 rounded-md px-3 py-1.5 text-[13px] font-semibold whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none ${
                  tab === t.key
                    ? 'bg-white text-slate-950 shadow-sm dark:bg-slate-800 dark:text-white'
                    : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
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

          {data && tab === 'summary' ? <SummaryTab data={data} /> : null}

          {data && tab === 'management' ? (
            <div className="space-y-4">
              <ContactsPanel
                contacts={data.contactos}
                selectedId={contactId}
                onSelect={(id) => setContactId(id)}
              />
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
                  {RESULT_OPTIONS.map((opt) => {
                    const on = classification === opt.value
                    return (
                      <label
                        key={opt.value}
                        className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-3 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-blue-500 ${
                          on
                            ? opt.selected
                            : 'border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-white dark:border-slate-700 dark:bg-slate-950 dark:hover:bg-slate-900'
                        }`}
                      >
                        <input
                          type="radio"
                          className={`mt-1 ${opt.radio}`}
                          name={`${titleId}-result`}
                          checked={on}
                          onChange={() => setClassification(opt.value)}
                        />
                        <span className="min-w-0">
                          <span className="flex items-center gap-2 text-[13px] font-bold tracking-wide text-slate-900 dark:text-slate-100">
                            <span className={`h-2 w-2 rounded-full ${opt.dot}`} aria-hidden />
                            {opt.label}
                          </span>
                          <span className="mt-1 block text-[12px] leading-snug text-slate-600 dark:text-slate-400">{opt.hint}</span>
                        </span>
                      </label>
                    )
                  })}
                </div>
              </Panel>

              <Panel title="Causa raíz">
                <div className="grid gap-3 md:grid-cols-3">
                  <FormField label="Código de grupo">
                    <Select
                      value={causeGroup}
                      onChange={(e) => {
                        const next = e.target.value
                        setCauseGroup(next)
                        const still = rootCauseLegend.find((row) => row.group_code === next && row.code === causeCode)
                        if (!still) {
                          setCauseCode('')
                          setCauseText('')
                          setScope('')
                        }
                      }}
                    >
                      <option value="">— Sin definir —</option>
                      {Array.from(new Map(rootCauseLegend.map((row) => [row.group_code, row.group_name])).entries()).map(
                        ([code, name]) => (
                          <option key={code} value={code}>
                            {code} · {name}
                          </option>
                        ),
                      )}
                    </Select>
                  </FormField>
                  <FormField label="Código y causa raíz" className="md:col-span-2">
                    <Select
                      value={causeCode}
                      disabled={!causeGroup}
                      onChange={(e) => {
                        const next = e.target.value
                        setCauseCode(next)
                        const row = rootCauseLegend.find((item) => item.group_code === causeGroup && item.code === next)
                        setCauseText(row?.cause ?? '')
                        setScope(row?.attention === 'PEXT' || row?.attention === 'PINT' ? row.attention : '')
                      }}
                    >
                      <option value="">— Elige el código —</option>
                      {rootCauseLegend
                        .filter((row) => row.group_code === causeGroup)
                        .map((row) => (
                          <option key={row.code} value={row.code}>
                            {row.code} · {row.cause}
                          </option>
                        ))}
                    </Select>
                  </FormField>
                </div>
                {(() => {
                  const selected = rootCauseLegend.find((row) => row.group_code === causeGroup && row.code === causeCode)
                  const label = selected ? `${selected.code} · ${selected.cause}` : ''
                  return (
                    <div
                      className={`mt-3 rounded-xl border px-3 py-2.5 ${
                        label
                          ? 'border-emerald-500/30 bg-emerald-500/10'
                          : 'border-dashed border-slate-300 bg-slate-50 dark:border-slate-700 dark:bg-slate-950'
                      }`}
                    >
                      <p className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase">Código + causa raíz</p>
                      <p className={`mt-1 text-sm ${label ? 'font-medium text-slate-900 dark:text-slate-100' : 'text-slate-400'}`}>
                        {label || 'Se completa al elegir el grupo y el código'}
                      </p>
                      {selected?.when ? <p className="mt-1 text-[12px] text-slate-500">{selected.when}</p> : null}
                      <p className="mt-2 text-[12px] text-slate-600 dark:text-slate-300">
                        Atención: {selected?.attention || 'se define con el código'}
                        {selected?.segment ? ` · ${selected.segment}` : ''}
                      </p>
                    </div>
                  )
                })()}
              </Panel>

              <MineduPanel
                reason={mineduReason}
                onChange={setMineduReason}
                sla={detail.data?.sla}
                disabled={readOnly}
              />

              <Panel title="Detalle de la atención">
                <div className="grid gap-3">
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
                  <FormField
                    label="Detalle (reporte)"
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
            <>
              <Button
                variant="secondary"
                disabled={!data || markGrave.isPending}
                loading={markGrave.isPending}
                onClick={() => markGrave.mutate()}
                title="Pasa el caso al apartado Incidencias graves"
              >
                Pasar a incidencia
              </Button>
              <Button
                variant="secondary"
                disabled={!data || closeTicket.isPending}
                loading={closeTicket.isPending}
                onClick={() => {
                  if (window.confirm('¿Cerrar este ticket operativamente?')) closeTicket.mutate()
                }}
              >
                Cerrar ticket
              </Button>
              <Button variant="primary" disabled={!data || !classification} loading={save.isPending} onClick={() => save.mutate()}>
                Guardar gestión
              </Button>
            </>
          ) : null}
        </footer>
      </div>
    </div>
  )

  return createPortal(modal, document.body)
}

function limaYmd(ms: number): { y: number; m: number; d: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(ms))
  const pick = (type: string) => Number(parts.find((part) => part.type === type)?.value)
  return { y: pick('year'), m: pick('month'), d: pick('day') }
}

/** Segundos entre las 08:00 y las 16:00, hora de Lima. */
function businessSeconds(startMs: number, endMs: number): number {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return 0
  const endDay = limaYmd(endMs)
  let { y, m, d } = limaYmd(startMs)
  let total = 0
  for (let guard = 0; guard < 400; guard += 1) {
    const midnight = Date.UTC(y, m - 1, d, 5, 0, 0)
    const open = midnight + 8 * 3_600_000
    const close = midnight + 16 * 3_600_000
    const segStart = Math.max(startMs, open)
    const segEnd = Math.min(endMs, close)
    if (segEnd > segStart) total += segEnd - segStart
    if (y === endDay.y && m === endDay.m && d === endDay.d) break
    const next = new Date(Date.UTC(y, m - 1, d + 1))
    y = next.getUTCFullYear()
    m = next.getUTCMonth() + 1
    d = next.getUTCDate()
  }
  return Math.floor(total / 1000)
}

function liveClock(sla: NonNullable<IncidentDetail['sla']>, now: number) {
  const started = sla.started_at ? Date.parse(sla.started_at) : Number.NaN
  const recovered = sla.recovered_at ? Date.parse(sla.recovered_at) : Number.NaN
  const end = Number.isFinite(recovered) ? recovered : now
  const total = Number.isFinite(started) ? Math.max(0, Math.floor((end - started) / 1000)) : sla.incident_elapsed_seconds
  const pauses = sla.pauses ?? []
  let pauseBusiness = 0
  let pauseWall = 0
  for (const pause of pauses) {
    const from = Date.parse(pause.started_at)
    const to = pause.ended_at ? Date.parse(pause.ended_at) : now
    if (!Number.isFinite(from) || !Number.isFinite(to)) continue
    pauseWall += Math.max(0, Math.floor((to - from) / 1000))
    pauseBusiness += businessSeconds(from, to)
  }
  const effective = Number.isFinite(started)
    ? Math.max(0, businessSeconds(started, end) - pauseBusiness)
    : sla.incident_effective_seconds
  const others = sla.applies ? sla.used_seconds - sla.incident_net_seconds : sla.used_seconds
  const used = sla.applies ? Math.max(0, others) + effective : sla.used_seconds
  return {
    total,
    effective,
    pause: pauseWall,
    remaining: sla.monthly_cap_seconds - used,
  }
}

function ClockStopBar({
  sla,
  disabled,
  pending,
  onClock,
}: {
  sla: NonNullable<IncidentDetail['sla']>
  disabled: boolean
  pending: boolean
  onClock: (action: 'start' | 'end') => void
}) {
  const now = useNow(1000)
  const live = liveClock(sla, now)
  return (
    <section className="mt-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase">Parada de reloj</p>
          <p className="mt-1 text-sm text-slate-700 dark:text-slate-200">
            Total 24 h {formatClock(live.total)} · Efectiva 8:00–16:00 {formatClock(live.effective)} · Parada {formatClock(live.pause)}
          </p>
          {sla.applies ? (
            <p className={`mt-0.5 text-sm font-semibold ${live.remaining < 0 ? 'text-red-600' : 'text-slate-900 dark:text-slate-100'}`}>
              SLA del mes {formatClock(live.remaining)} · {sla.zone_label}
            </p>
          ) : (
            <p className="mt-0.5 text-[12px] text-slate-500">El SLA del mes se descuenta cuando la caída tiene razón MINEDU.</p>
          )}
        </div>
        {!disabled ? (
          <Button
            type="button"
            variant={sla.clock_paused ? 'secondary' : 'primary'}
            loading={pending}
            onClick={() => onClock(sla.clock_paused ? 'end' : 'start')}
          >
            <Timer className="h-4 w-4" aria-hidden />
            {sla.clock_paused ? 'Reanudar reloj' : 'Iniciar parada de reloj'}
          </Button>
        ) : null}
      </div>
    </section>
  )
}

const MINEDU_OPTIONS: Array<{ value: MineduReason; label: string; className: string }> = [
  { value: 'CAIDA_ENLACE', label: 'Caída de enlace', className: 'border-sky-300 bg-sky-50 text-sky-900' },
  { value: 'CAIDA_ENERGIA', label: 'Caída de energía', className: 'border-amber-300 bg-amber-50 text-amber-900' },
  { value: 'REQUERIMIENTO', label: 'Requerimiento', className: 'border-slate-300 bg-slate-100 text-slate-900' },
]

function formatClock(seconds: number): string {
  const sign = seconds < 0 ? '−' : ''
  const total = Math.abs(Math.floor(seconds))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = total % 60
  return `${sign}${hours} h ${String(minutes).padStart(2, '0')} min ${String(secs).padStart(2, '0')} s`
}

function MineduPanel({
  reason,
  onChange,
  sla,
  disabled,
}: {
  reason: '' | MineduReason
  onChange: (value: '' | MineduReason) => void
  sla: IncidentDetail['sla']
  disabled: boolean
}) {
  const now = useNow(1000)
  const live = useMemo(() => (sla ? liveClock(sla, now) : null), [now, sla])

  return (
    <Panel title="Reporte MINEDU" icon={<Timer className="h-4 w-4" aria-hidden />}>
      <p className="mb-3 text-[12px] text-slate-500">
        Elige una sola razón para el Anexo 30. El SLA del mes usa el tiempo efectivo, de 8:00 a 16:00.
      </p>
      <div className="grid gap-2 sm:grid-cols-3">
        {MINEDU_OPTIONS.map((opt) => {
          const selected = reason === opt.value
          return (
            <button
              key={opt.value}
              type="button"
              disabled={disabled}
              onClick={() => onChange(selected ? '' : opt.value)}
              className={`rounded-xl border px-3 py-3 text-left text-sm font-semibold transition ${
                selected ? opt.className : 'border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
              }`}
            >
              {opt.label}
            </button>
          )
        })}
      </div>
      {reason && sla && live ? (
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
          Total 24 h {formatClock(live.total)}. Efectiva {formatClock(live.effective)}. Quedan {formatClock(live.remaining)} del mes.
          La parada de reloj está arriba del ticket, junto al resumen.
        </p>
      ) : null}
    </Panel>
  )
}

function SummaryBand({ data }: { data: IncidentDetail }) {
  const reincidencia = data.antecedentes.reincidencia
  return (
    <dl className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200 sm:grid-cols-3 lg:grid-cols-5 dark:border-slate-800 dark:bg-slate-800">
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

function SummaryTab({ data }: { data: IncidentDetail }) {
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

    </div>
  )
}

function ContactsPanel({
  contacts,
  selectedId,
  onSelect,
}: {
  contacts: IncidentDetail['contactos']
  selectedId?: number | ''
  onSelect?: (id: number) => void
}) {
  return (
    <Panel title="Contactos del local" icon={<Phone className="h-4 w-4 text-slate-500" aria-hidden />}>
      {contacts.length === 0 ? (
        <p className="text-[13px] text-slate-500 dark:text-slate-400">Sin contactos registrados.</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {contacts.map((c, idx) => {
            const selected = selectedId === c.id
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => onSelect?.(c.id)}
                  className={`w-full rounded-xl border px-3 py-2.5 text-left transition ${
                    selected
                      ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-500/20 dark:border-blue-400 dark:bg-blue-950/40'
                      : 'border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-white dark:border-slate-700 dark:bg-slate-950 dark:hover:bg-slate-900'
                  }`}
                >
                  <p className="truncate text-[13px] font-semibold text-slate-900 dark:text-slate-100">
                    {idx + 1}. {c.nombre ?? '—'}
                  </p>
                  <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">{c.cargo ?? 'Sin cargo'}</p>
                  <p className={`mt-1 text-[13px] font-medium tabular-nums ${selected ? 'text-blue-700 dark:text-blue-300' : 'text-slate-700 dark:text-slate-200'}`}>
                    {c.telefono ?? 'Sin teléfono'}
                  </p>
                </button>
              </li>
            )
          })}
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
