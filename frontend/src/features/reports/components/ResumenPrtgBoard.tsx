import { useMemo, useState } from 'react'
import type { ResumenPrtg } from '../types/operationalReport'
import { LISTA_ESTADO_BADGE } from '../types/operationalReport'
import { Select } from '../../../components/ui/FormControls'

type Props = {
  data: ResumenPrtg
  zonas?: string[]
  selectedZona?: string
  onZonaChange?: (zona: string) => void
  onSelectEstado?: (estado: string) => void
}

function Kpi({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: 'neutral' | 'up' | 'down' | 'warn'
}) {
  const toneClass =
    tone === 'up'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
      : tone === 'down'
        ? 'border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300'
        : tone === 'warn'
          ? 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200'
          : 'border-slate-200 bg-slate-50 text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200'

  return (
    <div className={`rounded-xl border px-4 py-3 ${toneClass}`}>
      <p className="text-[11px] font-semibold tracking-wide uppercase opacity-80">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value.toLocaleString('es-PE')}</p>
    </div>
  )
}

export function ResumenPrtgBoard({ data, zonas = [], selectedZona = '', onZonaChange, onSelectEstado }: Props) {
  const [breakdownEstado, setBreakdownEstado] = useState('Averias')
  const caidos = data.groups.filter((g) => g.group === 'Caídos')
  const extras = data.groups.filter((g) => g.group !== 'Caídos')

  const rootRows = useMemo(() => {
    if (!breakdownEstado) return data.by_root_cause
    const filtered = data.by_root_cause.filter((r) => (r.estado ?? '') === breakdownEstado)
    return filtered.length > 0 ? filtered : data.by_root_cause
  }, [data.by_root_cause, breakdownEstado])

  const selectedGroup = data.groups.find((g) => g.estado === breakdownEstado)

  return (
    <div className="space-y-6">
      <div className="mb-0 grid min-w-0 grid-cols-1 gap-3 min-[420px]:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Total en tablero" value={data.totals.all} tone="neutral" />
        <Kpi label="✔ PRTG activo" value={data.totals.up} tone="up" />
        <Kpi label="✖ Caídos PRTG" value={data.totals.down} tone="down" />
        <Kpi label="Subtotal caídos" value={data.caidos_subtotal.total} tone="warn" />
      </div>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-end sm:justify-between dark:border-slate-800">
          <div>
            <p className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase">{data.date}</p>
            <h2 className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">{data.title}</h2>
            <p className="mt-1 text-[12px] text-slate-500 dark:text-slate-400">
              {data.legend.up} · {data.legend.down}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-[12px] font-semibold text-slate-500">Zona</label>
            <Select
              className="h-9 min-w-[10rem]"
              value={selectedZona}
              onChange={(e) => onZonaChange?.(e.target.value)}
            >
              <option value="">TODAS</option>
              {zonas.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-left text-[13px]">
            <thead className="bg-slate-800 text-white">
              <tr>
                <th className="px-4 py-2.5 text-[11px] font-semibold tracking-wide uppercase">Grupo</th>
                <th className="px-4 py-2.5 text-[11px] font-semibold tracking-wide uppercase">Estado</th>
                <th className="px-4 py-2.5 text-right text-[11px] font-semibold tracking-wide uppercase">Cantidad ✔</th>
                <th className="px-4 py-2.5 text-right text-[11px] font-semibold tracking-wide uppercase">Caídos en PRTG</th>
                <th className="px-4 py-2.5 text-right text-[11px] font-semibold tracking-wide uppercase">Total</th>
              </tr>
            </thead>
            <tbody>
              {caidos.map((row, idx) => (
                <tr
                  key={row.estado}
                  className={`border-b border-slate-100 dark:border-slate-800 ${
                    breakdownEstado === row.estado ? 'bg-blue-50/70 dark:bg-blue-950/30' : ''
                  }`}
                >
                  <td className="px-4 py-2.5 text-slate-500">{idx === 0 ? 'Caídos' : ''}</td>
                  <td className="px-4 py-2.5">
                    <button
                      type="button"
                      className="inline-flex items-center gap-2"
                      onClick={() => setBreakdownEstado(row.estado)}
                      title="Ver desglose de este estado"
                    >
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${LISTA_ESTADO_BADGE[row.estado] ?? ''}`}>
                        {row.estado}
                      </span>
                    </button>
                  </td>
                  <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                    {row.up}
                  </td>
                  <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-red-700 dark:text-red-400">
                    {row.down}
                  </td>
                  <td className="px-4 py-2.5 text-right font-bold tabular-nums text-slate-900 dark:text-slate-100">
                    {row.total}
                  </td>
                </tr>
              ))}
              <tr className="border-b border-slate-200 bg-slate-50 font-semibold dark:border-slate-700 dark:bg-slate-950">
                <td className="px-4 py-2.5" colSpan={2}>
                  SUBTOTAL
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-emerald-700">{data.caidos_subtotal.up}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-red-700">{data.caidos_subtotal.down}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{data.caidos_subtotal.total}</td>
              </tr>
              {extras.map((row) => (
                <tr
                  key={row.estado}
                  className={`border-b border-slate-100 dark:border-slate-800 ${
                    breakdownEstado === row.estado ? 'bg-blue-50/70 dark:bg-blue-950/30' : ''
                  }`}
                >
                  <td className="px-4 py-2.5 text-slate-500">{row.group}</td>
                  <td className="px-4 py-2.5">
                    <button type="button" onClick={() => setBreakdownEstado(row.estado)} title="Ver desglose de este estado">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${LISTA_ESTADO_BADGE[row.estado] ?? ''}`}>
                        {row.estado}
                      </span>
                    </button>
                  </td>
                  <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                    {row.up}
                  </td>
                  <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-red-700 dark:text-red-400">
                    {row.down}
                  </td>
                  <td className="px-4 py-2.5 text-right font-bold tabular-nums text-slate-900 dark:text-slate-100">
                    {row.total}
                  </td>
                </tr>
              ))}
              <tr className="bg-slate-900 text-white">
                <td className="px-4 py-3 font-bold" colSpan={2}>
                  TOTAL GENERAL
                </td>
                <td className="px-4 py-3 text-right font-bold tabular-nums text-emerald-300">{data.totals.up}</td>
                <td className="px-4 py-3 text-right font-bold tabular-nums text-red-300">{data.totals.down}</td>
                <td className="px-4 py-3 text-right font-bold tabular-nums">{data.totals.all}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {(data.by_zona?.length ?? 0) > 0 ? (
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="border-b border-slate-100 px-5 py-4 dark:border-slate-800">
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Por zona</h3>
            <p className="mt-1 text-[12px] text-slate-500">IQUITOS · YURIMAGUAS · PUCALLPA</p>
          </div>
          <div className="grid gap-2 p-4 sm:grid-cols-3">
            {data.by_zona!.map((z) => (
              <button
                key={z.zona}
                type="button"
                onClick={() => onZonaChange?.(selectedZona === z.zona ? '' : z.zona)}
                className={`rounded-xl border px-4 py-3 text-left transition ${
                  selectedZona === z.zona
                    ? 'border-blue-400 bg-blue-50 dark:border-blue-500 dark:bg-blue-950/40'
                    : 'border-slate-200 bg-slate-50 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-950'
                }`}
              >
                <p className="text-[13px] font-semibold text-slate-900 dark:text-slate-100">{z.zona}</p>
                <p className="mt-1 text-[12px] text-slate-500">
                  <span className="font-semibold text-emerald-700 dark:text-emerald-400">✔ {z.up}</span>
                  {' · '}
                  <span className="font-semibold text-red-700 dark:text-red-400">✖ {z.down}</span>
                  {' · '}
                  Total {z.total}
                </p>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-end sm:justify-between dark:border-slate-800">
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Desglose por causa raíz · misma fecha
            </h3>
            <p className="mt-1 text-[12px] text-slate-500">Filtra por ESTADO (como en el Excel) y abre la lista si necesitás el detalle</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-[12px] font-semibold text-slate-500">Estado</label>
            <Select className="h-9 min-w-[12rem]" value={breakdownEstado} onChange={(e) => setBreakdownEstado(e.target.value)}>
              {data.groups.map((g) => (
                <option key={g.estado} value={g.estado}>
                  {g.estado} ({g.total})
                </option>
              ))}
            </Select>
            {onSelectEstado ? (
              <button
                type="button"
                className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-[12px] font-semibold text-blue-700 hover:bg-blue-50 dark:border-slate-700 dark:bg-slate-950 dark:text-blue-300 dark:hover:bg-slate-900"
                onClick={() => onSelectEstado(breakdownEstado)}
              >
                Ver en lista →
              </button>
            ) : null}
          </div>
        </div>

        {selectedGroup ? (
          <div className="grid gap-3 border-b border-slate-100 px-5 py-3 sm:grid-cols-2 dark:border-slate-800">
            <div>
              <p className="text-[11px] font-semibold tracking-wide text-emerald-700 uppercase dark:text-emerald-400">
                LLEE ✔ ({selectedGroup.cids_up.length})
              </p>
              <p className="mt-1 text-[12px] break-all text-slate-600 dark:text-slate-300">
                {selectedGroup.cids_up.length ? selectedGroup.cids_up.join(', ') : '—'}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-semibold tracking-wide text-red-700 uppercase dark:text-red-400">
                LLEE ✖ ({selectedGroup.cids_down.length})
              </p>
              <p className="mt-1 text-[12px] break-all text-slate-600 dark:text-slate-300">
                {selectedGroup.cids_down.length ? selectedGroup.cids_down.join(', ') : '—'}
              </p>
            </div>
          </div>
        ) : null}

        {rootRows.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-slate-500">Sin causas raíz registradas en las filas actuales.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-left text-[13px]">
              <thead className="bg-slate-800 text-white">
                <tr>
                  <th className="px-4 py-2.5 text-[11px] font-semibold tracking-wide uppercase">Código</th>
                  <th className="px-4 py-2.5 text-[11px] font-semibold tracking-wide uppercase">Causa raíz</th>
                  <th className="px-4 py-2.5 text-right text-[11px] font-semibold tracking-wide uppercase">Cantidad ✔</th>
                  <th className="px-4 py-2.5 text-right text-[11px] font-semibold tracking-wide uppercase">Caídos en PRTG</th>
                  <th className="px-4 py-2.5 text-right text-[11px] font-semibold tracking-wide uppercase">Total</th>
                </tr>
              </thead>
              <tbody>
                {rootRows.map((row) => (
                  <tr key={`${row.estado ?? ''}-${row.code}`} className="border-b border-slate-100 dark:border-slate-800">
                    <td className="px-4 py-2.5 font-mono font-semibold text-slate-900 dark:text-slate-100">{row.code}</td>
                    <td className="px-4 py-2.5 text-slate-700 dark:text-slate-300">{row.cause}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-emerald-700 dark:text-emerald-400">{row.up}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-red-700 dark:text-red-400">{row.down}</td>
                    <td className="px-4 py-2.5 text-right font-bold tabular-nums">{row.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
