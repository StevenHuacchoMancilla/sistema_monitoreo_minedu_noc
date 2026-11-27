import { Fragment, useMemo, useState } from 'react'
import { MessageSquareText, ScrollText } from 'lucide-react'
import { formatDateTime24 } from '../../../lib/fechaHora'
import { DataTableContainer, tableClassName, thClassName, theadClassName, trClassName } from '../../../components/ui/MarcoTablaDatos'
import {
  PanelComentariosIncidente,
  type ComentariosPanelState,
} from '../../incidents/components/PanelComentariosIncidente'
import { causaDe, clasificarApertura, codigoDe, CUADRE_CATEGORIAS, type CuadreKey } from '../lib/cuadre'
import type { PreparedRow } from '../lib/modelo'
import type { TicketeraStatus } from '../types/ticketera'

const num = (value: number) => value.toLocaleString('es-PE')
const cell = 'px-2.5 py-2 align-top text-[13px] leading-snug text-slate-700 dark:text-slate-300'

function badge(status: TicketeraStatus) {
  const tone = status === 'ABIERTO'
    ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-200'
    : status === 'REVISAR'
      ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-200'
      : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200'
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${tone}`}>{status}</span>
}

function mineduBadge(value: string | null | undefined) {
  const raw = (value ?? '').trim()
  if (!raw || raw === '—' || raw.toUpperCase() === 'NINGUNO') {
    return (
      <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
        Sin razón MINEDU
      </span>
    )
  }
  return (
    <span className="inline-flex rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold text-violet-800 dark:bg-violet-950/50 dark:text-violet-200">
      {raw}
    </span>
  )
}

export function PanelCuadre({ rows, now }: { rows: PreparedRow[]; now: string }) {
  const nowMs = Number.isFinite(Date.parse(now)) ? Date.parse(now) : Date.now()
  const [open, setOpen] = useState<CuadreKey | null>(null)
  const [code, setCode] = useState('')
  const [comentariosPanel, setComentariosPanel] = useState<ComentariosPanelState | null>(null)
  const classified = useMemo(
    () => rows.map((row) => ({ row, categoria: clasificarApertura(row, nowMs) })),
    [rows, nowMs],
  )
  const states = classified.reduce(
    (acc, item) => {
      acc[item.row.status] += 1
      return acc
    },
    { ABIERTO: 0, CERRADO: 0, REVISAR: 0 },
  )
  const labels = Object.fromEntries(CUADRE_CATEGORIAS.map((item) => [item.key, item.label]))
  const detail = classified.filter((item) => {
    if (open && item.categoria !== open) return false
    if (code && `${codigoDe(item.row)}\u0001${causaDe(item.row)}` !== code) return false
    return true
  })

  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_10px_30px_-22px_rgba(15,23,42,0.7)] dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-center gap-4">
        <div className="grid h-11 w-11 place-items-center rounded-xl bg-indigo-500/10 text-[11px] font-bold tracking-wide text-indigo-600 dark:bg-indigo-400/15 dark:text-indigo-300">NOC</div>
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-slate-950 dark:text-slate-50">Cuadre del día · Incidencias por apertura sin duplicaciones</h2>
          <p className="text-xs text-slate-500">Una incidencia por fila. Usa el periodo y los filtros de arriba. Cada ticket entra en una sola categoría.</p>
        </div>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ['Total incidencias', classified.length, 'text-blue-700 dark:text-blue-300', 'bg-blue-500'],
          ['Abiertos', states.ABIERTO, 'text-amber-700 dark:text-amber-300', 'bg-amber-500'],
          ['Cerrados', states.CERRADO, 'text-emerald-700 dark:text-emerald-300', 'bg-emerald-500'],
          ['Por revisar', states.REVISAR, 'text-rose-700 dark:text-rose-300', 'bg-rose-500'],
        ].map(([label, value, tone, bar]) => (
          <article key={String(label)} className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-slate-50/70 px-4 py-4 dark:border-slate-800 dark:bg-slate-950/50">
            <span className={`absolute inset-x-0 top-0 h-0.5 ${bar}`} aria-hidden />
            <span className="block text-[11px] font-semibold tracking-[0.12em] text-slate-500 uppercase">{label}</span>
            <strong className={`mt-2 block text-3xl font-semibold tabular-nums ${tone}`}>{num(Number(value))}</strong>
          </article>
        ))}
      </div>
      <div className="mt-4 overflow-auto rounded-xl border border-slate-200 dark:border-slate-800">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-slate-50 text-left text-[11px] font-semibold tracking-wide text-slate-500 uppercase dark:bg-slate-950 dark:text-slate-400">
            <tr>
              <th className="px-4 py-3">Clasificación exclusiva</th>
              <th className="px-4 py-3 text-right">Tickets</th>
              <th className="px-4 py-3 text-right">Participación</th>
            </tr>
          </thead>
          <tbody>
            {CUADRE_CATEGORIAS.map((category) => {
              const list = classified.filter((item) => item.categoria === category.key)
              const expanded = open === category.key
              const codes = new Map<string, { codigo: string; causa: string; cantidad: number }>()
              for (const item of list) {
                const clave = `${codigoDe(item.row)}\u0001${causaDe(item.row)}`
                const current = codes.get(clave) ?? { codigo: codigoDe(item.row), causa: causaDe(item.row), cantidad: 0 }
                current.cantidad += 1
                codes.set(clave, current)
              }
              const groups = [...codes.entries()].sort((a, b) => b[1].cantidad - a[1].cantidad)
              return (
                <Fragment key={category.key}>
                  <tr className="border-b border-slate-200 dark:border-slate-800">
                    <td className="px-4 py-2">
                      <button
                        type="button"
                        className="flex items-center gap-2 text-left font-semibold"
                        onClick={() => {
                          setOpen(expanded ? null : category.key)
                          setCode('')
                        }}
                      >
                        <span className="text-indigo-400" style={{ transform: expanded ? 'rotate(90deg)' : undefined }}>▶</span>
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: category.color }} />
                        {category.label}
                        <small className="font-medium text-slate-500">({num(groups.length)} códigos)</small>
                      </button>
                    </td>
                    <td className="px-4 py-2 text-right text-base font-extrabold tabular-nums">{num(list.length)}</td>
                    <td className="px-4 py-2 text-right font-semibold tabular-nums">
                      {classified.length ? `${((list.length / classified.length) * 100).toFixed(1)}%` : '0.0%'}
                    </td>
                  </tr>
                  {expanded ? (
                    <tr className="bg-slate-50 dark:bg-slate-950/40">
                      <td colSpan={3} className="px-4 py-3">
                        {groups.length ? (
                          <div className="grid gap-2">
                            {groups.map(([clave, group]) => (
                              <button
                                key={clave}
                                type="button"
                                onClick={() => setCode(code === clave ? '' : clave)}
                                className={`grid grid-cols-[minmax(0,1.4fr)_minmax(80px,1fr)_90px] items-center gap-3 rounded-xl border px-3 py-2 text-left ${code === clave ? 'border-indigo-400' : 'border-slate-200 dark:border-slate-700'}`}
                              >
                                <span>
                                  <strong className="block text-xs">{group.codigo}</strong>
                                  <small className="block text-[11px] text-slate-500">{group.causa}</small>
                                </span>
                                <span className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                                  <span className="block h-full rounded-full" style={{ width: `${list.length ? (group.cantidad / list.length) * 100 : 0}%`, background: category.color }} />
                                </span>
                                <span className="text-right text-xs font-bold tabular-nums">{num(group.cantidad)}</span>
                              </button>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-slate-500">Sin registros en esta categoría.</p>
                        )}
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              )
            })}
            <tr className="bg-[#244a70] font-extrabold text-white">
              <td className="px-4 py-3">TOTAL DE INCIDENCIAS DEL PERÍODO</td>
              <td className="px-4 py-3 text-right">{num(classified.length)}</td>
              <td className="px-4 py-3 text-right">{classified.length ? '100%' : '0%'}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="mt-5 mb-2 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">Detalle de tickets clasificados</h3>
          <p className="text-xs text-slate-500">
            {open ? labels[open] : 'Todas las categorías'} · {num(detail.length)} tickets · detalle, evento e imágenes en el panel lateral
          </p>
        </div>
        {open ? (
          <button type="button" className="text-xs font-semibold text-indigo-400" onClick={() => { setOpen(null); setCode('') }}>
            Quitar desglose
          </button>
        ) : null}
      </div>
      <DataTableContainer>
        <table className={tableClassName}>
          <thead className={theadClassName}>
            <tr>
              {['Ticket', 'CID', 'Apertura', 'Cierre', 'Estado', 'Razón MINEDU', 'Código', 'Causa', 'Acciones'].map((label) => (
                <th key={label} className={thClassName}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {detail.slice(0, 80).map((item) => {
              return (
                <tr key={`${item.row.row}-${item.row.ticket}`} className={trClassName}>
                  <td className={cell}>{item.row.ticket || '—'}</td>
                  <td className={`${cell} max-w-none`}>
                    {item.row.cid || '—'}
                    <span className="block text-[11px] text-slate-500">{item.row.nombre}</span>
                  </td>
                  <td className={`${cell} whitespace-nowrap`}>{item.row.open_text || formatDateTime24(item.row.open)}</td>
                  <td className={`${cell} whitespace-nowrap`}>{item.row.close_text || 'Sin cierre'}</td>
                  <td className={cell}>{badge(item.row.status)}</td>
                  <td className={cell}>{mineduBadge(item.row.minedu)}</td>
                  <td className={cell}>{codigoDe(item.row)}</td>
                  <td className={`${cell} max-w-[14rem]`}>{causaDe(item.row)}</td>
                  <td className={cell}>
                    {item.row.incident_id ? (
                      <div className="flex flex-col items-stretch gap-1">
                        <button
                          type="button"
                          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-2 py-1.5 text-[11px] font-semibold text-sky-800 hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-950/50 dark:text-sky-200"
                          onClick={() =>
                            setComentariosPanel({
                              incidentId: item.row.incident_id as number,
                              kind: 'detalle',
                              cid: item.row.cid,
                              local: item.row.nombre,
                              ticket: item.row.ticket,
                            })
                          }
                        >
                          <MessageSquareText className="h-3.5 w-3.5 shrink-0" aria-hidden />
                          Ver detalle
                        </button>
                        <button
                          type="button"
                          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                          onClick={() =>
                            setComentariosPanel({
                              incidentId: item.row.incident_id as number,
                              kind: 'evento',
                              cid: item.row.cid,
                              local: item.row.nombre,
                              ticket: item.row.ticket,
                            })
                          }
                        >
                          <ScrollText className="h-3.5 w-3.5 shrink-0" aria-hidden />
                          Detalle de evento
                        </button>
                      </div>
                    ) : (
                      <span className="text-[11px] text-slate-400">Sin incidencia</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </DataTableContainer>
      {detail.length > 80 ? <p className="mt-2 text-xs text-slate-500">Mostrando 80 de {num(detail.length)} tickets.</p> : null}

      {comentariosPanel ? (
        <PanelComentariosIncidente
          panel={comentariosPanel}
          showEvidence
          onClose={() => setComentariosPanel(null)}
        />
      ) : null}
    </section>
  )
}
