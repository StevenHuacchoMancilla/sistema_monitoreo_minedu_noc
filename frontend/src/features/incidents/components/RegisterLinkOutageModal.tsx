import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Network, Search, X } from 'lucide-react'
import { endpoints } from '../../../api/endpoints'
import { ApiError } from '../../../api/client'
import { Button } from '../../../components/ui/Button'
import { FormField, Input, Select } from '../../../components/ui/FormControls'
import { useDebouncedValue } from '../../../lib/useDebouncedValue'
import type { SchoolListRow } from '../../schools/types/school'
import type { ManagementPayload } from '../../reports/types/operationalReport'

type LinkOutageCreated = {
  incidentId: number
  classification: ManagementPayload['classification']
  trackingId: number | null
}

type Props = {
  open: boolean
  onClose: () => void
  onCreated: (result: LinkOutageCreated) => void
  /** Prefill desde ficha de colegio */
  schoolId?: number
  schoolLabel?: string
}

const TIPO_OPTIONS: Array<{
  value: ManagementPayload['classification']
  label: string
  hint: string
  selected: string
  radio: string
}> = [
  {
    value: 'CONTACT_CONFIRMED',
    label: 'TIPO 1',
    hint: 'Para reporte (colegio con impacto a reportar)',
    selected: 'border-red-600 bg-red-50 ring-2 ring-red-500/30 dark:border-red-500 dark:bg-red-950/50',
    radio: 'text-red-600',
  },
  {
    value: 'LINK_OUTAGE',
    label: 'TIPO 2',
    hint: 'Solo un enlace caído · gestión en Tracking',
    selected: 'border-orange-500 bg-orange-50 ring-2 ring-orange-500/30 dark:border-orange-400 dark:bg-orange-950/40',
    radio: 'text-orange-600',
  },
  {
    value: 'NO_RESPONSE',
    label: 'TIPO 3',
    hint: 'Sin respuesta / energía · gestión en Tracking',
    selected: 'border-yellow-500 bg-yellow-50 ring-2 ring-yellow-500/30 dark:border-yellow-400 dark:bg-yellow-950/30',
    radio: 'text-yellow-600',
  },
]

/**
 * Registra caída de un solo enlace (doble WAN) mientras el Ping puede seguir OPERATIVO.
 * Al guardar aplica TIPO 1/2/3: TIPO 1 entra al reporte; 2 y 3 abren Tracking.
 */
