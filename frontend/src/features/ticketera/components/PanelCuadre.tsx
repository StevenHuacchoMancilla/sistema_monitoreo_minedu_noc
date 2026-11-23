import { Fragment, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Clock3, MessageSquareText, X } from 'lucide-react'
import { formatDateTime24 } from '../../../lib/fechaHora'
import { DataTableContainer, tableClassName, thClassName, theadClassName, trClassName } from '../../../components/ui/MarcoTablaDatos'
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

function descripcionDe(row: PreparedRow): string {
  const detalle = (row.detalle ?? '').trim()
  if (detalle && detalle !== '—') return detalle
  const evento = (row.event_detail ?? '').trim()
  if (evento && evento !== '—') return evento
  return ''
}

function parseTimeline(body: string): Array<{ at?: string; text: string }> {
  const lines = body
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean)
  if (lines.length === 0) return []

  return lines.map((line) => {
    const m = line.match(/^(\d{2}\/\d{2}\/\d{4}\s+\d{1,2}:\d{2})\s*[·\-–]\s*(.+)$/)
    if (m) return { at: m[1], text: m[2] }
    return { text: line }
  })
}

function MetaChip({ label }: { label: string }) {
  if (!label || label === '—') return null
  return (
    <span className="inline-flex max-w-[10rem] truncate rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
      {label}
    </span>
  )
}

/** Flotante lateral igual que Seguimiento de caídas: detalle fuera de la tabla. */
function ComentarioSidePanel({
  row,
  body,
  onClose,
}: {
  row: PreparedRow
  body: string
  onClose: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const entries = body ? parseTimeline(body) : []

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end">
      <button type="button" className="absolute inset-0 bg-slate-950/55 backdrop-blur-[2px]" aria-label="Cerrar" onClick={onClose} />
      <aside className="relative flex h-full w-full max-w-md flex-col border-l border-slate-200 bg-slate-50 shadow-2xl dark:border-slate-700 dark:bg-slate-950 sm:max-w-lg">
        <header className="border-b border-slate-200 bg-white px-5 py-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="mb-2 inline-flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-100 px-2.5 py-1 text-[11px] font-bold text-sky-800 dark:bg-sky-500/20 dark:text-sky-200">
                  <MessageSquareText className="h-3.5 w-3.5" aria-hidden />
                  Detalle de gestión
                </span>
                {badge(row.status)}
              </div>
              <h2 className="truncate font-mono text-sm font-bold text-slate-900 dark:text-slate-50" title={row.ticket}>
                {row.ticket || 'Sin ticket'}
              </h2>
              <p className="mt-1 truncate text-[13px] font-medium text-slate-700 dark:text-slate-300">
                CID {row.cid || '—'}
                {row.tss ? ` · ${row.tss}` : ''}
                {row.nombre ? ` · ${row.nombre}` : ''}
              </p>
            </div>
            <button
              type="button"
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800 dark:hover:text-slate-100"
              onClick={onClose}
              aria-label="Cerrar panel"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5">
            <MetaChip label={row.provincia} />
            <MetaChip label={row.distrito} />
            <MetaChip label={row.minedu} />
            {codigoDe(row) !== '(sin código)' ? <MetaChip label={codigoDe(row)} /> : null}
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          {entries.length > 0 ? (
            <ol className="relative space-y-0 border-l-2 border-sky-200 pl-5 dark:border-sky-900">
              {entries.map((entry, i) => (
                <li key={`${entry.at ?? ''}-${i}`} className="relative pb-5 last:pb-0">
                  <span className="absolute -left-[1.4rem] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-sky-500 dark:border-slate-950" />
                  {entry.at ? (
                    <p className="mb-1 inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      <Clock3 className="h-3 w-3" aria-hidden />
                      {entry.at}
                    </p>
                  ) : null}
                  <div className="rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-[13px] leading-relaxed text-slate-800 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                    {entry.text}
                  </div>
                </li>
              ))}
            </ol>
          ) : body ? (
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-4 text-[13px] leading-relaxed text-slate-800 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
              <pre className="whitespace-pre-wrap break-words font-sans">{body}</pre>
            </div>
          ) : (
            <div className="flex h-full min-h-[12rem] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white/70 px-6 text-center dark:border-slate-700 dark:bg-slate-900/50">
              <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-slate-800">
                <MessageSquareText className="h-5 w-5" />
              </div>
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Sin contenido</p>
              <p className="mt-1 max-w-xs text-[13px] text-slate-500">
                Todavía no hay comentarios de gestión del operador NOC o admin.
              </p>
            </div>
          )}
        </div>

        {causaDe(row) !== 'Causa raíz sin descripción' ? (
          <footer className="border-t border-slate-200 bg-white px-5 py-3 dark:border-slate-800 dark:bg-slate-900">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Causa raíz</p>
            <p className="mt-0.5 text-[13px] text-slate-700 dark:text-slate-300">{causaDe(row)}</p>
          </footer>
        ) : null}
      </aside>
    </div>,
    document.body,
  )
}

