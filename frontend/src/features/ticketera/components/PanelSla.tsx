import { Fragment, useEffect, useMemo, useState } from 'react'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { formatDateTime24 } from '../../../lib/fechaHora'
import { FormField, Input, Select } from '../../../components/ui/ControlesFormulario'
import { Boton } from '../../../components/ui/Boton'
import { fold } from '../lib/modelo'
import type { PreparedRow } from '../lib/modelo'
import {
  cidValid,
  hmsFromSeconds,
  hmsSigned,
  incidentKey,
  slaEnCurso,
  slaLedger,
  slaNombre,
  slaTipo,
  type SlaPart,
  type SlaTipo,
} from '../lib/sla'
import type { TicketeraRow, TicketeraStatus } from '../types/ticketera'

const num = (value: number) => value.toLocaleString('es-PE')

const CARDS = [
  { key: 'total', label: 'Incidencias SLA', className: 'from-[#4161db] to-[#5c7bf4]' },
  { key: 'caida', label: 'Caída de Enlace', className: 'from-[#435fd7] to-[#5477ef]' },
  { key: 'queja', label: 'Queja', className: 'from-[#0e8796] to-[#18b7bf]' },
  { key: 'open', label: 'Abiertos / en curso', className: 'from-[#ba721a] to-[#eba133]' },
  { key: 'closed', label: 'Cerrados', className: 'from-[#0c8878] to-[#1db79b]' },
  { key: 'exceeded', label: 'Tramos excedidos', className: 'from-[#a04272] to-[#d66098]' },
] as const

