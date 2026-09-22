import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { endpoints } from '../../../api/endpoints'
import { FollowupBadge, PrtgStatusBadge, ReincidenteBadge } from '../../../components/monitoring/StatusBadges'
import { ErrorState, LoadingState } from '../../../components/ui/States'
import { CLASSIFICATION_BADGE_CLASS } from '../../reports/types/operationalReport'
import type { ManagementPayload } from '../../reports/types/operationalReport'

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-xs uppercase tracking-wide text-noc-muted">{label}</span>
      {children}
    </label>
  )
}

function DataGrid({ items }: { items: Array<{ label: string; value: ReactNode }> }) {
  return (
    <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => (
        <div key={item.label} className="rounded-xl border border-noc-border/70 bg-[#f5f5f7]/80 px-3 py-2">
          <dt className="text-[10px] font-semibold uppercase tracking-wide text-noc-muted">{item.label}</dt>
          <dd className="mt-0.5 text-sm text-noc-text">{item.value ?? '—'}</dd>
        </div>
      ))}
    </dl>
  )
}

const inputClass =
  'w-full rounded-xl border border-noc-border bg-white px-3 py-2 text-sm text-noc-text shadow-sm outline-none focus:border-noc-info'
const selectClass = inputClass
const textareaClass = `${inputClass} min-h-20 resize-y`

const RESULT_OPTIONS: Array<{
  value: ManagementPayload['classification']
  label: string
  hint: string
  color: string
}> = [
  {
    value: 'CONTACT_CONFIRMED',
    label: 'Contacto confirmado',
    hint: 'Se confirmó la situación con el local (rojo)',
    color: 'border-red-300 bg-red-50',
  },
  {
    value: 'NO_RESPONSE',
    label: 'Sin respuesta / no fue posible contactar',
    hint: 'Continúa caído sin contacto efectivo (naranja)',
    color: 'border-orange-300 bg-orange-50',
  },
  {
    value: 'COMPLAINT',
    label: 'Queja / reclamo del local educativo',
    hint: 'Queja o reclamo reportado (azul)',
    color: 'border-blue-300 bg-blue-50',
  },
]

