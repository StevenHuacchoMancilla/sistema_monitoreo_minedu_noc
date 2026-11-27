import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Download, Gauge, ShieldAlert, ShieldCheck } from 'lucide-react'
import { Boton } from '../../../components/ui/Boton'
import { FormField, Input } from '../../../components/ui/ControlesFormulario'
import { EmptyState, ErrorState, LoadingState } from '../../../components/ui/Estados'
import { DataTableContainer, IsoDateTimeCell } from '../../../components/ui/MarcoTablaDatos'
import { todayLimaKey } from '../../../lib/fechaHora'
import { fetchSchoolSlaMonthly, incidentCaseFilePath } from '../api/apiHistorial'

/** Horas SLA en formato “36 h 00 min” (no “1 d 12 h”). */
function formatSlaHours(seconds: number | null | undefined): string {
  const total = Math.max(0, Math.floor(seconds ?? 0))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  return `${h} h ${String(m).padStart(2, '0')} min`
}

function currentMonthKey(): string {
  return todayLimaKey().slice(0, 7)
}

function shiftMonth(key: string, delta: number): string {
  const [y, m] = key.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + delta, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number)
  const label = new Intl.DateTimeFormat('es-PE', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(y, m - 1, 1)),
  )
  return label.charAt(0).toUpperCase() + label.slice(1)
}

