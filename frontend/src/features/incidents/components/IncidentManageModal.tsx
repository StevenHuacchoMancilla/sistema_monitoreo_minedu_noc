import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, ChevronRight, Clock3, ExternalLink, History, MapPin, Phone, Radio, Timer, X } from 'lucide-react'
import { endpoints } from '../../../api/endpoints'
import { ClassificationBadge, FollowupBadge, PrtgStatusBadge } from '../../../components/monitoring/StatusBadges'
import { Badge } from '../../../components/ui/SoftBadge'
import { Button } from '../../../components/ui/Button'
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog'
import { IconButton } from '../../../components/ui/IconButton'
import { FormField, Select } from '../../../components/ui/FormControls'
import { ErrorState, LoadingState } from '../../../components/ui/States'
import { inputClassName } from '../../../lib/uiTokens'
import { formatDateTime, formatDuration } from '../../../lib/datetime'
import { useBodyScrollLock } from '../../../lib/useBodyScrollLock'
import { useNow } from '../../../lib/useNow'
import type { MineduReason } from '../../reports/types/operationalReport'
import { incidentCaseFilePath } from '../../history/api/historyApi'
import { VoiceDictationButton } from '../../voice/components/VoiceDictationButton'
import { VisitReportPanel } from './VisitReportPanel'
import { RootCausePicker } from './RootCausePicker'
import type { IncidentDetail } from '../../../types/api'

type TabKey = 'summary' | 'management' | 'history'

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'summary', label: 'Resumen' },
  { key: 'management', label: 'Contacto y gestión' },
  { key: 'history', label: 'Historial' },
]

const TIMELINE_PAGE = 15

const MINEDU_RESULT_OPTIONS: Array<{
  value: MineduReason
  label: string
  hint: string
  selected: string
  radio: string
  dot: string
}> = [
  {
    value: 'CAIDA_ENLACE',
    label: 'Caída de enlace',
    hint: 'Incidencia / para reporte (rojo)',
    selected: 'border-red-500 bg-red-50 shadow-sm dark:border-red-500 dark:bg-red-950/40',
    radio: 'text-red-600',
    dot: 'bg-red-500',
  },
  {
    value: 'REQUERIMIENTO',
    label: 'Requerimiento',
    hint: 'Pedido o atención · apartado Requerimientos',
    selected: 'border-violet-400 bg-violet-50 shadow-sm dark:border-violet-400 dark:bg-violet-950/35',
    radio: 'text-violet-500',
    dot: 'bg-violet-500',
  },
  {
    value: 'QUEJA',
    label: 'Queja',
    hint: 'Queja o reclamo del colegio',
    selected: 'border-orange-400 bg-orange-50 shadow-sm dark:border-orange-400 dark:bg-orange-950/35',
    radio: 'text-orange-500',
    dot: 'bg-orange-500',
  },
]

/** Opción de contacto cuando no se habló con nadie del colegio. */
const CONTACT_VIA_DESCARTES = 'DESCARTES' as const
const CONTACT_DESCARTES_LABEL = 'Según descartes realizados'