export function IncidentManageModal({
  incidentId,
  onClose,
}: {
  incidentId: number
  onClose: () => void
}) {
  const client = useQueryClient()
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

  useEffect(() => {
    if (!detail.data) return
    const g = detail.data.gestion
    const current = g.management_classification
    if (current === 'CONTACT_CONFIRMED' || current === 'NO_RESPONSE' || current === 'COMPLAINT') {
      setClassification(current)
    } else {
      setClassification('')
    }
    setScope((g.management_scope as '' | 'PEXT' | 'PINT') || '')
    setContactId(g.last_managed_contact_id ?? '')
    setDetailText(g.detail_text ?? '')
    setObservation('')
  }, [detail.data])

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
      setSavedMsg('Gestión registrada')
      await client.invalidateQueries({ queryKey: ['dashboard'] })
      await client.invalidateQueries({ queryKey: ['reports'] })
      await client.invalidateQueries({ queryKey: ['incidents', incidentId] })
      client.setQueryData(['incidents', incidentId], data)
      window.setTimeout(() => setSavedMsg(null), 2500)
    },
  })

  const colorKey = detail.data?.gestion.management_classification
    ? detail.data.opciones.management_classifications?.find(
        (c) => c.value === detail.data?.gestion.management_classification,
      )?.color_key ??
      (detail.data.gestion.management_classification === 'NEW_OUTAGE' ? 'yellow' : 'slate')
    : 'yellow'

  const titleCid = detail.data?.colegio.cid ? `CID ${detail.data.colegio.cid}` : `Incidencia #${incidentId}`
  const subtitle =
    detail.data?.colegio.legacy_reference ??
    detail.data?.colegio.codigo_local ??
    detail.data?.colegio.local_educativo ??
    ''

  const managementHistory = useMemo(() => detail.data?.managements ?? [], [detail.data])

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-3 backdrop-blur-[2px] sm:p-6 md:p-8">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Cerrar" onClick={onClose} />
      <div className="relative z-10 mb-8 w-full max-w-4xl rounded-2xl border border-noc-border bg-noc-surface shadow-[0_24px_80px_rgba(0,0,0,0.18)]">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-noc-border bg-noc-surface px-5 py-4">
          <div>
            <h2 className="text-xl font-semibold text-noc-text">{titleCid}</h2>
            <p className="text-sm text-noc-muted">{subtitle}</p>
            {detail.data ? (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <PrtgStatusBadge status={detail.data.estado.estado_prtg} />
                <FollowupBadge status={detail.data.estado.followup_status} />
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                    CLASSIFICATION_BADGE_CLASS[colorKey] ?? CLASSIFICATION_BADGE_CLASS.slate
                  }`}
                >
                  {detail.data.gestion.management_classification_label ?? 'Nueva caída'}
                </span>
                <ReincidenteBadge count={detail.data.antecedentes.incidencias_registradas} />
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-noc-border px-3 py-1.5 text-sm text-noc-muted hover:text-noc-text"
          >
            Cerrar
          </button>
        </div>

        <div className="space-y-5 p-5">
          {detail.isLoading ? <LoadingState /> : null}
          {detail.isError ? (
            <ErrorState message={detail.error instanceof Error ? detail.error.message : 'Error'} />
          ) : null}

          {detail.data ? (
            <>
              <section>
                <h3 className="mb-2 text-sm font-semibold text-noc-text">Datos del local</h3>
                <DataGrid
                  items={[
                    { label: 'CID', value: detail.data.colegio.cid },
                    { label: 'Local educativo', value: detail.data.colegio.local_educativo },
                    { label: 'Código local', value: detail.data.colegio.codigo_local },
                    { label: 'Provincia', value: detail.data.colegio.provincia },
                    { label: 'Distrito', value: detail.data.colegio.distrito },
                    { label: 'Tecnología', value: detail.data.colegio.tecnologia },
                    { label: 'Nodo/POP', value: detail.data.colegio.nodo_pop },
                    { label: 'Presentación PRTG', value: detail.data.colegio.nombre_prtg },
                  ]}
                />
              </section>

              <section>
                <h3 className="mb-2 text-sm font-semibold text-noc-text">Estado PRTG</h3>
                <DataGrid
                  items={[
                    {
                      label: 'Estado actual',
                      value: <PrtgStatusBadge status={detail.data.estado.estado_prtg} />,
                    },
                    {
                      label: 'Fecha de caída (PRTG)',
                      value: detail.data.estado.fecha_caida
                        ? new Date(detail.data.estado.fecha_caida).toLocaleString('es-PE')
                        : '—',
                    },
                    { label: 'Duración', value: detail.data.estado.duracion },
                    {
                      label: 'Último check',
                      value: detail.data.estado.ultima_comprobacion
                        ? new Date(detail.data.estado.ultima_comprobacion).toLocaleString('es-PE')
                        : '—',
                    },
                    {
                      label: 'Tipo de acceso',
                      value: detail.data.colegio.tecnologia ?? '—',
                    },
                  ]}
                />
                <p className="mt-2 text-xs text-slate-500">
                  Fecha de caída y tipo son de solo lectura · provienen de PRTG / asignación de red.
                </p>
              </section>

              <section className="rounded-2xl border border-blue-200 bg-blue-50/40 p-4">
                <h3 className="mb-1 text-sm font-semibold text-noc-text">Resultado de gestión</h3>
                <p className="mb-3 text-xs font-medium text-slate-500">
                  Elige el resultado operativo (no colores). Se registrará en historial y actualizará el reporte.
                </p>
                <div className="grid gap-2">
                  {RESULT_OPTIONS.map((opt) => (
                    <label
                      key={opt.value}
                      className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 ${
                        classification === opt.value ? opt.color : 'border-slate-200 bg-white'
                      }`}
                    >
                      <input
                        type="radio"
                        className="mt-1"
                        name="mgmt-result"
                        checked={classification === opt.value}
                        onChange={() => setClassification(opt.value)}
                      />
                      <span>
                        <span className="block text-sm font-semibold text-slate-900">{opt.label}</span>
                        <span className="text-xs text-slate-500">{opt.hint}</span>
                      </span>
                    </label>
                  ))}
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <Field label="Contacto utilizado">
                    <select
                      className={selectClass}
                      value={contactId}
                      onChange={(e) => setContactId(e.target.value ? Number(e.target.value) : '')}
                    >
                      <option value="">— Sin seleccionar —</option>
                      {detail.data.contactos.map((c, idx) => (
                        <option key={c.id} value={c.id}>
                          {idx + 1}. {c.nombre ?? 'Sin nombre'} · {c.telefono ?? 's/n'}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="PEXT / PINT">
                    <select
                      className={selectClass}
                      value={scope}
                      onChange={(e) => setScope(e.target.value as '' | 'PEXT' | 'PINT')}
                    >
                      <option value="">— Sin definir —</option>
                      <option value="PEXT">PEXT (externo)</option>
                      <option value="PINT">PINT (interno)</option>
                    </select>
                  </Field>
                </div>

                <div className="mt-3 grid gap-3">
                  <Field label="DETALLE (texto libre reporte)">
                    <textarea
                      className={textareaClass}
                      value={detailText}
                      onChange={(e) => setDetailText(e.target.value)}
                      placeholder="Ej. Equipos encendidos / sin internet / queja de usuario"
                    />
                  </Field>
                  <Field label="Observación adicional">
                    <textarea
                      className={textareaClass}
                      value={observation}
                      onChange={(e) => setObservation(e.target.value)}
                      placeholder="Opcional · queda en historial"
                    />
                  </Field>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    disabled={!classification || save.isPending}
                    onClick={() => save.mutate()}
                    className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {save.isPending ? 'Guardando…' : 'Guardar gestión'}
                  </button>
                  {savedMsg ? <span className="text-sm font-semibold text-noc-success">{savedMsg}</span> : null}
                  {save.isError ? (
                    <span className="text-sm font-semibold text-noc-danger">
                      {save.error instanceof Error ? save.error.message : 'Error al guardar'}
                    </span>
                  ) : null}
                </div>
              </section>

              <section>
                <h3 className="mb-2 text-sm font-semibold text-noc-text">Contactos del local</h3>
                {detail.data.contactos.length === 0 ? (
                  <p className="text-sm text-noc-muted">Sin contactos registrados.</p>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-3">
                    {detail.data.contactos.map((c, idx) => (
                      <div key={c.id} className="rounded-xl border border-noc-border/70 bg-[#f5f5f7]/80 p-3 text-sm">
                        <p className="text-xs uppercase text-noc-muted">Contacto {idx + 1}</p>
                        <p className="mt-1 font-medium">{c.nombre ?? '—'}</p>
                        <p className="text-noc-muted">{c.cargo ?? '—'}</p>
                        <p className="mt-1">{c.telefono ?? '—'}</p>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section>
                <h3 className="mb-2 text-sm font-semibold text-noc-text">Historial de gestión</h3>
                {managementHistory.length === 0 ? (
                  <p className="text-sm text-noc-muted">Sin gestiones humanas aún · clasificación automática NUEVA CAÍDA.</p>
                ) : (
                  <ul className="space-y-2">
                    {managementHistory.map((m) => (
                      <li key={m.id} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-semibold text-slate-500">
                            {m.created_at ? new Date(m.created_at).toLocaleString('es-PE') : '—'}
                          </span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                              CLASSIFICATION_BADGE_CLASS[m.color_key ?? 'slate']
                            }`}
                          >
                            {m.classification_label}
                          </span>
                          {m.scope ? <span className="text-xs font-semibold text-slate-600">{m.scope}</span> : null}
                        </div>
                        {m.contact_name_snapshot ? (
                          <p className="mt-1 text-xs text-slate-600">
                            Contacto: {m.contact_name_snapshot}
                            {m.contact_role_snapshot ? ` · ${m.contact_role_snapshot}` : ''}
                            {m.contact_phone_snapshot ? ` · ${m.contact_phone_snapshot}` : ''}
                          </p>
                        ) : null}
                        {m.outage_text ? <p className="mt-1 text-xs"><span className="font-semibold">CAÍDA:</span> {m.outage_text}</p> : null}
                        {m.detail ? <p className="text-xs"><span className="font-semibold">DETALLE:</span> {m.detail}</p> : null}
                        {m.observation ? <p className="text-xs text-slate-500">{m.observation}</p> : null}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}