function downloadCsv(filename: string, rows: string[][]) {
  const body = rows
    .map((row) => row.map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`).join(';'))
    .join('\r\n')
  const blob = new Blob([`\uFEFF${body}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function statusClass(status: TicketeraStatus) {
  if (status === 'ABIERTO') return 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-200'
  if (status === 'REVISAR') return 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-200'
  return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200'
}

function resultClass(result: string) {
  if (result === 'DENTRO DEL SLA') return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200'
  if (result === 'EXCEDIDO') return 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-200'
  if (result === 'EN CURSO') return 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-200'
  return 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
}

function matchesSearch(row: TicketeraRow, query: string) {
  if (!query) return true
  return fold([row.cid, row.tss, row.nombre, row.ticket, row.causa, row.codigo, row.minedu, row.detalle, row.event_detail].join(' ')).includes(query)
}

export function PanelSla({
  allRows,
  visibleRows,
  rankingRows,
  now,
  topMinedu,
}: {
  allRows: TicketeraRow[]
  visibleRows: PreparedRow[]
  rankingRows: PreparedRow[]
  now: string
  topMinedu: string
}) {
  const [reason, setReason] = useState<'all' | SlaTipo>('all')
  const [status, setStatus] = useState<'all' | TicketeraStatus>('all')
  const [order, setOrder] = useState<'cid' | 'recientes' | 'abiertas'>('cid')
  const [search, setSearch] = useState('')
  const [rankSearch, setRankSearch] = useState('')
  const [rankMin, setRankMin] = useState('1')
  const [selectedCid, setSelectedCid] = useState('')

  useEffect(() => {
    const above = fold(topMinedu)
    if ((above === 'QUEJA' && reason === 'CAIDA') || (above === 'CAIDADEENLACE' && reason === 'QUEJA')) {
      setReason('all')
    }
  }, [topMinedu, reason])

  const ledger = useMemo(() => slaLedger(allRows, now), [allRows, now])
  const vivo = useMemo(() => slaEnCurso(allRows, now, ledger), [allRows, now, ledger])
  const query = fold(search)

  const universe = useMemo(
    () => visibleRows.filter((row) => slaTipo(row) && (status === 'all' || row.status === status) && matchesSearch(row, query)),
    [visibleRows, status, query],
  )
  const chosen = useMemo(
    () => universe.filter((row) => reason === 'all' || slaTipo(row) === reason),
    [universe, reason],
  )
  const chosenKeys = useMemo(() => new Set(chosen.map(incidentKey)), [chosen])
  const openCids = useMemo(() => {
    const ids = new Set<string>()
    for (const part of ledger) {
      if (part.estado === 'ABIERTO' && chosenKeys.has(incidentKey(part.row))) ids.add(part.cid)
    }
    return ids
  }, [ledger, chosenKeys])

  const parts = useMemo(() => {
    const list = ledger.filter((part) => chosenKeys.has(incidentKey(part.row)) && (status === 'all' || part.estado === status))
    list.sort((a, b) => {
      if (order === 'abiertas') {
        const diff = Number(openCids.has(b.cid)) - Number(openCids.has(a.cid))
        if (diff) return diff
      }
      const cid = a.cid.localeCompare(b.cid, 'es', { numeric: true })
      if (cid) return cid
      const tipo = a.tipo.localeCompare(b.tipo)
      if (tipo) return tipo
      const month = a.mes.localeCompare(b.mes)
      if (month) return order === 'recientes' ? -month : month
      return (a.start ?? Infinity) - (b.start ?? Infinity) || a.row.row - b.row.row || a.part - b.part
    })
    return list
  }, [ledger, chosenKeys, status, order, openCids])

  const counts = useMemo(() => {
    let caida = 0
    let queja = 0
    let open = 0
    let closed = 0
    const cids = new Set<string>()
    for (const row of chosen) {
      if (slaTipo(row) === 'QUEJA') queja += 1
      else caida += 1
      if (row.status === 'ABIERTO') open += 1
      if (row.status === 'CERRADO') closed += 1
      if (cidValid(row)) cids.add(row.cid.trim())
    }
    return {
      total: chosen.length,
      caida,
      queja,
      open,
      closed,
      exceeded: parts.filter((part) => part.resultado === 'EXCEDIDO').length,
      cids: cids.size,
    }
  }, [chosen, parts])

  const pie = useMemo(() => {
    let caida = 0
    let queja = 0
    for (const row of universe) {
      if (slaTipo(row) === 'QUEJA') queja += 1
      else caida += 1
    }
    return [
      { key: 'CAIDA' as const, label: 'Caída de Enlace', count: caida, color: '#536fff' },
      { key: 'QUEJA' as const, label: 'Queja', count: queja, color: '#17b9c2' },
    ]
  }, [universe])
  const pieTotal = pie[0].count + pie[1].count

  const results = useMemo(() => summarize(universe, ledger, vivo), [universe, ledger, vivo])

  const ranking = useMemo(() => {
    const rows = rankingRows.filter((row) => slaTipo(row) && (status === 'all' || row.status === status) && matchesSearch(row, fold(search)))
    const map = new Map<string, { cid: string; tss: string; nombre: string; tickets: PreparedRow[]; caida: number; queja: number; abiertos: number; cerrados: number; revisar: number }>()
    for (const row of rows) {
      if (!cidValid(row)) continue
      const cid = row.cid.trim()
      const group = map.get(cid) ?? { cid, tss: row.tss, nombre: row.nombre, tickets: [], caida: 0, queja: 0, abiertos: 0, cerrados: 0, revisar: 0 }
      group.tickets.push(row)
      if (!group.nombre && row.nombre) group.nombre = row.nombre
      if (slaTipo(row) === 'QUEJA') group.queja += 1
      else group.caida += 1
      if (row.status === 'ABIERTO') group.abiertos += 1
      else if (row.status === 'CERRADO') group.cerrados += 1
      else group.revisar += 1
      map.set(cid, group)
    }
    const minimum = Math.max(1, Number(rankMin) || 1)
    const text = fold(rankSearch)
    return [...map.values()]
      .map((group) => ({ ...group, total: group.tickets.length }))
      .sort((a, b) => b.total - a.total || a.cid.localeCompare(b.cid, 'es', { numeric: true }))
      .filter((group) => group.total >= minimum && (!text || fold(`${group.cid} ${group.tss} ${group.nombre}`).includes(text)))
  }, [rankingRows, status, search, rankMin, rankSearch])

  const numbers = useMemo(() => {
    const counter = new Map<string, number>()
    const ordered = [...allRows].filter((row) => slaTipo(row)).sort((a, b) => (Date.parse(a.open ?? '') || 0) - (Date.parse(b.open ?? '') || 0) || a.row - b.row)
    const seen = new Set<string>()
    const out = new Map<string, number>()
    for (const row of ordered) {
      const key = incidentKey(row)
      if (seen.has(key)) continue
      seen.add(key)
      const bucket = `${row.cid.trim()}|${slaTipo(row)}`
      const next = (counter.get(bucket) ?? 0) + 1
      counter.set(bucket, next)
      out.set(key, next)
    }
    return out
  }, [allRows])

  function exportAnexo() {
    const header = ['Fila', 'Ticket', 'CID', 'TSS', 'Institución', 'Área', 'Razón', 'Código', 'Causa', 'Apertura', 'Cierre', 'Estado', 'Total 24h', 'Horas 08-16', 'Horas SLA tras vacaciones', 'Detalle']
    const seen = new Set<string>()
    const rows = [header]
    for (const part of parts) {
      const key = incidentKey(part.row)
      if (seen.has(key)) continue
      seen.add(key)
      rows.push([
        String(part.row.row),
        part.row.ticket,
        part.row.cid,
        part.row.tss,
        part.row.nombre,
        part.area || 'Por definir',
        slaNombre(part.tipo),
        part.row.codigo,
        part.row.causa,
        part.row.open_text,
        part.row.close_text,
        part.estado,
        part.valid ? hmsFromSeconds(part.total) : '',
        part.valid ? hmsFromSeconds(part.effective) : '',
        part.valid ? hmsFromSeconds(part.net) : '',
        part.row.detalle || part.row.event_detail || '',
      ])
    }
    downloadCsv(`MINEDU_Anexo30_${rows.length - 1}_tickets.csv`, rows)
  }

  function exportSla() {
    const header = ['CID', 'Institución', 'Mes', 'Razón', 'Ticket', 'Fila', 'Apertura', 'Cierre', 'Área', 'Cupo', 'Saldo antes', 'Total 24h', 'Horas 08-16', 'Horas SLA', 'Saldo después', 'Estado', 'Resultado', 'Código', 'Causa', 'Detalle']
    const rows = [header, ...parts.map((part) => [
      part.cid,
      part.row.nombre,
      part.mes,
      slaNombre(part.tipo),
      part.row.ticket,
      String(part.row.row),
      part.row.open_text,
      part.estado === 'ABIERTO' ? 'Sin cierre' : part.row.close_text,
      part.area || 'Por definir',
      hmsSigned(part.limite),
      hmsFromSeconds(part.before),
      part.valid ? hmsFromSeconds(part.total) : '—',
      part.valid ? hmsFromSeconds(part.effective) : '—',
      part.valid ? hmsFromSeconds(part.net) : '—',
      hmsFromSeconds(part.after),
      part.estado,
      part.resultado,
      part.row.codigo,
      part.row.causa,
      part.row.detalle || part.row.event_detail || '',
    ])]
    downloadCsv('MINEDU_SLA_Por_Incidencia.csv', rows)
  }

  let previous = ''
  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 border-t-[3px] border-t-indigo-400 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-[#4869eb] to-[#8d5ee7] text-sm font-extrabold text-white">
              NOC
            </div>
            <div>
              <p className="text-[11px] font-extrabold tracking-[0.12em] text-indigo-400">CONTROL DE SERVICIO · MINEDU 2026</p>
              <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-900 dark:text-white">Incidencias · SLA mensual · Anexo 30</h2>
              <p className="mt-1 text-xs text-slate-500">Caída de Enlace y Queja · Historial por CID · Reportes individuales</p>
            </div>
          </div>
          <span className="rounded-full border border-indigo-400/40 bg-indigo-500/10 px-3 py-1.5 text-[11px] font-semibold text-indigo-300">
            SLA R11 · Ranking por CID + evaluación provisional
          </span>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <FormField label="Razón para el cálculo SLA">
            <Select value={reason} onChange={(event) => setReason(event.target.value as 'all' | SlaTipo)}>
              <option value="all">Caída de Enlace y Queja</option>
              <option value="CAIDA">Solo Caída de Enlace</option>
              <option value="QUEJA">Solo Queja</option>
            </Select>
          </FormField>
          <FormField label="Estado del ticket">
            <Select value={status} onChange={(event) => setStatus(event.target.value as 'all' | TicketeraStatus)}>
              <option value="all">Todos los estados</option>
              <option value="ABIERTO">Abiertos</option>
              <option value="CERRADO">Cerrados</option>
              <option value="REVISAR">Por revisar</option>
            </Select>
          </FormField>
          <FormField label="Ordenar por CID">
            <Select value={order} onChange={(event) => setOrder(event.target.value as 'cid' | 'recientes' | 'abiertas')}>
              <option value="cid">CID · cronológico</option>
              <option value="recientes">Meses recientes primero</option>
              <option value="abiertas">CID con abiertos primero</option>
            </Select>
          </FormField>
          <FormField label="Buscar colegio / ticket">
            <Input value={search} placeholder="CID, TSS, institución, ticket, causa…" onChange={(event) => setSearch(event.target.value)} />
          </FormField>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
          <p className="mr-auto text-[11px] text-slate-500">
            Filtro SLA: {reason === 'all' ? 'Ambas razones' : slaNombre(reason)} · Se respetan filtros superiores · {num(counts.cids)} CIDs en el cálculo.
          </p>
          <Boton variant="primary" disabled={!parts.length} onClick={exportAnexo}>Excel · Anexo 30</Boton>
          <Boton variant="secondary" disabled={!parts.length} onClick={exportSla}>Excel · SLA y conteo</Boton>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          {CARDS.map((card) => (
            <article key={card.key} className={`min-h-[104px] rounded-2xl bg-gradient-to-br ${card.className} px-4 py-3 text-white`}>
              <span className="block text-xs font-semibold text-white/90">{card.label}</span>
              <strong className="mt-2 block text-3xl tabular-nums">{num(counts[card.key])}</strong>
            </article>
          ))}
        </div>

        <div className="mt-4 grid gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950/40 xl:grid-cols-2">
          <div>
            <h3 className="text-sm font-semibold">Distribución de incidencias SLA</h3>
            <p className="mt-1 text-[11px] text-slate-500">Selecciona una razón para desglosarla. El cupo de Queja y Caída de Enlace se calcula por separado.</p>
            <div className="mt-3 grid items-center gap-3 sm:grid-cols-[160px_minmax(0,1fr)]">
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pie.filter((item) => item.count > 0)} dataKey="count" nameKey="label" outerRadius={72} stroke="transparent">
                      {pie.filter((item) => item.count > 0).map((item) => (
                        <Cell key={item.key} fill={item.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-2">
                {pie.map((item) => {
                  const active = reason === item.key
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => setReason(active ? 'all' : item.key)}
                      className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-xs ${active ? 'border-indigo-400 bg-indigo-500/10' : 'border-transparent hover:bg-white/60 dark:hover:bg-slate-800'}`}
                    >
                      <span className="flex items-center gap-2 font-semibold">
                        <i className="h-2.5 w-2.5 rounded-sm" style={{ background: item.color }} />
                        {item.label}
                      </span>
                      <span className="text-right font-bold tabular-nums">
                        {num(item.count)}
                        <small className="block font-medium text-slate-500">{pieTotal ? ((item.count / pieTotal) * 100).toFixed(1) : '0.0'}%</small>
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
          <div>
            <h3 className="text-sm font-semibold">Tickets dentro y fuera del SLA</h3>
            <p className="mt-1 text-[11px] text-slate-500">Cerrados con el saldo confirmado. Abiertos con el saldo provisional hasta esta lectura.</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {results.map((card) => (
                <article key={card.id} className={`rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900 ${reason !== 'all' && reason !== card.tipo ? 'opacity-60' : ''}`}>
                  <span className="block text-[11px] font-extrabold">{card.titulo}</span>
                  <span className={`mt-1 block text-[11px] font-bold ${card.modo === 'fuera' ? 'text-rose-400' : 'text-emerald-400'}`}>{card.etiqueta}</span>
                  <strong className="mt-1 block text-2xl tabular-nums">{num(card.total)}</strong>
                  <small className="mt-1 block text-[10px] text-slate-500">{num(card.cerrados)} cerrados · {num(card.abiertos)} abiertos (provisional)</small>
                </article>
              ))}
            </div>
          </div>
        </div>

        <p className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-relaxed text-slate-500 dark:border-slate-700 dark:bg-slate-950/40">
          <strong className="text-slate-700 dark:text-slate-200">Regla vigente del cálculo:</strong> cupo mensual 6 h (urbana) o 36 h (rural), de 08:00 a 16:00, lunes a domingo.
          Las vacaciones 12–18/10/2026 solo descuentan las horas de esa jornada que coinciden con el ticket. Caída de Enlace y Queja llevan acumulados separados por CID, mes y razón.
          Un ticket abierto muestra consumo provisional y no cierra el saldo.
        </p>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold">Detalle SLA por colegio y mes</h2>
            <p className="text-xs text-slate-500">Tramos mensuales y saldo en horas de jornada 08:00–16:00. Desplaza la tabla para ver todas las columnas.</p>
          </div>
          <span className="text-xs text-slate-500">{num(parts.length)} tramos · {num(counts.total)} tickets · {num(counts.cids)} colegios</span>
        </div>
        <div className="max-h-[610px] overflow-auto rounded-xl border border-slate-200 dark:border-slate-800">
          <table className="min-w-[2100px] w-full border-collapse text-xs">
            <thead className="sticky top-0 z-10 bg-[#254269] text-left text-[10px] uppercase tracking-wide text-slate-100">
              <tr>
                {['CID / Institución', 'Mes SLA', 'Ticket', 'Apertura', 'Cierre', 'Área', 'Cupo', 'Saldo antes', 'Total 24h', 'Horas 08–16', 'Horas SLA', 'Saldo después', 'SLA en curso', 'Estado', 'Resultado', 'Código / causa', 'Detalle'].map((label) => (
                  <th key={label} className="whitespace-nowrap px-3 py-3 font-semibold">{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {parts.length ? parts.map((part) => {
                const first = part.cid !== previous
                previous = part.cid
                const live = vivo.get(incidentKey(part.row))
                return (
                  <tr key={`${part.row.row}-${part.mes}-${part.part}-${part.tipo}`} className={`border-b border-slate-200 align-top dark:border-slate-800 ${first ? 'border-t-[3px] border-t-indigo-500' : ''} ${part.estado === 'ABIERTO' ? 'bg-amber-500/5' : ''}`}>
                    <td className="min-w-[180px] px-3 py-3">
                      <strong>{part.cid}</strong>
                      <span className="block text-[11px] text-slate-500">{part.row.nombre || `TSS ${part.row.tss || '—'}`}</span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">
                      <strong>{part.mes}</strong>
                      <span className={`mt-1 block w-fit rounded-full px-2 py-0.5 text-[10px] font-bold ${part.tipo === 'QUEJA' ? 'bg-cyan-500/15 text-cyan-300' : 'bg-indigo-500/15 text-indigo-300'}`}>{slaNombre(part.tipo)}</span>
                      {part.part > 1 ? <span className="block text-[11px] text-slate-500">Tramo {part.part}</span> : null}
                    </td>
                    <td className="px-3 py-3">
                      <strong>{part.row.ticket || 'Sin ticket'}</strong>
                      <span className="block text-[11px] text-slate-500">Incidencia #{numbers.get(incidentKey(part.row)) ?? 1} · Fila {part.row.row}</span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">{part.row.open_text || '—'}</td>
                    <td className="whitespace-nowrap px-3 py-3">{part.estado === 'ABIERTO' ? 'Sin cierre' : part.row.close_text || '—'}</td>
                    <td className="px-3 py-3">{part.area || 'Por definir'}</td>
                    <td className="whitespace-nowrap px-3 py-3 tabular-nums">{hmsSigned(part.limite)}</td>
                    <td className="whitespace-nowrap px-3 py-3 tabular-nums">{hmsFromSeconds(part.before)}</td>
                    <td className="whitespace-nowrap px-3 py-3 tabular-nums">{part.valid ? hmsFromSeconds(part.total) : '—'}</td>
                    <td className="whitespace-nowrap px-3 py-3 tabular-nums">{part.valid ? hmsFromSeconds(part.effective) : '—'}</td>
                    <td className="whitespace-nowrap px-3 py-3 tabular-nums">
                      <strong>{part.valid ? hmsFromSeconds(part.net) : '—'}</strong>
                      {part.valid && part.discount > 0 ? <span className="block text-[11px] text-slate-500">Vacaciones −{hmsFromSeconds(part.discount)}</span> : null}
                    </td>
                    <td className={`whitespace-nowrap px-3 py-3 font-bold tabular-nums ${part.after != null && part.after < 0 ? 'text-rose-400' : ''}`}>{hmsFromSeconds(part.after)}</td>
                    <td className="min-w-[180px] px-3 py-3">
                      {part.estado !== 'ABIERTO' ? '—' : live?.error ? live.error : live ? (
                        <>
                          <strong>Consumido: {hmsFromSeconds(live.consumido)}</strong>
                          <span className={`block ${live.saldo < 0 ? 'text-rose-400' : 'text-emerald-400'}`}>Disponible: {hmsFromSeconds(live.saldo)}</span>
                          <span className="block text-[11px] text-slate-500">Lectura {formatDateTime24(live.horaLectura)}</span>
                        </>
                      ) : '—'}
                    </td>
                    <td className="px-3 py-3"><span className={`rounded-md px-2 py-1 text-[10px] font-bold ${statusClass(part.estado)}`}>{part.estado}</span></td>
                    <td className="px-3 py-3"><span className={`rounded-md px-2 py-1 text-[10px] font-bold ${resultClass(part.resultado)}`}>{part.resultado}</span></td>
                    <td className="min-w-[180px] px-3 py-3">
                      <strong>{part.row.codigo || '—'}</strong>
                      <span className="block text-[11px] text-slate-500">{part.row.causa || 'Sin causa raíz'}</span>
                    </td>
                    <td className="max-w-[360px] whitespace-pre-wrap px-3 py-3">{part.row.detalle || part.row.event_detail || 'Sin detalle'}</td>
                  </tr>
                )
              }) : (
                <tr><td colSpan={17} className="px-3 py-8 text-center text-slate-500">No hay tickets de Queja o Caída de Enlace con estos filtros.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 border-t-[3px] border-t-indigo-500 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-extrabold tracking-[0.12em] text-indigo-300">ANÁLISIS DE RECURRENCIA · MINEDU</p>
            <h2 className="mt-1 text-lg font-semibold">Ranking de incidencias SLA por colegio</h2>
            <p className="mt-1 max-w-3xl text-xs leading-relaxed text-slate-500">
              Suma Caída de Enlace y Queja por CID, sin duplicar tickets. Respeta fechas, horario, provincia y el resto de filtros superiores, y deja fuera solo la razón MINEDU para reunir siempre las dos categorías.
            </p>
          </div>
          <span className="text-xs text-slate-500">{num(ranking.length)} colegios</span>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto]">
          <FormField label="Buscar colegio en el ranking">
            <Input value={rankSearch} placeholder="CID, TSS o institución" onChange={(event) => setRankSearch(event.target.value)} />
          </FormField>
          <FormField label="Repeticiones mínimas">
            <Select value={rankMin} onChange={(event) => setRankMin(event.target.value)}>
              <option value="1">Todos los CIDs (1 o más)</option>
              <option value="2">Dos o más incidencias</option>
              <option value="3">Tres o más incidencias</option>
              <option value="5">Cinco o más incidencias</option>
            </Select>
          </FormField>
          <div className="flex items-end">
            <Boton variant="secondary" onClick={() => { setRankSearch(''); setRankMin('1'); setSelectedCid('') }}>Limpiar ranking</Boton>
          </div>
        </div>
        <div className="mt-4 max-h-[560px] overflow-auto rounded-xl border border-slate-200 dark:border-slate-800">
          <table className="min-w-[980px] w-full border-collapse text-xs">
            <thead className="sticky top-0 bg-[#25476e] text-left text-[10px] uppercase text-slate-100">
              <tr>
                {['Posición', 'CID / Institución', 'Incidencias SLA', 'Caída de Enlace', 'Queja', 'Abiertos', 'Cerrados', 'Por revisar', 'Desglose'].map((label) => (
                  <th key={label} className="px-3 py-3 font-semibold">{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ranking.length ? ranking.map((group, index) => {
                const open = selectedCid === group.cid
                return (
                  <Fragment key={group.cid}>
                    <tr className={`border-b border-slate-200 dark:border-slate-800 ${open ? 'bg-indigo-500/10' : ''}`}>
                      <td className="px-3 py-3"><span className={`inline-grid h-8 w-8 place-items-center rounded-lg font-extrabold ${index < 3 ? 'bg-indigo-500 text-white' : 'bg-slate-100 dark:bg-slate-800'}`}>{index + 1}</span></td>
                      <td className="px-3 py-3">
                        <strong>{group.cid}</strong>
                        <span className="block text-[11px] text-slate-500">TSS {group.tss || '—'} · {group.nombre || 'Institución sin nombre'}</span>
                      </td>
                      <td className="px-3 py-3 text-lg font-bold tabular-nums">{num(group.total)}</td>
                      <td className="px-3 py-3"><span className="rounded-full bg-indigo-500/15 px-2 py-1 font-bold text-indigo-300">{num(group.caida)}</span></td>
                      <td className="px-3 py-3"><span className="rounded-full bg-cyan-500/15 px-2 py-1 font-bold text-cyan-300">{num(group.queja)}</span></td>
                      <td className="px-3 py-3 tabular-nums">{num(group.abiertos)}</td>
                      <td className="px-3 py-3 tabular-nums">{num(group.cerrados)}</td>
                      <td className="px-3 py-3 tabular-nums">{num(group.revisar)}</td>
                      <td className="px-3 py-3">
                        <button type="button" className="rounded-lg bg-indigo-600 px-3 py-1.5 text-[11px] font-semibold text-white" onClick={() => setSelectedCid(open ? '' : group.cid)}>
                          {open ? 'Ocultar' : 'Ver tickets'}
                        </button>
                      </td>
                    </tr>
                    {open ? (
                      <tr className="bg-slate-50 dark:bg-slate-950/50">
                        <td colSpan={9} className="px-4 py-4">
                          <div className="grid gap-2 md:grid-cols-2">
                            {group.tickets.map((row) => (
                              <article key={`${row.row}-${row.ticket}`} className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
                                <div className="flex flex-wrap items-center gap-2">
                                  <strong>{row.ticket || `Fila ${row.row}`}</strong>
                                  <span className={`rounded px-2 py-0.5 text-[10px] font-bold ${slaTipo(row) === 'QUEJA' ? 'bg-cyan-500/15 text-cyan-300' : 'bg-indigo-500/15 text-indigo-300'}`}>{slaNombre(slaTipo(row))}</span>
                                  <span className={`rounded px-2 py-0.5 text-[10px] font-bold ${statusClass(row.status)}`}>{row.status}</span>
                                </div>
                                <p className="mt-2 text-[11px] text-slate-500">Apertura: {row.open_text || '—'} · Cierre: {row.close_text || 'Sin cierre'}</p>
                                <p className="mt-1 text-xs">{row.codigo || 'Sin código'} · {row.causa || 'Sin causa raíz'}</p>
                              </article>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                )
              }) : (
                <tr><td colSpan={9} className="px-3 py-8 text-center text-slate-500">No hay colegios SLA que cumplan estos filtros.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

function summarize(
  rows: PreparedRow[],
  ledger: SlaPart[],
  vivo: Map<string, { saldo: number; consumido: number; error?: string }>,
) {
  const byTicket = new Map<string, SlaPart[]>()
  for (const part of ledger) {
    const key = incidentKey(part.row)
    const list = byTicket.get(key) ?? []
    list.push(part)
    byTicket.set(key, list)
  }
  const bucket = () => ({ dentro: 0, fuera: 0, dentroCerrados: 0, fueraCerrados: 0, dentroAbiertos: 0, fueraAbiertos: 0 })
  const counts: Record<SlaTipo, ReturnType<typeof bucket>> = { CAIDA: bucket(), QUEJA: bucket() }
  for (const row of rows) {
    const tipo = slaTipo(row)
    if (!tipo) continue
    const target = counts[tipo]
    if (row.status === 'ABIERTO') {
      const live = vivo.get(incidentKey(row))
      if (!live || live.error || !Number.isFinite(live.saldo)) continue
      if (live.saldo < 0) {
        target.fuera += 1
        target.fueraAbiertos += 1
      } else {
        target.dentro += 1
        target.dentroAbiertos += 1
      }
      continue
    }
    if (row.status !== 'CERRADO') continue
    const parts = byTicket.get(incidentKey(row)) ?? []
    const decided = parts.length > 0 && parts.every((part) => part.valid && (part.resultado === 'EXCEDIDO' || part.resultado === 'DENTRO DEL SLA'))
    if (!decided) continue
    if (parts.some((part) => part.resultado === 'EXCEDIDO')) {
      target.fuera += 1
      target.fueraCerrados += 1
    } else {
      target.dentro += 1
      target.dentroCerrados += 1
    }
  }
  return (['CAIDA', 'QUEJA'] as const).flatMap((tipo) => [
    { id: `${tipo}-dentro`, tipo, titulo: slaNombre(tipo), modo: 'dentro' as const, etiqueta: 'Dentro del SLA', total: counts[tipo].dentro, cerrados: counts[tipo].dentroCerrados, abiertos: counts[tipo].dentroAbiertos },
    { id: `${tipo}-fuera`, tipo, titulo: slaNombre(tipo), modo: 'fuera' as const, etiqueta: 'Fuera del SLA', total: counts[tipo].fuera, cerrados: counts[tipo].fueraCerrados, abiertos: counts[tipo].fueraAbiertos },
  ])
}
