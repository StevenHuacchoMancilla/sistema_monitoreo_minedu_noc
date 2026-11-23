import { useMemo, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Activity, ArrowDownRight, ArrowUpRight, Info, Radio } from 'lucide-react'
import { endpoints } from '../../../api/endpoints'
import { ErrorState, LoadingState } from '../../../components/ui/Estados'
import { formatDateTime24, formatDuration } from '../../../lib/fechaHora'

type Props = {
  incidentId: number
  cid?: string | null
  tss?: string | number | null
}

const PATRON_LABEL: Record<'continuo' | 'intermitente' | 'sin_datos', string> = {
  continuo: 'Una sola caída (sin levantamientos intermedios)',
  intermitente: 'Intermitente: hubo caídas y levantamientos',
  sin_datos: 'Sin segmentos PRTG en este periodo',
}

export function PanelCaidasPrtgIncidente({ incidentId, cid, tss }: Props) {
  const query = useQuery({
    queryKey: ['incidents', incidentId, 'prtg-outages'],
    queryFn: () => endpoints.incidentPrtgOutages(incidentId),
    staleTime: 60_000,
  })

  const nowMs = Date.now()
  const spans = useMemo(() => {
    const outages = query.data?.outages ?? []
    return outages.map((o) => {
      const start = Date.parse(o.start)
      const end = o.end ? Date.parse(o.end) : nowMs
      return {
        start,
        end: Number.isFinite(end) ? end : nowMs,
        seconds: o.seconds,
        open: !o.end,
        startIso: o.start,
        endIso: o.end,
      }
    }).filter((s) => Number.isFinite(s.start))
  }, [query.data?.outages, nowMs])

  const range = useMemo(() => {
    if (spans.length === 0) return null
    const start = Math.min(...spans.map((s) => s.start))
    const end = Math.max(...spans.map((s) => s.end))
    return { start, end: Math.max(end, start + 60_000) }
  }, [spans])

  if (query.isLoading) return <LoadingState label="Consultando caídas PRTG…" />
  if (query.isError) {
    return <ErrorState message={query.error instanceof Error ? query.error.message : 'No se pudo leer PRTG'} />
  }

  const data = query.data
  if (!data) return null

  const summary = data.summary
  const patronTone =
    summary.patron === 'intermitente'
      ? 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100'
      : summary.patron === 'continuo'
        ? 'border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-100'
        : 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-sky-200 bg-sky-50/80 px-4 py-3 dark:border-sky-900/50 dark:bg-sky-950/30">
        <div className="flex items-start gap-2">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-600 dark:text-sky-300" aria-hidden />
          <div className="min-w-0 text-[13px] leading-snug text-sky-950 dark:text-sky-100">
            <p className="font-semibold">Solo visual · no genera tickets</p>
            <p className="mt-0.5 text-sky-800/90 dark:text-sky-200/90">
              Muestra caídas y levantamientos del sensor Ping mientras corre esta incidencia.
              El conteo SLA (24 h y 08:00–16:00) no cambia.
            </p>
            <p className="mt-1 text-[12px] font-medium text-sky-700 dark:text-sky-300">
              {cid ? `CID ${cid}` : 'Sin CID'}
              {tss != null && tss !== '' ? ` · TSS ${tss}` : ''}
              {data.from && data.to ? ` · ${data.from.split('-').reverse().join('/')} → ${data.to.split('-').reverse().join('/')}` : ''}
              {data.sensor_name ? ` · ${data.sensor_name}` : ''}
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Caídas"
          value={String(summary.caidas)}
          hint="Segmentos DOWN ≥ 1 min"
          icon={<ArrowDownRight className="h-4 w-4" />}
          tone="rose"
        />
        <StatCard
          label="Levantamientos"
          value={String(summary.levantamientos)}
          hint="Veces que volvió UP"
          icon={<ArrowUpRight className="h-4 w-4" />}
          tone="emerald"
        />
        <StatCard
          label="Estado señal"
          value={summary.still_down ? 'Sigue caído' : summary.caidas > 0 ? 'Último UP' : 'Sin dato'}
          hint={summary.still_down ? 'Último segmento abierto' : 'Último segmento cerrado'}
          icon={<Radio className="h-4 w-4" />}
          tone={summary.still_down ? 'rose' : 'slate'}
        />
        <div className={`rounded-2xl border px-4 py-3 ${patronTone}`}>
          <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide opacity-80">
            <Activity className="h-3.5 w-3.5" aria-hidden />
            Patrón
          </p>
          <p className="mt-1 text-sm font-bold leading-snug">{PATRON_LABEL[summary.patron]}</p>
        </div>
      </div>

      {data.message ? (
        <p className="rounded-xl border border-dashed border-slate-300 bg-white px-3 py-2 text-[12px] text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">
          {data.message}
        </p>
      ) : null}

      {range && spans.length > 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Línea de tiempo (periodo incidencia)</p>
          <div className="relative mt-3 h-10 overflow-hidden rounded-xl bg-emerald-100 dark:bg-emerald-950/40">
            {spans.map((span, i) => {
              const left = ((span.start - range.start) / (range.end - range.start)) * 100
              const width = Math.max(0.4, ((span.end - span.start) / (range.end - range.start)) * 100)
              return (
                <div
                  key={`${span.start}-${i}`}
                  title={`${formatDateTime24(span.startIso)} → ${span.open ? 'sigue caído' : formatDateTime24(span.endIso)} · ${formatDuration(span.seconds)}`}
                  className={`absolute top-0 h-full ${span.open ? 'bg-rose-500' : 'bg-rose-400'} opacity-95`}
                  style={{ left: `${left}%`, width: `${width}%` }}
                />
              )
            })}
          </div>
          <div className="mt-2 flex flex-wrap gap-3 text-[11px] font-medium text-slate-500">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-rose-400" /> Caído
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-emerald-200 dark:bg-emerald-800" /> Activo / levantado
            </span>
            {data.ignored_under_minute > 0 ? (
              <span>Omitidas &lt; 1 min: {data.ignored_under_minute}</span>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800">
        <div className="border-b border-slate-200 bg-slate-50 px-4 py-2.5 dark:border-slate-800 dark:bg-slate-950/60">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Detalle de segmentos</h3>
          <p className="text-[11px] text-slate-500">Cada fila es una caída PRTG (≥ 1 minuto).</p>
        </div>
        {spans.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-slate-500">No hay caídas PRTG registradas en este periodo.</p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {spans.map((span, index) => (
              <li key={`${span.start}-${index}`} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-slate-800 dark:text-slate-100">
                    Caída #{index + 1}
                    {span.open ? (
                      <span className="ml-2 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-800 dark:bg-rose-950/60 dark:text-rose-200">
                        ABIERTA
                      </span>
                    ) : (
                      <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200">
                        LEVANTÓ
                      </span>
                    )}
                  </p>
                  <p className="mt-1 text-[12px] text-slate-600 dark:text-slate-300">
                    ↓ {formatDateTime24(span.startIso)}
                    {' · '}
                    ↑ {span.open ? 'sigue caído' : formatDateTime24(span.endIso)}
                  </p>
                </div>
                <p className="shrink-0 text-[12px] font-bold tabular-nums text-slate-700 dark:text-slate-200">
                  {formatDuration(span.seconds)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function StatCard({
  label,
  value,
  hint,
  icon,
  tone,
}: {
  label: string
  value: string
  hint: string
  icon: ReactNode
  tone: 'rose' | 'emerald' | 'slate'
}) {
  const tones = {
    rose: 'border-rose-200 bg-rose-50 dark:border-rose-900/50 dark:bg-rose-950/30',
    emerald: 'border-emerald-200 bg-emerald-50 dark:border-emerald-900/50 dark:bg-emerald-950/30',
    slate: 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900',
  }
  return (
    <div className={`rounded-2xl border px-4 py-3 ${tones[tone]}`}>
      <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        {icon}
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold tabular-nums tracking-tight text-slate-900 dark:text-slate-50">{value}</p>
      <p className="mt-0.5 text-[12px] text-slate-500">{hint}</p>
    </div>
  )
}
