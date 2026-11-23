import type { CSSProperties } from 'react'

export type ReporteServicioFila = {
  cid: string | null
  tss: string | null
  codigoLocal: string | null
  nodoPop: string | null
  caidaIso: string | null
  restablecidoIso?: string | null
  causaRaiz?: string | null
}

const ZONE = 'America/Lima'

function parts(iso: string | null | undefined) {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  const bag = new Intl.DateTimeFormat('en-US', {
    timeZone: ZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).formatToParts(date)
  const pick = (type: Intl.DateTimeFormatPartTypes) => bag.find((part) => part.type === type)?.value ?? ''
  const period = pick('dayPeriod').toLowerCase().startsWith('a') ? 'a.m.' : 'p.m.'
  return {
    fecha: `${pick('day')}/${pick('month')}/${pick('year')}`,
    hora: `${pick('hour')}:${pick('minute')} ${period}`,
  }
}

function earliest(rows: ReporteServicioFila[], field: 'caidaIso' | 'restablecidoIso'): string | null {
  let best = Number.POSITIVE_INFINITY
  let iso: string | null = null
  for (const row of rows) {
    const value = row[field]
    if (!value) continue
    const ms = Date.parse(value)
    if (Number.isNaN(ms) || ms >= best) continue
    best = ms
    iso = value
  }
  return iso
}

function institucion(row: ReporteServicioFila): string {
  const code = (row.codigoLocal || row.cid || '—').trim() || '—'
  const tss = (row.tss || '—').trim() || '—'
  return `${code}(tss->${tss})`
}

function text(value: string | null | undefined): string {
  const clean = value?.trim()
  return clean ? clean : '—'
}

export function PlantillaReporteServicio({
  kind,
  rows,
  responsable,
}: {
  kind: 'corte' | 'restablecido'
  rows: ReporteServicioFila[]
  responsable: string
}) {
  const restored = kind === 'restablecido'
  const many = rows.length > 1
  const start = parts(earliest(rows, 'caidaIso'))
  const end = parts(many ? null : rows[0]?.restablecidoIso)
  const accent = restored ? '#34d399' : '#f87171'
  const ink = restored ? '#052e1f' : '#2a0b0b'
  const lines: Array<[string, string]> = []

  if (!many) {
    const row = rows[0]
    lines.push(['🏫', `Institución educativa: ${row ? institucion(row) : '—'}`])
    if (restored) lines.push(['📡', `Nodo/POP: ${text(row?.nodoPop)}`])
    if (restored) lines.push(['🧩', `Causa raíz: ${text(row?.causaRaiz)}`])
    lines.push(['📅', `Fecha del incidente: [${start?.fecha ?? '—'}]`])
    lines.push(['🕐', restored ? `Hora de inicio de la caída: [${start?.hora ?? '—'}]` : `Hora de inicio del corte: [${start?.hora ?? '—'}]`])
    if (restored) lines.push(['🟢', `Hora de restablecimiento: [${end?.hora ?? '—'}]`])
  }

  lines.push(['👤', `Responsable del reporte: [${responsable.trim() || 'NOC'} - NOC]`])
  lines.push(['🌐', 'Servicio afectado: Servicio de internet.'])
  lines.push(['🚦', restored ? 'Estado del servicio: 🟢 Servicio restablecido' : 'Estado del servicio: 🔴 Sin servicio'])

  return (
    <div
      data-reporte-servicio
      style={{
        width: many ? (restored ? 1180 : 980) : 760,
        boxSizing: 'border-box',
        background: ink,
        padding: 22,
        fontFamily: '"Segoe UI", Inter, system-ui, sans-serif',
        color: '#f8fafc',
      }}
    >
      <div
        style={{
          borderRadius: 18,
          border: `1px solid ${accent}`,
          background: '#111827',
          padding: '22px 24px 20px',
        }}
      >
        <p style={{ margin: 0, fontSize: 13, fontWeight: 700, letterSpacing: '0.08em', color: accent }}>
          {restored ? 'RESTABLECIDO' : 'CORTE DE SERVICIO'}
        </p>
        <h1 style={{ margin: '8px 0 0', fontSize: 26, lineHeight: 1.25, fontWeight: 750 }}>
          {restored ? '📡 REPORTE DE RESTABLECIMIENTO DE SERVICIO DE INTERNET' : '📡 REPORTE DE CORTE DE SERVICIO DE INTERNET'}
        </h1>

        {many ? (
          <div style={{ marginTop: 18 }}>
            <p style={{ margin: '0 0 10px', fontSize: 18, fontWeight: 650 }}>🏫 Institución educativa:</p>
            <Lista rows={rows} restored={restored} />
            {!restored ? (
              <div style={{ marginTop: 14 }}>
                <Linea icon="📅" text={`Fecha del incidente: [${start?.fecha ?? '—'}]`} />
                <Linea icon="🕐" text={`Hora de inicio del corte: [${start?.hora ?? '—'}]`} />
              </div>
            ) : null}
          </div>
        ) : null}

        <div style={{ marginTop: many ? 8 : 18 }}>
          {lines.map(([icon, value]) => (
            <Linea key={value} icon={icon} text={value} />
          ))}
        </div>
      </div>
    </div>
  )
}

function Linea({ icon, text: value }: { icon: string; text: string }) {
  return (
    <p style={{ margin: '7px 0', fontSize: 18, lineHeight: 1.35, fontWeight: 600 }}>
      <span style={{ marginRight: 8 }}>{icon}</span>
      {value}
    </p>
  )
}

function Lista({ rows, restored }: { rows: ReporteServicioFila[]; restored: boolean }) {
  const head: CSSProperties = {
    fontSize: 13,
    letterSpacing: '0.06em',
    color: '#94a3b8',
    fontWeight: 700,
    padding: '0 0 8px',
  }
  const cell: CSSProperties = {
    fontFamily: 'ui-monospace, Consolas, monospace',
    fontSize: 16,
    fontWeight: 650,
    padding: '4px 12px 4px 0',
    color: '#f8fafc',
  }
  return (
    <table style={{ borderCollapse: 'collapse', width: '100%' }}>
      <thead>
        <tr>
          <th style={{ ...head, textAlign: 'left' }}>CID</th>
          <th style={{ ...head, textAlign: 'left' }}>TSS</th>
          {restored ? <th style={{ ...head, textAlign: 'left' }}>NODO/POP</th> : null}
          {restored ? <th style={{ ...head, textAlign: 'left' }}>CAÍDA</th> : null}
          {restored ? <th style={{ ...head, textAlign: 'left' }}>RESTABLECIDO</th> : null}
          {restored ? <th style={{ ...head, textAlign: 'left' }}>CAUSA RAÍZ</th> : null}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => {
          const down = parts(row.caidaIso)
          const up = parts(row.restablecidoIso)
          return (
            <tr key={`${row.cid ?? 'x'}-${row.tss ?? index}`}>
              <td style={cell}>{text(row.cid)}</td>
              <td style={cell}>{text(row.tss)}</td>
              {restored ? <td style={cell}>{text(row.nodoPop)}</td> : null}
              {restored ? <td style={cell}>{down ? `${down.fecha} ${down.hora}` : '—'}</td> : null}
              {restored ? <td style={{ ...cell, color: '#6ee7b7' }}>{up ? `${up.fecha} ${up.hora}` : '—'}</td> : null}
              {restored ? (
                <td style={{ ...cell, fontFamily: '"Segoe UI", Inter, system-ui, sans-serif', fontSize: 15, maxWidth: 280 }}>
                  {text(row.causaRaiz)}
                </td>
              ) : null}
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