function downloadCsv(
  schoolLabel: string,
  month: string,
  rows: Array<{
    ticket: string | null
    incident_id: number
    started_at: string | null
    recovered_at: string | null
    minedu_reason: string | null
    sla_label: string
    sla_seconds: number
    active: boolean
  }>,
  summary: { zone_label: string; used_label: string; cap_label: string; exceeded: boolean },
) {
  const lines = [
    ['Colegio', schoolLabel],
    ['Mes', month],
    ['Ámbito SLA', summary.zone_label],
    ['Consumido', summary.used_label],
    ['Cupo', summary.cap_label],
    ['Superó SLA', summary.exceeded ? 'SI' : 'NO'],
    [],
    ['Ticket', 'Incidencia', 'Apertura', 'Cierre', 'MINEDU', 'SLA del mes', 'Segundos', 'Activa'],
    ...rows.map((r) => [
      r.ticket ?? '',
      String(r.incident_id),
      r.started_at ?? '',
      r.recovered_at ?? (r.active ? 'Abierta' : ''),
      r.minedu_reason ?? '',
      r.sla_label,
      String(r.sla_seconds),
      r.active ? 'SI' : 'NO',
    ]),
  ]
  const csv = lines.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `sla_mensual_${schoolLabel.replace(/\s+/g, '_')}_${month}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export function PanelSlaMensualColegio({
  schoolId,
  schoolLabel,
}: {
  schoolId: number
  schoolLabel: string
}) {
  const [month, setMonth] = useState(currentMonthKey)

  const query = useQuery({
    queryKey: ['history', 'school', schoolId, 'sla-monthly', month],
    queryFn: () => fetchSchoolSlaMonthly(schoolId, month),
    enabled: schoolId > 0 && /^\d{4}-\d{2}$/.test(month),
  })

  const pct = useMemo(() => {
    const cap = query.data?.cap_seconds ?? 0
    const used = query.data?.used_seconds ?? 0
    if (cap <= 0) return 0
    return Math.min(100, Math.round((used / cap) * 100))
  }, [query.data])

  return (
    <section className="overflow-hidden rounded-md border border-noc-border bg-noc-surface">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-3 dark:border-slate-800">
        <div>
          <h2 className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-50">
            <Gauge className="h-4 w-4 text-indigo-500" aria-hidden />
            SLA mensual
          </h2>
          <p className="mt-0.5 text-[12px] text-slate-500">
            Consumo por caída (08:00–16:00, menos parada). Se reinicia cada mes. Solo caídas con razón MINEDU.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <FormField label="Mes" className="w-[9.5rem]">
            <Input
              type="month"
              value={month}
              max={currentMonthKey()}
              onChange={(e) => setMonth(e.target.value || currentMonthKey())}
            />
          </FormField>
          <Boton type="button" size="sm" variant="secondary" onClick={() => setMonth(shiftMonth(month, -1))}>
            Mes ant.
          </Boton>
          <Boton type="button" size="sm" variant="secondary" onClick={() => setMonth(currentMonthKey())}>
            Mes actual
          </Boton>
          <Boton
            type="button"
            size="sm"
            variant="secondary"
            disabled={!query.data}
            onClick={() => {
              if (!query.data) return
              downloadCsv(schoolLabel, month, query.data.incidents, {
                zone_label: query.data.zone_label,
                used_label: formatSlaHours(query.data.used_seconds),
                cap_label: formatSlaHours(query.data.cap_seconds),
                exceeded: query.data.exceeded,
              })
            }}
          >
            <Download className="h-3.5 w-3.5" aria-hidden />
            CSV
          </Boton>
        </div>
      </div>

      <div className="px-5 py-4">
        {query.isLoading ? <LoadingState label="Calculando SLA del mes…" /> : null}
        {query.isError ? (
          <ErrorState message={query.error instanceof Error ? query.error.message : 'No se pudo calcular el SLA'} />
        ) : null}

        {query.data ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-[13px]">
              <span className="font-semibold text-slate-800 dark:text-slate-100">{monthLabel(month)}</span>
              <span className="text-slate-400">·</span>
              <span className="text-slate-600 dark:text-slate-300">{query.data.zone_label}</span>
              <span className="text-slate-400">·</span>
              <span className="text-slate-500">{query.data.business_window}</span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <SummaryCard label="Cupo del mes" value={formatSlaHours(query.data.cap_seconds)} hint={query.data.zone_label} />
              <SummaryCard
                label="Consumido"
                value={formatSlaHours(query.data.used_seconds)}
                hint={`${query.data.incidents.length} caída(s) con MINEDU`}
              />
              <SummaryCard
                label="Restante"
                value={formatSlaHours(Math.max(0, query.data.remaining_seconds))}
                hint={query.data.exceeded ? 'Cupo agotado' : 'Disponible en el mes'}
                tone={query.data.exceeded ? 'danger' : 'ok'}
              />
              <div
                className={`rounded-2xl border px-4 py-3 ${
                  query.data.exceeded
                    ? 'border-rose-200 bg-rose-50 dark:border-rose-900/50 dark:bg-rose-950/30'
                    : 'border-emerald-200 bg-emerald-50 dark:border-emerald-900/50 dark:bg-emerald-950/30'
                }`}
              >
                <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  {query.data.exceeded ? <ShieldAlert className="h-3.5 w-3.5 text-rose-600" /> : <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />}
                  Resultado
                </p>
                <p className="mt-1 text-lg font-bold text-slate-900 dark:text-slate-50">
                  {query.data.exceeded ? 'Se superó el SLA mensual' : 'Dentro del SLA mensual'}
                </p>
                <p className="mt-0.5 text-[12px] text-slate-500">{pct}% del cupo</p>
              </div>
            </div>

            <div className="h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div
                className={`h-full rounded-full transition-all ${query.data.exceeded ? 'bg-rose-500' : 'bg-indigo-500'}`}
                style={{ width: `${Math.min(100, pct)}%` }}
              />
            </div>

            {query.data.incidents.length === 0 ? (
              <EmptyState title="Sin consumo SLA" description="No hay caídas con razón MINEDU en este mes." />
            ) : (
              <DataTableContainer>
                <table className="w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-950/50">
                      <th className="px-3 py-2">Ticket</th>
                      <th className="px-3 py-2">Apertura</th>
                      <th className="px-3 py-2">Cierre</th>
                      <th className="px-3 py-2">MINEDU</th>
                      <th className="px-3 py-2 text-right">SLA de esta caída (mes)</th>
                      <th className="px-3 py-2 text-right">Detalle</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {query.data.incidents.map((row) => (
                      <tr key={row.incident_id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                        <td className="px-3 py-2 font-mono text-[12px] font-semibold text-slate-800 dark:text-slate-100">
                          {row.ticket || `Inc #${row.incident_id}`}
                          {row.active ? (
                            <span className="ml-2 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800 dark:bg-amber-950/50 dark:text-amber-200">
                              ABIERTA
                            </span>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-[12px]">
                          <IsoDateTimeCell value={row.started_at} />
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-[12px]">
                          {row.recovered_at ? <IsoDateTimeCell value={row.recovered_at} /> : <span className="text-slate-400">Sin cierre</span>}
                        </td>
                        <td className="px-3 py-2 text-[12px] font-medium text-slate-700 dark:text-slate-200">
                          {row.minedu_reason || '—'}
                        </td>
                        <td className="px-3 py-2 text-right text-[13px] font-bold tabular-nums text-indigo-700 dark:text-indigo-300">
                          {row.sla_label}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Link
                            to={incidentCaseFilePath(row.incident_id)}
                            className="text-[12px] font-semibold text-blue-600 hover:underline dark:text-blue-300"
                          >
                            Ver
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-slate-200 bg-slate-50 font-bold dark:border-slate-700 dark:bg-slate-950/60">
                      <td className="px-3 py-2.5" colSpan={4}>
                        Total del mes
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-indigo-800 dark:text-indigo-200">
                        {formatSlaHours(query.data.used_seconds)}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </DataTableContainer>
            )}
          </div>
        ) : null}
      </div>
    </section>
  )
}

function SummaryCard({
  label,
  value,
  hint,
  tone = 'neutral',
}: {
  label: string
  value: string
  hint: string
  tone?: 'neutral' | 'ok' | 'danger'
}) {
  const tones = {
    neutral: 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900',
    ok: 'border-emerald-200 bg-emerald-50 dark:border-emerald-900/50 dark:bg-emerald-950/30',
    danger: 'border-rose-200 bg-rose-50 dark:border-rose-900/50 dark:bg-rose-950/30',
  }
  return (
    <div className={`rounded-2xl border px-4 py-3 ${tones[tone]}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-bold tabular-nums text-slate-900 dark:text-slate-50">{value}</p>
      <p className="mt-0.5 text-[12px] text-slate-500">{hint}</p>
    </div>
  )
}