type ContactSelection = number | '' | typeof CONTACT_VIA_DESCARTES

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

  const [scope, setScope] = useState<'' | 'PEXT' | 'PINT'>('')
  const [contactId, setContactId] = useState<ContactSelection>('')
  const [detailText, setDetailText] = useState('')
  const [observation, setObservation] = useState('')
  const [causeGroup, setCauseGroup] = useState('')
  const [causeCode, setCauseCode] = useState('')
  const [causeText, setCauseText] = useState('')
  const [mineduReason, setMineduReason] = useState<'' | MineduReason>('')
  const [savedMsg, setSavedMsg] = useState<string | null>(null)
  const [confirmClose, setConfirmClose] = useState(false)
  const initialClassRef = useRef<{
    minedu: '' | MineduReason
    causeGroup: string
    causeCode: string
  } | null>(null)

  // Hidratar una sola vez: los refetch traen duraciones nuevas y no deben pisar lo que se escribe.
  // Si ya hay gestiones, el detalle queda vacío para escribir comentarios nuevos (hilo de seguimiento).
  const hydrated = useRef(false)
  useEffect(() => {
    if (!detail.data || hydrated.current) return
    hydrated.current = true
    const g = detail.data.gestion
    const lastMgmt = detail.data.managements?.[0]
    const hasPrior = (detail.data.managements?.length ?? 0) > 0
    setScope((g.management_scope as '' | 'PEXT' | 'PINT') || '')
    if (
      lastMgmt &&
      !lastMgmt.contact_id &&
      (lastMgmt.contact_role_snapshot === 'DESCARTES' ||
        lastMgmt.contact_name_snapshot === CONTACT_DESCARTES_LABEL)
    ) {
      setContactId(CONTACT_VIA_DESCARTES)
    } else {
      setContactId(g.last_managed_contact_id ?? '')
    }
    setDetailText(hasPrior ? '' : (g.detail_text ?? ''))
    setObservation('')
    const nextGroup = g.root_cause_group_code ?? ''
    const nextCode = g.root_cause_code ?? ''
    const nextMinedu: '' | MineduReason =
      g.minedu_reason === 'CAIDA_ENLACE' ||
      g.minedu_reason === 'REQUERIMIENTO' ||
      g.minedu_reason === 'QUEJA'
        ? g.minedu_reason
        : ''
    setCauseGroup(nextGroup)
    setCauseCode(nextCode)
    setCauseText(g.cause ?? '')
    setMineduReason(nextMinedu)
    initialClassRef.current = {
      minedu: nextMinedu,
      causeGroup: nextGroup,
      causeCode: nextCode,
    }
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

  const hasPriorManagements = (detail.data?.managements?.length ?? 0) > 0
  const followupNote = detailText.trim()
  const classificationChanged = Boolean(
    initialClassRef.current &&
      (mineduReason !== initialClassRef.current.minedu ||
        causeGroup !== initialClassRef.current.causeGroup ||
        causeCode !== initialClassRef.current.causeCode),
  )
  const canSaveGestion = hasPriorManagements
    ? Boolean(followupNote || classificationChanged)
    : Boolean(
        mineduReason ||
          detailText.trim() ||
          observation.trim() ||
          contactId !== '' ||
          causeCode ||
          causeGroup,
      )

  const save = useMutation({
    mutationFn: () => {
      if (!canSaveGestion) {
        throw new Error(
          hasPriorManagements
            ? 'Escribe un comentario o actualiza resultado / causa raíz'
            : 'Agrega detalle, observación, contacto, causa o razón MINEDU',
        )
      }
      const viaDescartes = contactId === CONTACT_VIA_DESCARTES
      const detailPayload = hasPriorManagements
        ? followupNote ||
          (classificationChanged
            ? `Actualización: ${[
                mineduReason ? MINEDU_RESULT_OPTIONS.find((o) => o.value === mineduReason)?.label : null,
                causeText || causeCode || null,
              ]
                .filter(Boolean)
                .join(' · ')}`
            : '')
        : detailText
      return endpoints.applyIncidentManagement(incidentId, {
        classification: null,
        scope: scope || null,
        outage_text: null,
        detail: detailPayload || null,
        observation: hasPriorManagements ? null : observation || null,
        contact_id: viaDescartes || contactId === '' ? null : Number(contactId),
        contact_via_descartes: viaDescartes,
        root_cause_group_code: causeGroup || null,
        root_cause_code: causeCode || null,
        cause: causeText || null,
        minedu_reason: mineduReason || null,
      })
    },
    onSuccess: async (data) => {
      const becameIncident = Boolean(data?.estado?.is_grave_incident)
      const becameRequirement = Boolean(data?.estado?.is_requirement_case)
      const leftPendiente =
        (becameIncident && (mineduReason === 'CAIDA_ENLACE' || mineduReason === 'QUEJA')) ||
        (becameRequirement && mineduReason === 'REQUERIMIENTO')
      setSavedMsg(
        becameIncident && (mineduReason === 'CAIDA_ENLACE' || mineduReason === 'QUEJA')
          ? 'Gestión registrada · pasó a Incidencias'
          : becameRequirement && mineduReason === 'REQUERIMIENTO'
            ? 'Gestión registrada · pasó a Requerimientos'
            : hasPriorManagements
              ? classificationChanged && !followupNote
                ? 'Resultado / causa actualizados'
                : 'Comentario de seguimiento agregado'
              : 'Gestión registrada',
      )
      setDetailText('')
      setObservation('')
      initialClassRef.current = {
        minedu: mineduReason,
        causeGroup,
        causeCode,
      }
      client.setQueryData(['incidents', incidentId], data)
      await invalidateOps()
      await client.invalidateQueries({ queryKey: ['incidents', 'queue'], refetchType: 'active' })
      if (leftPendiente) {
        window.setTimeout(() => {
          setSavedMsg(null)
          onClose()
        }, 900)
      } else {
        window.setTimeout(() => setSavedMsg(null), 3500)
      }
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
                {data?.ticket?.ticket_code
                  ? data.ticket.ticket_code
                  : data?.colegio.cid
                    ? `CID ${data.colegio.cid}`
                    : `Caso #${incidentId}`}
                {data?.colegio.local_educativo ? (
                  <span className="font-medium text-slate-500 dark:text-slate-400"> · {data.colegio.local_educativo}</span>
                ) : null}
                {!data?.ticket?.ticket_code ? (
                  <span className="ml-2 text-xs font-medium text-amber-700 dark:text-amber-300">· Sin ticket (se crea al gestionar)</span>
                ) : null}
              </h2>
              {data ? (
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <PrtgStatusBadge status={data.estado.estado_prtg} />
                  {data.ticket?.kind === 'PREVENTIVO' ? (
                    <Badge tone={data.ticket.status === 'CERRADO' ? 'success' : 'warning'}>
                      Preventivo {data.ticket.status === 'CERRADO' ? 'cerrado' : 'abierto'}
                    </Badge>
                  ) : (
                    <Badge tone={recovered ? 'success' : 'danger'} title={recovered ? 'Duración total de la caída' : 'Tiempo caído hasta ahora'}>
                      {recovered ? 'Duró' : 'Caído'} {formatDuration(seconds)}
                    </Badge>
                  )}
                  {data.ticket?.ticket_code ? (
                    <Badge tone="neutral" title="Código de ticketera">
                      {data.ticket.ticket_code}
                    </Badge>
                  ) : null}
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
              {data.ticket ? (
                <VisitReportPanel
                  incidentId={incidentId}
                  ticket={data.ticket}
                  schoolName={data.colegio.local_educativo}
                  tss={data.colegio.current_sequence}
                  readOnly={readOnly}
                  onSaved={() => setSavedMsg('Detalle de evento guardado')}
                />
              ) : !readOnly ? (
                <Panel title="Ticket / detalle de evento">
                  <p className="text-[13px] text-slate-600 dark:text-slate-300">
                    Este caso aún no tiene código TGS. Genera el ticket para poder registrar visita técnica (Detalle de evento).
                    El seguimiento normal sigue en gestiones / Detalle.
                  </p>
                </Panel>
              ) : null}
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
              <Panel
                title="Resultado de gestión"
                action={
                  mineduReason ? (
                    <button
                      type="button"
                      className="text-[12px] font-medium text-slate-500 underline-offset-2 hover:text-slate-800 hover:underline dark:hover:text-slate-200"
                      onClick={() => setMineduReason('')}
                    >
                      Quitar
                    </button>
                  ) : null
                }
              >
                <p className="mb-3 text-[12px] text-slate-500">
                  Puedes cambiarlo durante el seguimiento. Caída de enlace y Queja van a Incidencias;
                  Requerimiento va a Requerimientos (también si está en Pendiente de cierre: sale solo al
                  guardar). Si PRTG se restablece y vuelve a caer, se mantiene la etiqueta salvo que cambies
                  este resultado.
                </p>
                <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Razón MINEDU (opcional)">
                  {MINEDU_RESULT_OPTIONS.map((opt) => {
                    const on = mineduReason === opt.value
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
                          name={`${titleId}-minedu`}
                          checked={on}
                          onChange={() => setMineduReason(opt.value)}
                          onClick={() => {
                            if (on) setMineduReason('')
                          }}
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
                <p className="mb-3 text-[12px] text-slate-500">
                  Actualízala si cambia el diagnóstico (ej. de equipos apagados a corte de energía).
                </p>
                <RootCausePicker
                  groupCode={causeGroup}
                  causeCode={causeCode}
                  onGroupChange={(next) => {
                    setCauseGroup(next)
                    setCauseCode('')
                    setCauseText('')
                    setScope('')
                  }}
                  onCauseChange={(next, row) => {
                    setCauseCode(next)
                    setCauseText(row?.cause ?? '')
                    setScope(row?.attention === 'PEXT' || row?.attention === 'PINT' ? row.attention : '')
                  }}
                />
              </Panel>

              {hasPriorManagements ? (
                <Panel title="Agregar comentario de seguimiento">
                  <p className="mb-3 text-[12px] text-slate-500">
                    Como el tracking anterior: cada día puedes dejar un comentario actualizado. Queda en el
                    historial del caso sin crear ticket nuevo.
                  </p>
                  <FormField
                    label="Comentario"
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
                      placeholder="Ej. Día 2: sin respuesta del colegio / técnico en camino / equipos apagados por horario"
                      rows={4}
                    />
                  </FormField>
                </Panel>
              ) : (
                <Panel title="Detalle de la atención">
                  <div className="grid gap-3">
                    <FormField label="Contacto utilizado">
                      <Select
                        value={contactId === '' ? '' : String(contactId)}
                        onChange={(e) => {
                          const v = e.target.value
                          if (v === '') setContactId('')
                          else if (v === CONTACT_VIA_DESCARTES) setContactId(CONTACT_VIA_DESCARTES)
                          else setContactId(Number(v))
                        }}
                      >
                        <option value="">— Sin seleccionar —</option>
                        <option value={CONTACT_VIA_DESCARTES}>{CONTACT_DESCARTES_LABEL}</option>
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
              )}
              <RecentManagements managements={data.managements ?? []} />
                </>
              )}
            </div>
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
            {!savedMsg && !save.isError && !canSaveGestion ? (
              <span className="text-slate-500 dark:text-slate-400">
                {hasPriorManagements
                  ? 'Escribe un comentario o cambia resultado / causa raíz para guardar.'
                  : 'Agrega un mensaje, contacto o causa para guardar. La razón MINEDU es opcional.'}
              </span>
            ) : null}
          </div>
          <Button variant="secondary" onClick={onClose}>
            {readOnly ? 'Cerrar' : 'Cancelar'}
          </Button>
          {!readOnly ? (
            <>
              {!data?.estado?.is_grave_incident ? (
                <Button
                  variant="secondary"
                  disabled={!data || markGrave.isPending}
                  loading={markGrave.isPending}
                  onClick={() => markGrave.mutate()}
                  title="Pasa el caso al apartado Incidencias"
                >
                  Pasar a incidencia
                </Button>
              ) : null}
              <Button
                variant="secondary"
                disabled={!data || closeTicket.isPending}
                loading={closeTicket.isPending}
                onClick={() => setConfirmClose(true)}
              >
                Cerrar ticket
              </Button>
              <Button
                variant="primary"
                disabled={!data || !canSaveGestion}
                loading={save.isPending}
                onClick={() => save.mutate()}
              >
                {data?.estado?.followup_status === 'PENDIENTE_CIERRE' &&
                (mineduReason === 'CAIDA_ENLACE' || mineduReason === 'QUEJA')
                  ? 'Guardar y pasar a Incidencias'
                  : data?.estado?.followup_status === 'PENDIENTE_CIERRE' &&
                      mineduReason === 'REQUERIMIENTO'
                    ? 'Guardar y pasar a Requerimientos'
                    : hasPriorManagements
                      ? classificationChanged && !followupNote
                        ? 'Actualizar gestión'
                        : 'Agregar comentario'
                      : 'Guardar gestión'}
              </Button>
            </>
          ) : null}
        </footer>
      </div>
    </div>
  )

  return (
    <>
      {createPortal(modal, document.body)}
      <ConfirmDialog
        open={confirmClose}
        title="Cerrar ticket"
        description={
          data
            ? `Se cerrará el caso${data.colegio?.cid ? ` CID ${data.colegio.cid}` : ''}${
                data.colegio?.local_educativo ? ` · ${data.colegio.local_educativo}` : ''
              }. Esta acción cierra el seguimiento operativo.`
            : 'Se cerrará el seguimiento operativo de este caso.'
        }
        confirmLabel="Cerrar ticket"
        cancelLabel="Cancelar"
        tone="danger"
        loading={closeTicket.isPending}
        onClose={() => {
          if (!closeTicket.isPending) setConfirmClose(false)
        }}
        onConfirm={() => {
          closeTicket.mutate(undefined, {
            onSettled: () => setConfirmClose(false),
          })
        }}
      />
    </>
  )
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

function ClockMetric({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="min-w-0 rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-950/80">
      <p className="text-[10px] font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">{label}</p>
      <p className={`mt-0.5 truncate text-[13px] font-semibold tabular-nums ${accent ?? 'text-slate-900 dark:text-slate-100'}`}>
        {value}
      </p>
    </div>
  )
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
  const paused = Boolean(sla.clock_paused)

  return (
    <section
      className={`mt-3 overflow-hidden rounded-xl border ${
        paused
          ? 'border-amber-300/80 bg-amber-50/70 dark:border-amber-500/40 dark:bg-amber-950/25'
          : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900'
      }`}
    >
      <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-stretch sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-slate-600 uppercase dark:text-slate-300">
              <Timer className="h-3.5 w-3.5" aria-hidden />
              Parada de reloj
            </span>
            {paused ? (
              <span className="rounded-full bg-amber-200/90 px-2 py-0.5 text-[10px] font-bold text-amber-950 dark:bg-amber-500/25 dark:text-amber-200">
                En pausa
              </span>
            ) : (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300">
                Corriendo
              </span>
            )}
            {sla.applies ? (
              <span
                className={`ml-auto text-[12px] font-semibold tabular-nums ${
                  live.remaining < 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-700 dark:text-slate-200'
                }`}
              >
                SLA mes {formatClock(live.remaining)}
                {sla.zone_label ? ` · ${sla.zone_label}` : ''}
              </span>
            ) : null}
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <ClockMetric label="Total 24 h" value={formatClock(live.total)} />
            <ClockMetric label="Efectiva 8:00–16:00" value={formatClock(live.effective)} />
            <ClockMetric
              label="Tiempo en parada"
              value={formatClock(live.pause)}
              accent={paused || live.pause > 0 ? 'text-amber-800 dark:text-amber-300' : undefined}
            />
          </div>
          {!sla.applies ? (
            <p className="mt-2 text-[11px] leading-snug text-slate-500 dark:text-slate-400">
              El SLA del mes se descuenta cuando la caída tiene razón MINEDU.
            </p>
          ) : null}
        </div>
        {!disabled ? (
          <div className="flex shrink-0 items-center sm:pl-2">
            <Button
              type="button"
              size="sm"
              variant={paused ? 'secondary' : 'primary'}
              loading={pending}
              className="w-full sm:w-auto"
              onClick={() => onClock(paused ? 'end' : 'start')}
            >
              <Timer className="h-4 w-4" aria-hidden />
              {paused ? 'Reanudar reloj' : 'Iniciar parada'}
            </Button>
          </div>
        ) : null}
      </div>
    </section>
  )
}

function formatClock(seconds: number): string {
  const sign = seconds < 0 ? '−' : ''
  const total = Math.abs(Math.floor(seconds))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = total % 60
  return `${sign}${hours} h ${String(minutes).padStart(2, '0')} min ${String(secs).padStart(2, '0')} s`
}

function AmbitoValue({ ambito }: { ambito?: string | null }) {
  const value = (ambito ?? '').trim().toUpperCase()
  if (value.includes('URBAN')) {
    return (
      <span className="inline-flex rounded-md bg-sky-50 px-2 py-0.5 text-[12px] font-semibold text-sky-800 dark:bg-sky-950/40 dark:text-sky-300">
        Urbana
      </span>
    )
  }
  if (value.includes('RURAL')) {
    return (
      <span className="inline-flex rounded-md bg-amber-50 px-2 py-0.5 text-[12px] font-semibold text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
        Rural
      </span>
    )
  }
  return <span className="text-slate-400">Sin ámbito</span>
}

function SummaryBand({ data }: { data: IncidentDetail }) {
  const reincidencia = data.antecedentes.reincidencia
  return (
    <dl className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200 sm:grid-cols-3 xl:grid-cols-6 dark:border-slate-800 dark:bg-slate-800">
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
      <KeyValue label="Ámbito">
        <AmbitoValue ambito={data.colegio.ambito} />
      </KeyValue>
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
          <KeyValue label="Ámbito">
            <AmbitoValue ambito={c.ambito} />
          </KeyValue>
          <KeyValue label="Energía">{c.energy_type ?? '—'}</KeyValue>
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
  selectedId?: ContactSelection
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
      <p className="px-1 text-[12px] text-slate-500 dark:text-slate-400">
        Aún no hay gestiones. Agrega detalle u observación para el seguimiento (la razón MINEDU es opcional).
      </p>
    )
  }
  return (
    <Panel title={`Historial de seguimiento (${managements.length})`}>
      <ul className="max-h-72 space-y-2 overflow-y-auto pr-1">
        {managements.map((m) => (
          <li key={m.id} className="rounded-lg border border-slate-200 px-3 py-2 text-[12px] dark:border-slate-700">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-semibold text-slate-500 tabular-nums">{formatDateTime(m.created_at)}</span>
              <ClassificationBadge classification={m.classification} label={m.classification_label} colorKey={m.color_key} />
              {m.scope ? <span className="font-semibold text-slate-600 dark:text-slate-300">{m.scope}</span> : null}
              {m.created_by_name ? <span className="text-slate-500">· {m.created_by_name}</span> : null}
            </div>
            {m.contact_name_snapshot ? (
              <p className="mt-1 text-slate-600 dark:text-slate-300">Contacto: {m.contact_name_snapshot}</p>
            ) : null}
            {m.detail ? <p className="mt-1 text-slate-700 dark:text-slate-300">{m.detail}</p> : null}
            {m.observation ? <p className="text-slate-500 dark:text-slate-400">{m.observation}</p> : null}
          </li>
        ))}
      </ul>
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
  const previous = data.historial.filter((h) => !h.es_actual).slice(0, 12)
  const totalPrev = Math.max(0, data.antecedentes.incidencias_registradas - 1)

  return (
    <div className="space-y-4">
      <Panel
        title="Línea de tiempo"
        icon={<History className="h-4 w-4 text-slate-500" aria-hidden />}
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
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center dark:border-slate-700 dark:bg-slate-950/60">
            <Clock3 className="mb-2 h-8 w-8 text-slate-400 dark:text-slate-500" aria-hidden />
            <p className="text-[13px] font-semibold text-slate-700 dark:text-slate-200">Sin eventos aún</p>
            <p className="mt-1 max-w-sm text-[12px] text-slate-500 dark:text-slate-400">
              Aquí aparecerán gestiones, cambios de estado y notas cuando se registren en esta caída.
            </p>
          </div>
        ) : (
          <ol className="relative space-y-0 border-l-2 border-slate-200 pl-5 dark:border-slate-700">
            {events.slice(0, visible).map((e, idx) => (
              <li key={e.id} className={`relative ${idx === 0 ? 'pt-0' : 'pt-3'}`}>
                <span
                  className={`absolute top-1.5 -left-[27px] h-3 w-3 rounded-full ring-4 ring-white dark:ring-slate-900 ${
                    idx === 0 ? 'bg-blue-500' : 'bg-slate-400 dark:bg-slate-500'
                  }`}
                />
                <article className="rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2.5 dark:border-slate-700 dark:bg-slate-950/50">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[12px]">
                    <time className="font-semibold text-slate-500 tabular-nums dark:text-slate-400">
                      {formatDateTime(e.at)}
                    </time>
                    <span className="font-semibold text-slate-900 dark:text-slate-100">{e.title}</span>
                    {e.actor ? <span className="text-slate-500 dark:text-slate-400">· {e.actor}</span> : null}
                  </div>
                  {e.detail ? (
                    <p className="mt-1 text-[12px] leading-snug text-slate-600 dark:text-slate-300">{e.detail}</p>
                  ) : null}
                </article>
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

      <Panel
        title={`Caídas anteriores (${totalPrev})`}
        icon={<Radio className="h-4 w-4 text-slate-500" aria-hidden />}
        action={
          data.colegio.school_id ? (
            <Link
              to={`/history/schools/${data.colegio.school_id}`}
              onClick={onNavigate}
              className="text-[12px] font-semibold text-blue-700 hover:underline dark:text-blue-300"
            >
              Ver todas
            </Link>
          ) : null
        }
      >
        {previous.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center dark:border-slate-700 dark:bg-slate-950/60">
            <p className="text-[13px] text-slate-500 dark:text-slate-400">No hay caídas anteriores para este CID.</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {previous.map((h) => {
              const active = h.status === 'ACTIVA'
              return (
                <li key={h.id}>
                  <Link
                    to={incidentCaseFilePath(h.id)}
                    onClick={onNavigate}
                    className="group flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 transition hover:border-blue-300 hover:bg-blue-50/50 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none dark:border-slate-700 dark:bg-slate-950 dark:hover:border-blue-500/50 dark:hover:bg-blue-950/20"
                  >
                    <span
                      className={`mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full ${
                        active ? 'bg-red-500' : 'bg-emerald-500'
                      }`}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-[13px] font-semibold text-slate-900 tabular-nums dark:text-slate-100">
                          {formatDateTime(h.started_at)}
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            active
                              ? 'bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-300'
                              : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300'
                          }`}
                        >
                          {active ? 'Activa' : 'Recuperada'}
                        </span>
                      </span>
                      <span className="mt-0.5 flex flex-wrap gap-x-3 text-[12px] text-slate-500 dark:text-slate-400">
                        <span className="inline-flex items-center gap-1">
                          <Clock3 className="h-3 w-3" aria-hidden />
                          {h.duracion ?? 'Sin duración'}
                        </span>
                        {h.recovered_at ? <span>Hasta {formatDateTime(h.recovered_at)}</span> : null}
                        {h.followup_status ? <FollowupBadge status={h.followup_status} /> : null}
                      </span>
                    </span>
                    <ChevronRight
                      className="h-4 w-4 shrink-0 text-slate-400 transition group-hover:text-blue-600 dark:group-hover:text-blue-300"
                      aria-hidden
                    />
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
        {previous.length > 0 && totalPrev > previous.length ? (
          <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
            Mostrando {previous.length} de {totalPrev}. Usa “Ver todas” para el historial del colegio.
          </p>
        ) : null}
      </Panel>
    </div>
  )
}
