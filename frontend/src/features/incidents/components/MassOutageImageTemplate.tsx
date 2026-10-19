import type { CSSProperties } from 'react'
import { formatDateTime } from '../../../lib/datetime'

export type MassOutageImageRow = {
  tss?: number | string | null
  cid: string | null
  local_educativo: string | null
  provincia?: string | null
  distrito?: string | null
  tecnologia: string | null
  down_started_at: string | null
  duration_label?: string | null
}

const COLS = ['TSS', 'CID', 'LOCAL EDUCATIVO', 'UBICACIÓN', 'TEC.', 'CAÍDA', 'LLEVA'] as const

export function MassOutageImageTemplate({
  nodo,
  rows,
  generatedAt = new Date(),
}: {
  nodo: string
  rows: MassOutageImageRow[]
  generatedAt?: Date
}) {
  const when = formatDateTime(generatedAt.toISOString())

  return (
    <div
      data-mass-outage-image
      style={{
        width: 1480,
        boxSizing: 'border-box',
        background: 'linear-gradient(165deg, #0B1220 0%, #111827 55%, #0F172A 100%)',
        color: '#F8FAFC',
        fontFamily: 'Inter, system-ui, sans-serif',
        padding: 28,
      }}
    >
      <div
        style={{
          borderRadius: 16,
          border: '1px solid rgba(248, 113, 113, 0.35)',
          background: 'rgba(15, 23, 42, 0.92)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 16,
            padding: '18px 22px',
            borderBottom: '1px solid rgba(148, 163, 184, 0.2)',
            background: 'linear-gradient(90deg, rgba(127,29,29,0.35), transparent)',
          }}
        >
          <div>
            <p style={{ margin: 0, fontSize: 11, letterSpacing: '0.14em', fontWeight: 700, color: '#FCA5A5' }}>
              CAÍDAS MASIVAS · NODO/POP
            </p>
            <h1 style={{ margin: '6px 0 0', fontSize: 26, fontWeight: 750 }}>{nodo}</h1>
            <p style={{ margin: '6px 0 0', fontSize: 13, color: '#94A3B8' }}>
              Solo colegios caídos seleccionados · {rows.length} fila{rows.length === 1 ? '' : 's'}
            </p>
          </div>
          <div style={{ textAlign: 'right', fontSize: 12, color: '#94A3B8' }}>
            <p style={{ margin: 0, fontWeight: 600, color: '#E2E8F0' }}>NOC Loreto</p>
            <p style={{ margin: '4px 0 0' }}>{when}</p>
          </div>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              {COLS.map((col) => (
                <th
                  key={col}
                  style={{
                    textAlign: 'left',
                    padding: '10px 12px',
                    fontSize: 10,
                    letterSpacing: '0.08em',
                    color: '#94A3B8',
                    borderBottom: '1px solid rgba(148,163,184,0.25)',
                    background: 'rgba(2,6,23,0.45)',
                  }}
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const ubic = [row.provincia, row.distrito].filter(Boolean).join(' · ') || '—'
              return (
                <tr key={`${row.cid}-${i}`} style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(30,41,59,0.35)' }}>
                  <td style={td}>{row.tss ?? '—'}</td>
                  <td style={{ ...td, fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{row.cid ?? '—'}</td>
                  <td style={td}>{row.local_educativo ?? '—'}</td>
                  <td style={td}>{ubic}</td>
                  <td style={td}>{row.tecnologia ?? '—'}</td>
                  <td style={{ ...td, fontVariantNumeric: 'tabular-nums' }}>
                    {row.down_started_at ? formatDateTime(row.down_started_at) : '—'}
                  </td>
                  <td style={{ ...td, color: '#FCA5A5', fontWeight: 650 }}>{row.duration_label ?? '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const td: CSSProperties = {
  padding: '9px 12px',
  borderBottom: '1px solid rgba(51,65,85,0.55)',
  verticalAlign: 'top',
  color: '#E2E8F0',
}
