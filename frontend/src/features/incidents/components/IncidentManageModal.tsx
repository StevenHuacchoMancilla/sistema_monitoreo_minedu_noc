import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { endpoints } from '../../../api/endpoints'
import { FollowupBadge, PrtgStatusBadge, ReincidenteBadge } from '../../../components/monitoring/StatusBadges'
import { ErrorState, LoadingState } from '../../../components/ui/States'
import type { IncidentGestionPayload } from '../../../types/api'

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
const textareaClass = `${inputClass} min-h-24 resize-y`

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

  const [form, setForm] = useState<IncidentGestionPayload>({})
  const [historyLimit, setHistoryLimit] = useState(3)
  const [savedMsg, setSavedMsg] = useState<string | null>(null)

  useEffect(() => {
    if (!detail.data) return
    const g = detail.data.gestion
    setForm({
      followup_status: g.followup_status ?? 'PENDIENTE_CONTACTO',
      contact_status: g.contact_status ?? '',
      contact_result: g.contact_result ?? '',
      responsible_area: g.responsible_area ?? '',
      glpi_ticket: g.glpi_ticket ?? '',
      diagnosis: g.diagnosis ?? '',
      evidence_observations: g.evidence_observations ?? '',
      cause: g.cause ?? '',
    })
  }, [detail.data])

  const save = useMutation({
    mutationFn: () =>
      endpoints.updateIncident(incidentId, {
        ...form,
        contact_status: form.contact_status || null,
      }),
    onSuccess: async (data) => {
      setSavedMsg('Gestión guardada')
      await client.invalidateQueries({ queryKey: ['dashboard'] })
      await client.invalidateQueries({ queryKey: ['incidents', incidentId] })
      client.setQueryData(['incidents', incidentId], data)
      window.setTimeout(() => setSavedMsg(null), 2500)
    },
  })

  const historialVisible = useMemo(() => {
    const rows = detail.data?.historial ?? []
    return rows.slice(0, historyLimit)
  }, [detail.data, historyLimit])

  const titleCid = detail.data?.colegio.cid ? `CID ${detail.data.colegio.cid}` : `Incidencia #${incidentId}`
  const subtitle =
    detail.data?.colegio.legacy_reference ??
    detail.data?.colegio.codigo_local ??
    detail.data?.colegio.local_educativo ??
    ''

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-3 backdrop-blur-[2px] sm:p-6 md:p-8">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Cerrar" onClick={onClose} />
      <div className="relative z-10 mb-8 w-full max-w-4xl rounded-2xl border border-noc-border bg-noc-surface shadow-[0_24px_80px_rgba(0,0,0,0.18)]">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-noc-border bg-noc-surface px-5 py-4">
          <div>
            <h2 className="text-xl font-semibold text-noc-text">{titleCid}</h2>
            <p className="text-sm text-noc-muted">{subtitle}</p>
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
                <h3 className="mb-2 text-sm font-semibold text-noc-text">Estado de la incidencia</h3>
                <DataGrid
                  items={[
                    {
                      label: 'Estado PRTG',
                      value: <PrtgStatusBadge status={detail.data.estado.estado_prtg} />,
                    },
                    { label: 'Estado original PRTG', value: detail.data.estado.estado_prtg_text },
                    {
                      label: 'Fecha/hora caída',
                      value: detail.data.estado.fecha_caida
                        ? new Date(detail.data.estado.fecha_caida).toLocaleString()
                        : '—',
                    },
                    { label: 'Duración', value: detail.data.estado.duracion },
                    {
                      label: 'Última comprobación',
                      value: detail.data.estado.ultima_comprobacion
                        ? new Date(detail.data.estado.ultima_comprobacion).toLocaleString()
                        : '—',
                    },
                    { label: 'N° incidencia', value: detail.data.estado.n_incidencia },
                    {
                      label: 'Seguimiento',
                      value: <FollowupBadge status={detail.data.estado.followup_status} />,
                    },
                    {
                      label: 'Sensor PRTG',
                      value: detail.data.estado.prtg_sensor_objid ?? detail.data.estado.sensor_id,
                    },
                  ]}
                />
              </section>

              <section>
                <h3 className="mb-2 text-sm font-semibold text-noc-text">Datos del colegio</h3>
                <DataGrid
                  items={[
                    { label: 'Local educativo', value: detail.data.colegio.local_educativo },
                    { label: 'Código local', value: detail.data.colegio.codigo_local },
                    { label: 'Departamento', value: detail.data.colegio.departamento },
                    { label: 'Provincia', value: detail.data.colegio.provincia },
                    { label: 'Distrito', value: detail.data.colegio.distrito },
                    { label: 'Centro poblado', value: detail.data.colegio.centro_poblado },
                    { label: 'Tecnología', value: detail.data.colegio.tecnologia },
                    { label: 'Nodo/POP', value: detail.data.colegio.nodo_pop },
                    { label: 'IP loopback', value: detail.data.colegio.ip_loopback },
                    { label: 'IP pública', value: detail.data.colegio.ip_publica },
                    { label: 'Clasificación', value: detail.data.colegio.clasificacion },
                    {
                      label: 'Capacidad',
                      value: detail.data.colegio.capacidad_mbps
                        ? `${detail.data.colegio.capacidad_mbps} Mbps`
                        : '—',
                    },
                    { label: 'Nombre PRTG', value: detail.data.colegio.nombre_prtg },
                  ]}
                />
              </section>

              <section>
                <h3 className="mb-2 text-sm font-semibold text-noc-text">Cloudnet</h3>
                {detail.data.cloudnet ? (
                  <DataGrid
                    items={[
                      { label: 'Site', value: detail.data.cloudnet.site_name },
                      { label: 'Shop ID', value: detail.data.cloudnet.shop_id },
                      { label: 'Dirección', value: detail.data.cloudnet.address },
                      { label: 'Asociación', value: detail.data.cloudnet.match_status },
                      { label: 'Equipos', value: detail.data.cloudnet.devices ?? 0 },
                      {
                        label: 'Último sync',
                        value: detail.data.cloudnet.last_synced_at
                          ? new Date(detail.data.cloudnet.last_synced_at).toLocaleString()
                          : '—',
                      },
                    ]}
                  />
                ) : (
                  <p className="text-sm text-noc-muted">Sin site Cloudnet vinculado a este colegio.</p>
                )}
              </section>

              <section>
                <h3 className="mb-2 text-sm font-semibold text-noc-text">Contactos</h3>
                {detail.data.contactos.length === 0 ? (
                  <p className="text-sm text-noc-muted">Sin contactos registrados.</p>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {detail.data.contactos.map((c, idx) => (
                      <div key={c.id} className="rounded-xl border border-noc-border/70 bg-[#f5f5f7]/80 p-3 text-sm">
                        <p className="text-xs uppercase text-noc-muted">
                          {idx === 0 ? 'Contacto principal' : `Contacto alterno ${idx}`}
                        </p>
                        <p className="mt-1 font-medium">{c.nombre ?? '—'}</p>
                        <p className="text-noc-muted">{c.cargo ?? '—'}</p>
                        <p className="mt-1">{c.telefono ?? '—'}</p>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section>
                <h3 className="mb-2 text-sm font-semibold text-noc-text">Antecedentes del CID</h3>
                <div className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <div className="rounded-lg border border-noc-border/60 p-3 text-center">
                    <p className="text-xs text-noc-muted">Registradas</p>
                    <p className="text-lg font-semibold">{detail.data.antecedentes.incidencias_registradas}</p>
                  </div>
                  <div className="rounded-lg border border-noc-border/60 p-3 text-center">
                    <p className="text-xs text-noc-muted">Recuperadas</p>
                    <p className="text-lg font-semibold text-noc-success">
                      {detail.data.antecedentes.recuperadas}
                    </p>
                  </div>
                  <div className="rounded-lg border border-noc-border/60 p-3 text-center">
                    <p className="text-xs text-noc-muted">Activas</p>
                    <p className="text-lg font-semibold text-noc-danger">{detail.data.antecedentes.activas}</p>
                  </div>
                  <div className="rounded-lg border border-noc-border/60 p-3 text-center">
                    <p className="text-xs text-noc-muted">Reincidente</p>
                    <p className="text-lg font-semibold">
                      {detail.data.antecedentes.reincidente ? (
                        <span className="text-noc-warning">sí</span>
                      ) : (
                        'no'
                      )}
                    </p>
                  </div>
                </div>
                {detail.data.antecedentes.reincidente ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    Colegio reincidente · Este CID registra {detail.data.antecedentes.incidencias_registradas}{' '}
                    incidencias.
                  </div>
                ) : null}
              </section>

              {(() => {
                const lastRecovery = (detail.data.historial ?? []).find((row) => row.recovered_at)
                if (!lastRecovery) return null
                return (
                  <section>
                    <h3 className="mb-2 text-sm font-semibold text-noc-text">Última recuperación</h3>
                    <DataGrid
                      items={[
                        { label: 'Incidencia', value: `#${lastRecovery.id}` },
                        {
                          label: 'Recuperado',
                          value: lastRecovery.recovered_at
                            ? new Date(lastRecovery.recovered_at).toLocaleString()
                            : '—',
                        },
                        {
                          label: 'Inicio de caída',
                          value: lastRecovery.started_at
                            ? new Date(lastRecovery.started_at).toLocaleString()
                            : '—',
                        },
                        { label: 'Duración', value: lastRecovery.duracion ?? '—' },
                      ]}
                    />
                  </section>
                )
              })()}

              <section>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-semibold text-noc-text">
                    Incidencia #{detail.data.estado.n_incidencia} · ACTUAL
                  </h3>
                  <FollowupBadge status={detail.data.estado.followup_status} />
                  {detail.data.estado.activa ? <PrtgStatusBadge status="CAIDO" /> : <FollowupBadge status="RECUPERADO" />}
                  <ReincidenteBadge count={detail.data.antecedentes.incidencias_registradas} />
                </div>
                <DataGrid
                  items={[
                    {
                      label: 'Fecha/hora caída',
                      value: detail.data.estado.fecha_caida
                        ? new Date(detail.data.estado.fecha_caida).toLocaleString()
                        : '—',
                    },
                    {
                      label: 'Recuperación',
                      value: detail.data.estado.recovered_at
                        ? new Date(detail.data.estado.recovered_at).toLocaleString()
                        : 'Incidencia activa',
                    },
                    { label: 'Duración', value: detail.data.estado.duracion },
                    {
                      label: 'Estado PRTG',
                      value: <PrtgStatusBadge status={detail.data.estado.estado_prtg} />,
                    },
                    {
                      label: 'Estado seguimiento',
                      value: <FollowupBadge status={detail.data.gestion.followup_status} />,
                    },
                    {
                      label: 'Contacto confirmado',
                      value: detail.data.gestion.contact_status ?? '—',
                    },
                    { label: 'Responsable / Área', value: detail.data.gestion.responsible_area ?? '—' },
                    { label: 'Ticket GLPI', value: detail.data.gestion.glpi_ticket ?? '—' },
                    {
                      label: 'Último contacto',
                      value: detail.data.gestion.last_contact_at
                        ? new Date(detail.data.gestion.last_contact_at).toLocaleString()
                        : 'Sin gestión registrada',
                    },
                  ]}
                />
              </section>

              <section>
                <h3 className="mb-2 text-sm font-semibold text-noc-text">Antecedentes recientes</h3>
                <ul className="space-y-2">
                  {historialVisible.map((row) => (
                    <li
                      key={row.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-noc-border/60 px-3 py-2 text-sm"
                    >
                      <div>
                        <p className="font-medium">
                          Incidencia #{row.id}
                          {row.es_actual ? ' · ACTUAL' : ''}
                        </p>
                        <p className="text-xs text-noc-muted">
                          {row.started_at ? new Date(row.started_at).toLocaleString() : '—'}
                          {' → '}
                          {row.recovered_at ? new Date(row.recovered_at).toLocaleString() : 'activa'}
                          {row.duracion ? ` · ${row.duracion}` : ''}
                        </p>
                      </div>
                      <FollowupBadge status={row.status === 'ACTIVA' ? 'ACTIVA' : 'RECUPERADA'} />
                    </li>
                  ))}
                </ul>
                {(detail.data.historial.length ?? 0) > historyLimit ? (
                  <button
                    type="button"
                    className="mt-2 text-sm text-noc-info hover:underline"
                    onClick={() => setHistoryLimit((n) => n + 5)}
                  >
                    Mostrar 5 más · quedan {(detail.data.historial.length ?? 0) - historyLimit}
                  </button>
                ) : null}
              </section>

              <section className="rounded-2xl border border-noc-border bg-[#f5f5f7]/60 p-4">
                <h3 className="mb-3 text-sm font-semibold text-noc-text">Gestión y seguimiento</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Estado seguimiento">
                    <select
                      className={selectClass}
                      value={form.followup_status ?? ''}
                      onChange={(e) => setForm((f) => ({ ...f, followup_status: e.target.value }))}
                    >
                      {detail.data.opciones.followup_statuses.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Contacto confirmado">
                    <select
                      className={selectClass}
                      value={form.contact_status ?? ''}
                      onChange={(e) => setForm((f) => ({ ...f, contact_status: e.target.value }))}
                    >
                      <option value="">Seleccionar...</option>
                      {detail.data.opciones.contact_statuses.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Resultado del contacto">
                    <select
                      className={selectClass}
                      value={form.contact_result ?? ''}
                      onChange={(e) => setForm((f) => ({ ...f, contact_result: e.target.value }))}
                    >
                      <option value="">Seleccionar...</option>
                      {(detail.data.opciones.contact_results ?? []).map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Responsable / Área">
                    <input
                      className={inputClass}
                      value={form.responsible_area ?? ''}
                      onChange={(e) => setForm((f) => ({ ...f, responsible_area: e.target.value }))}
                      placeholder="Ej. NOC / Soporte / Responsable"
                    />
                  </Field>
                  <Field label="Ticket GLPI">
                    <input
                      className={inputClass}
                      value={form.glpi_ticket ?? ''}
                      onChange={(e) => setForm((f) => ({ ...f, glpi_ticket: e.target.value }))}
                      placeholder="Número o código del ticket"
                    />
                  </Field>
                  <Field label="Último contacto registrado">
                    <input
                      className={inputClass}
                      disabled
                      value={
                        detail.data.gestion.last_contact_at
                          ? new Date(detail.data.gestion.last_contact_at).toLocaleString()
                          : 'Sin gestión registrada'
                      }
                    />
                  </Field>
                  <div className="sm:col-span-2">
                    <Field label="Diagnóstico / acciones realizadas">
                      <textarea
                        className={textareaClass}
                        value={form.diagnosis ?? ''}
                        onChange={(e) => setForm((f) => ({ ...f, diagnosis: e.target.value }))}
                        placeholder="Detalle de la validación, descarte o acciones realizadas..."
                      />
                    </Field>
                  </div>
                  <div className="sm:col-span-2">
                    <Field label="Evidencia / observaciones">
                      <textarea
                        className={textareaClass}
                        value={form.evidence_observations ?? ''}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, evidence_observations: e.target.value }))
                        }
                        placeholder="Observaciones adicionales, evidencias, acuerdos, etc."
                      />
                    </Field>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-end gap-3">
                  {savedMsg ? <span className="text-sm text-noc-success">{savedMsg}</span> : null}
                  {save.isError ? (
                    <span className="text-sm text-noc-danger">
                      {save.error instanceof Error ? save.error.message : 'Error al guardar'}
                    </span>
                  ) : null}
                  <button
                    type="button"
                    disabled={save.isPending}
                    onClick={() => save.mutate()}
                    className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-60"
                  >
                    {save.isPending ? 'Guardando…' : 'Guardar gestión'}
                  </button>
                </div>
              </section>
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}
