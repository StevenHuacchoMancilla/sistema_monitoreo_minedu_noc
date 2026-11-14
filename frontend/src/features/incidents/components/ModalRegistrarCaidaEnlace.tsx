import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Network, Search, X } from 'lucide-react'
import { endpoints } from '../../../api/endpoints'
import { ApiError } from '../../../api/clienteHttp'
import { Boton } from '../../../components/ui/Boton'
import { FormField, Input, Select } from '../../../components/ui/ControlesFormulario'
import { useValorDebounce } from '../../../lib/useValorDebounce'
import type { SchoolListRow } from '../../schools/types/colegio'

type LinkOutageCreated = {
  incidentId: number
}

type Props = {
  open: boolean
  onClose: () => void
  onCreated: (result: LinkOutageCreated) => void
  /** Prefill desde ficha de colegio */
  schoolId?: number
  schoolLabel?: string
}

/**
 * Registra caída de un solo enlace (doble WAN) mientras el Ping puede seguir OPERATIVO.
 * Va al apartado Enlace parcial hasta cierre manual. Si PRTG cae total después,
 * nace un ticket nuevo; este caso queda abierto.
 */
export function ModalRegistrarCaidaEnlace({ open, onClose, onCreated, schoolId, schoolLabel }: Props) {
  const client = useQueryClient()
  const [q, setQ] = useState('')
  const [selectedSchoolId, setSelectedSchoolId] = useState<number | null>(schoolId ?? null)
  const [selectedLabel, setSelectedLabel] = useState(schoolLabel ?? '')
  const [node, setNode] = useState<'PRINCIPAL' | 'SECUNDARIO' | ''>('')
  const [detail, setDetail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const debounced = useValorDebounce(q.trim(), 300)

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
      if (!node) throw new Error('Selecciona el enlace afectado')
      return endpoints.createManualPartial({
        school_id: selectedSchoolId,
        affected_wan_node: node,
        detail: detail.trim() || undefined,
      })
    },
    onSuccess: async (data) => {
      const id = Number(data?.incident?.id ?? data?.estado?.n_incidencia)
      await client.invalidateQueries({ queryKey: ['dashboard'] })
      await client.invalidateQueries({ queryKey: ['schools'] })
      await client.invalidateQueries({ queryKey: ['reports'] })
      await client.invalidateQueries({ queryKey: ['tracking'] })
      onCreated({ incidentId: id })
      onClose()
      setQ('')
      setNode('')
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
      if (msg === 'validation.required' || msg.startsWith('validation.')) {
        msg = 'Falta un dato obligatorio. Selecciona colegio y enlace afectado.'
      }
      setError(msg)
    },
  })

  if (!open) return null

  const rows = search.data?.data ?? []

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
              Para P2P / doble WAN: el colegio puede seguir con internet. Queda en Enlace parcial hasta cierre
              manual; una caída total PRTG genera ticket nuevo aparte. La causa y el seguimiento se definen
              después en la gestión del caso.
            </p>
          </div>
          <button type="button" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" onClick={onClose} aria-label="Cerrar">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 p-4">
          {!schoolId ? (
            <FormField label="Buscar colegio (CID / TSS / nombre)">
              <div className="relative">
                <Search className="pointer-events-none absolute top-2.5 left-2.5 h-4 w-4 text-slate-400" aria-hidden />
                <Input
                  className="pl-8"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="CID o TSS"
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
                              [
                                row.cid ? `CID ${row.cid}` : null,
                                row.n != null ? `TSS ${row.n}` : null,
                                row.local_educativo,
                              ]
                                .filter(Boolean)
                                .join(' · '),
                            )
                          }}
                        >
                          <span className="font-medium">{row.local_educativo ?? '—'}</span>
                          <span className="mt-0.5 block text-[11px] text-slate-500">
                            {[
                              row.cid ? `CID ${row.cid}` : 'Sin CID',
                              row.n != null ? `TSS ${row.n}` : null,
                              row.codigo_local,
                            ]
                              .filter(Boolean)
                              .join(' · ')}
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

          <FormField label="Detalle (opcional)">
            <Input
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              placeholder="Ej. Caída NA1 / sin respuesta del peer"
            />
          </FormField>

          {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}

          <div className="flex justify-end gap-2 pt-1">
            <Boton type="button" variant="secondary" size="sm" onClick={onClose}>
              Cancelar
            </Boton>
            <Boton
              type="button"
              size="sm"
              loading={create.isPending}
              disabled={!selectedSchoolId || !node}
              onClick={() => {
                setError(null)
                create.mutate()
              }}
            >
              Registrar y gestionar
            </Boton>
          </div>
        </div>
      </div>
    </div>
  )
}
