import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Layers } from 'lucide-react'
import { AppLayout } from '../../../layouts/AppLayout'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Button } from '../../../components/ui/Button'
import { FormField, Select } from '../../../components/ui/FormControls'
import { EmptyState, ErrorState, LoadingState } from '../../../components/ui/States'
import { endpoints } from '../../../api/endpoints'
import type { MineduReason } from '../../reports/types/operationalReport'

type Row = {
  incident_id: number
  cid: string | null
  tss: number | null
  local_educativo: string | null
  provincia: string | null
  distrito: string | null
  started_at: string | null
  minedu_reason_label: string | null
}

type Cluster = {
  label: string | null
  count: number
  incidents: Row[]
}

export function SameHourOutagesPage() {
  const client = useQueryClient()
  const groups = useQuery({
    queryKey: ['incidents', 'same-hour'],
    queryFn: endpoints.sameHourGroups,
  })
  const [selected, setSelected] = useState<Record<number, number[]>>({})
  const [reason, setReason] = useState<Record<number, MineduReason>>({})
  const [detail, setDetail] = useState<Record<number, string>>({})
  const [message, setMessage] = useState<string | null>(null)

  const clusters = (groups.data?.data ?? []) as Cluster[]

  const apply = useMutation({
    mutationFn: (body: { incident_ids: number[]; minedu_reason: MineduReason; detail: string | null }) =>
      endpoints.applySameHour(body),
    onSuccess: async (res) => {
      setMessage(`Motivo aplicado a ${res.updated} colegios. Cada uno conserva su ticket.`)
      setSelected({})
      await client.invalidateQueries({ queryKey: ['incidents', 'same-hour'] })
      await client.invalidateQueries({ queryKey: ['reports', 'minedu'] })
    },
    onError: (err: unknown) => setMessage(err instanceof Error ? err.message : 'No se pudo aplicar el motivo.'),
  })

  const toggle = (clusterIndex: number, incidentId: number, on: boolean) => {
    setSelected((prev) => {
      const current = new Set(prev[clusterIndex] ?? clusters[clusterIndex]?.incidents.map((row) => row.incident_id) ?? [])
      if (on) current.add(incidentId)
      else current.delete(incidentId)
      return { ...prev, [clusterIndex]: [...current] }
    })
  }

  return (
    <AppLayout bare>
      <PageHeader
        title="Caídas de la misma hora"
        description="Cuando varios colegios caen casi juntos, suele ser energía. Se agrupan para ponerles el mismo motivo. Cada colegio sigue con su propio ticket, porque el Anexo 30 y el SLA son por local."
        icon={<Layers className="h-5 w-5" aria-hidden />}
      />
      {groups.isLoading ? <LoadingState /> : null}
      {groups.isError ? <ErrorState message="No se pudieron armar los grupos" /> : null}
      {!groups.isLoading && clusters.length === 0 ? (
        <EmptyState title="Sin grupos" description="No hay dos o más caídas activas dentro de 15 minutos." />
      ) : null}
      <div className="space-y-4">
        {clusters.map((cluster, index) => {
          const ids = selected[index] ?? cluster.incidents.map((row) => row.incident_id)
          return (
            <section key={`${cluster.label}-${index}`} className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {cluster.label} · {cluster.count} colegios
              </h2>
              <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
                {cluster.incidents.map((row) => (
                  <li key={row.incident_id} className="flex items-center gap-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      checked={ids.includes(row.incident_id)}
                      onChange={(event) => toggle(index, row.incident_id, event.target.checked)}
                    />
                    <span className="font-mono">{row.cid ?? '—'}</span>
                    <span className="min-w-0 flex-1 truncate">{row.local_educativo ?? '—'}</span>
                    <span className="text-slate-500">{row.started_at}</span>
                    <span className="text-slate-500">{row.minedu_reason_label ?? 'Sin motivo'}</span>
                  </li>
                ))}
              </ul>
              <form
                className="mt-3 flex flex-wrap items-end gap-3"
                onSubmit={(event) => {
                  event.preventDefault()
                  apply.mutate({
                    incident_ids: ids,
                    minedu_reason: reason[index] ?? 'CAIDA_ENLACE',
                    detail: detail[index] || null,
                  })
                }}
              >
                <FormField label="Motivo del grupo" className="min-w-56">
                  <Select
                    value={reason[index] ?? 'CAIDA_ENLACE'}
                    onChange={(event) => setReason((prev) => ({ ...prev, [index]: event.target.value as MineduReason }))}
                  >
                    <option value="CAIDA_ENLACE">Caída de enlace</option>
                    <option value="REQUERIMIENTO">Requerimiento</option>
                    <option value="QUEJA">Queja</option>
                  </Select>
                </FormField>
                <FormField label="Detalle común" className="min-w-72 flex-1">
                  <input
                    className="h-9 w-full rounded-lg border border-slate-200 px-3 text-sm dark:border-slate-700 dark:bg-slate-950"
                    value={detail[index] ?? ''}
                    onChange={(event) => setDetail((prev) => ({ ...prev, [index]: event.target.value }))}
                    placeholder="Detalle común del grupo"
                  />
                </FormField>
                <Button type="submit" disabled={ids.length < 2} loading={apply.isPending}>
                  Aplicar a {ids.length}
                </Button>
              </form>
            </section>
          )
        })}
      </div>
      {message ? <p className="mt-4 text-sm text-slate-600">{message}</p> : null}
    </AppLayout>
  )
}
