import type { CSSProperties } from 'react'
import { formatDateTime, formatDuration } from '../../../lib/datetime'
import type { RestorationRow } from '../types'

const COLS = ['CID', 'TSS', 'LOCAL EDUCATIVO', 'UBICACIÓN', 'CAÍDA', 'RESTABLECIDO', 'DURACIÓN'] as const

export function RestorationImageTemplate({
  rows,
  windowMinutes,
  generatedAt = new Date(),
}: {
  rows: RestorationRow[]
  windowMinutes: number
  generatedAt?: Date
}) {
  const when = formatDateTime(generatedAt.toISOString())
  const recent = rows.filter((row) => row.is_recent).length

  return (
    <div
      data-restoration-image
      style={{
        width: 1480,
        boxSizing: 'border-box',
        background: 'linear-gradient(165deg, #052e1f 0%, #0B1220 48%, #0F172A 100%)',
        color: '#F8FAFC',
        fontFamily: 'Inter, system-ui, sans-serif',
        padding: 28,
      }}
    >
      <div
        style={{
          borderRadius: 16,
          border: '1px solid rgba(52, 211, 153, 0.35)',
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
            background: 'linear-gradient(90deg, rgba(6, 78, 59, 0.45), transparent)',
          }}
        >
          <div>
            <p style={{ margin: 0, fontSize: 11, letterSpacing: '0.14em', fontWeight: 700, color: '#6EE7B7' }}>
              RESTABLECIMIENTOS · NOC LORETO
            </p>
            <h1 style={{ margin: '6px 0 0', fontSize: 26, fontWeight: 750 }}>Colegios restablecidos</h1>
            <p style={{ margin: '6px 0 0', fontSize: 13, color: '#94A3B8' }}>
              Últimos {windowMinutes} min · {rows.length} colegio{rows.length === 1 ? '' : 's'}
              {recent > 0 ? ` · ${recent} reciente${recent === 1 ? '' : 's'}` : ''}
            </p>
          </div>
          <div style={{ textAlign: 'right', fontSize: 12, color: '#94A3B8' }}>
            <p style={{ margin: 0, fontWeight: 600, color: '#E2E8F0' }}>NOC Loreto · MINEDU</p>
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
                    padding: '12px 14px',
                    fontSize: 11,
                    letterSpacing: '0.08em',
                    color: '#94A3B8',
                    borderBottom: '1px solid rgba(148, 163, 184, 0.18)',
                    background: 'rgba(2, 44, 34, 0.35)',
                  }}
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr
                key={row.incident_id}
                style={{
                  background: index % 2 === 0 ? 'transparent' : 'rgba(15, 23, 42, 0.55)',
                }}
              >
                <td style={cell}>{row.cid ?? '—'}</td>
                <td style={cell}>{row.tss ?? '—'}</td>
                <td style={{ ...cell, maxWidth: 320 }}>
                  <span style={{ fontWeight: 600 }}>{row.local_educativo ?? '—'}</span>
                  {row.is_recent ? (
                    <span
                      style={{
                        marginLeft: 8,
                        display: 'inline-block',
                        borderRadius: 999,
                        padding: '1px 8px',
                        fontSize: 10,
                        fontWeight: 700,
                        color: '#042F2E',
                        background: '#5EEAD4',
                      }}
                    >
                      Reciente
                    </span>
                  ) : null}
                  {row.codigo_local || row.tecnologia ? (
                    <span style={{ display: 'block', marginTop: 2, fontSize: 11, color: '#94A3B8' }}>
                      {[row.codigo_local, row.tecnologia].filter(Boolean).join(' · ')}
                    </span>
                  ) : null}
                </td>
                <td style={cell}>
                  {[row.provincia, row.distrito].filter(Boolean).join(' · ') || '—'}
                </td>
                <td style={cell}>{row.started_at ? formatDateTime(row.started_at) : '—'}</td>
                <td style={{ ...cell, color: '#6EE7B7', fontWeight: 600 }}>
                  {row.recovered_at ? formatDateTime(row.recovered_at) : '—'}
                </td>
                <td style={cell}>
                  {row.duration ?? formatDuration(row.duration_seconds)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const cell: CSSProperties = {
  padding: '11px 14px',
  borderBottom: '1px solid rgba(148, 163, 184, 0.12)',
  verticalAlign: 'top',
  color: '#E2E8F0',
}