export function RegisterLinkOutageModal({ open, onClose, onCreated, schoolId, schoolLabel }: Props) {
  const client = useQueryClient()
  const [q, setQ] = useState('')
  const [selectedSchoolId, setSelectedSchoolId] = useState<number | null>(schoolId ?? null)
  const [selectedLabel, setSelectedLabel] = useState(schoolLabel ?? '')
  const [node, setNode] = useState<'PRINCIPAL' | 'SECUNDARIO' | ''>('')
  const [classification, setClassification] = useState<ManagementPayload['classification'] | ''>('LINK_OUTAGE')
  const [detail, setDetail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const debounced = useDebouncedValue(q.trim(), 300)

  const search = useQuery({
    queryKey: ['schools', 'link-outage-search', debounced],
    queryFn: () =>
      endpoints.schools({
        q: debounced || undefined,
        active: '1',
        per_page: '15',
        page: '1',
      }),
    enabled: open && !schoolId && debounced.length >= 2,
  })

  const create = useMutation({
    mutationFn: () => {
      if (!selectedSchoolId) throw new Error('Selecciona un colegio')
      if (!node) throw new Error('Selecciona el nodo afectado')
      if (!classification) throw new Error('Selecciona TIPO 1, 2 o 3')
      return endpoints.createManualPartial({
        school_id: selectedSchoolId,
        affected_wan_node: node,
        classification,
        detail: detail.trim() || undefined,
      })
    },
    onSuccess: async (data) => {
      const id = Number(data?.incident?.id ?? data?.estado?.n_incidencia)
      const trackingId = data.tracking_sync?.tracking_id ?? data.active_tracking?.id ?? null
      await client.invalidateQueries({ queryKey: ['dashboard'] })
      await client.invalidateQueries({ queryKey: ['schools'] })
      await client.invalidateQueries({ queryKey: ['reports'] })
      await client.invalidateQueries({ queryKey: ['tracking'] })
      onCreated({
        incidentId: id,
        classification: classification as ManagementPayload['classification'],
        trackingId: trackingId != null ? Number(trackingId) : null,
      })
      onClose()
      setQ('')
      setNode('')
      setClassification('LINK_OUTAGE')
      setDetail('')
      setError(null)
      if (!schoolId) {
        setSelectedSchoolId(null)
        setSelectedLabel('')
      }
    },
    onError: (e: unknown) => {
      let msg = 'No se pudo registrar la caída de enlace'
      if (e instanceof ApiError) {
        msg = e.message
        const errors = (e.body as { errors?: Record<string, string[] | string> } | null)?.errors
        if (errors && typeof errors === 'object') {
          const first = Object.values(errors).flat().find((v) => typeof v === 'string' && v.trim())
          if (typeof first === 'string') msg = first
        }
      } else if (e && typeof e === 'object') {
        const err = e as { message?: string; body?: { message?: string } }
        if (typeof err.body?.message === 'string') msg = err.body.message
        else if (typeof err.message === 'string') msg = err.message
      }
      // Laravel sin locale muestra "validation.required"
      if (msg === 'validation.required' || msg.startsWith('validation.')) {
        msg = 'Falta un dato obligatorio. Selecciona colegio, enlace afectado y TIPO 1/2/3.'
      }
      setError(msg)
    },
  })

  if (!open) return null

  const rows = search.data?.data ?? []
  const goesToTracking = classification === 'LINK_OUTAGE' || classification === 'NO_RESPONSE'

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-3 sm:items-center" role="dialog" aria-modal>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
          <div>
            <p className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
              <Network className="h-4 w-4 text-amber-600" aria-hidden />
              Caída de un enlace (doble WAN)
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Para P2P / doble WAN: el colegio puede seguir con internet. No reemplaza la caída total de Ping.
            </p>
          </div>
          <button type="button" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" onClick={onClose} aria-label="Cerrar">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 p-4">
          {!schoolId ? (
            <FormField label="Buscar colegio (CID / nombre / código)">
              <div className="relative">
                <Search className="pointer-events-none absolute top-2.5 left-2.5 h-4 w-4 text-slate-400" aria-hidden />
                <Input
                  className="pl-8"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Ej. 258778 o nombre del local"
                />
              </div>
              {selectedSchoolId ? (
                <p className="mt-1.5 text-xs font-medium text-sky-700 dark:text-sky-300">
                  Seleccionado: {selectedLabel || `ID ${selectedSchoolId}`}
                </p>
              ) : null}
              {debounced.length >= 2 ? (
                <ul className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700">
                  {search.isFetching ? (
                    <li className="px-3 py-2 text-xs text-slate-500">Buscando…</li>
                  ) : rows.length === 0 ? (
                    <li className="px-3 py-2 text-xs text-slate-500">Sin resultados</li>
                  ) : (
                    rows.map((row: SchoolListRow) => (
                      <li key={row.id}>
                        <button
                          type="button"
                          className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
                          onClick={() => {
                            setSelectedSchoolId(row.id)
                            setSelectedLabel(
                              [row.cid ? `CID ${row.cid}` : null, row.local_educativo, row.codigo_local]
                                .filter(Boolean)
                                .join(' · '),
                            )
                          }}
                        >
                          <span className="font-medium">{row.local_educativo ?? '—'}</span>
                          <span className="mt-0.5 block text-[11px] text-slate-500">
                            {row.cid ? `CID ${row.cid}` : 'Sin CID'} · {row.codigo_local ?? '—'}
                          </span>
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              ) : null}
            </FormField>
          ) : (
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800/60">
              {schoolLabel || `Colegio #${schoolId}`}
            </p>
          )}

          <FormField label="Enlace afectado">
            <Select
              value={node}
              onChange={(e) => setNode(e.target.value as 'PRINCIPAL' | 'SECUNDARIO' | '')}
            >
              <option value="">Seleccionar…</option>
              <option value="PRINCIPAL">Nodo principal (WAN A)</option>
              <option value="SECUNDARIO">Nodo secundario (WAN B)</option>
            </Select>
          </FormField>

          <fieldset>
            <legend className="mb-1.5 text-[11px] font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">
              Clasificación (TIPO)
            </legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {TIPO_OPTIONS.map((opt) => {
                const active = classification === opt.value
                return (
                  <label
                    key={opt.value}
                    className={[
                      'cursor-pointer rounded-xl border px-2.5 py-2.5 transition-colors',
                      active
                        ? opt.selected
                        : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-600',
                    ].join(' ')}
                  >
                    <span className="flex items-start gap-2">
                      <input
                        type="radio"
                        name="link-outage-tipo"
                        className={`mt-0.5 ${opt.radio}`}
                        checked={active}
                        onChange={() => setClassification(opt.value)}
                      />
                      <span>
                        <span className="block text-sm font-bold text-slate-900 dark:text-slate-100">{opt.label}</span>
                        <span className="mt-0.5 block text-[11px] leading-snug text-slate-500 dark:text-slate-400">
                          {opt.hint}
                        </span>
                      </span>
                    </span>
                  </label>
                )
              })}
            </div>
          </fieldset>

          <FormField label="Detalle (opcional)">
            <Input
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              placeholder="Ej. Caída NA1 / sin respuesta del peer"
            />
          </FormField>

          {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" size="sm" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              loading={create.isPending}
              disabled={!selectedSchoolId || !node || !classification}
              onClick={() => {
                setError(null)
                create.mutate()
              }}
            >
              {goesToTracking ? 'Registrar e ir a Tracking' : 'Registrar (para reporte)'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