export function PanelCuadre({ rows, now }: { rows: PreparedRow[]; now: string }) {
  const nowMs = Number.isFinite(Date.parse(now)) ? Date.parse(now) : Date.now()
  const [open, setOpen] = useState<CuadreKey | null>(null)
  const [code, setCode] = useState('')
  const [panelRow, setPanelRow] = useState<PreparedRow | null>(null)
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
    <section className="rounded-2xl border border-slate-200 border-t-[3px] border-t-indigo-400 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-center gap-4">
        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-[#4667e8] to-[#8360de] text-xs font-extrabold text-white">NOC</div>
        <div>
          <h2 className="text-lg font-semibold">Cuadre del día · Incidencias por apertura sin duplicaciones</h2>
          <p className="text-xs text-slate-500">Una incidencia por fila. Usa el periodo y los filtros de arriba. Cada ticket entra en una sola categoría.</p>
        </div>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ['Total incidencias', classified.length, 'from-[#3c5edb] to-[#576fec]'],
          ['Abiertos', states.ABIERTO, 'from-[#b57619] to-[#e79e32]'],
          ['Cerrados', states.CERRADO, 'from-[#098875] to-[#17aa95]'],
          ['Por revisar', states.REVISAR, 'from-[#914a7a] to-[#ca5a9c]'],
        ].map(([label, value, tone]) => (
          <article key={String(label)} className={`rounded-2xl bg-gradient-to-br ${tone} px-4 py-4 text-white`}>
            <span className="block text-xs text-white/90">{label}</span>
            <strong className="mt-2 block text-3xl tabular-nums">{num(Number(value))}</strong>
          </article>
        ))}
      </div>
      <div className="mt-4 overflow-auto rounded-xl border border-slate-200 dark:border-slate-800">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-[#244a70] text-left text-xs uppercase text-white">
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
            {open ? labels[open] : 'Todas las categorías'} · {num(detail.length)} tickets · comentario en flotante (como Seguimiento)
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
              {['Ticket', 'CID', 'Apertura', 'Cierre', 'Estado', 'Razón MINEDU', 'Código', 'Causa', 'Comentario'].map((label) => (
                <th key={label} className={thClassName}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {detail.slice(0, 80).map((item) => {
              const body = descripcionDe(item.row)
              const hasComment = Boolean(body)
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
                    <button
                      type="button"
                      onClick={() => setPanelRow(item.row)}
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition ${
                        hasComment
                          ? 'border-sky-200 bg-sky-50 text-sky-800 hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-950/50 dark:text-sky-200 dark:hover:bg-sky-950'
                          : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400 dark:hover:bg-slate-800'
                      }`}
                      title={hasComment ? 'Ver comentario en flotante' : 'Sin comentario todavía'}
                    >
                      <MessageSquareText className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      {hasComment ? 'Ver detalle' : 'Sin comentario'}
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </DataTableContainer>
      {detail.length > 80 ? <p className="mt-2 text-xs text-slate-500">Mostrando 80 de {num(detail.length)} tickets.</p> : null}

      {panelRow ? (
        <ComentarioSidePanel
          row={panelRow}
          body={descripcionDe(panelRow)}
          onClose={() => setPanelRow(null)}
        />
      ) : null}
    </section>
  )
}
