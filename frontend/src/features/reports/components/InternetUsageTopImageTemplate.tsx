import { Gauge } from 'lucide-react'
import type { CSSProperties } from 'react'
import { formatDateTime24 } from '../../../lib/datetime'

export type UsageTopRow = {
  rank?: number | null
  assignment_id?: number | null
  cid?: string | number | null
  tss?: string | number | null
  local_educativo?: string | null
  provincia?: string | null
  ambito?: string | null
  tecnologia?: string | null
  nodo_acceso?: string | null
  consumo?: string | null
  consumo_max?: string | null
  tx_max?: string | null
  rx_max?: string | null
  caidas?: number | null
  estabilidad?: string | null
  prtg_status?: string | null
}

type Props = {
  periodLabel: string
  rural: UsageTopRow[]
  urbano: UsageTopRow[]
  generatedAt?: Date
  heading?: string
  subheading?: string
  showTecnologia?: boolean
  volumeMode?: boolean
}

function cell(value: string | number | null | undefined): string {
  if (value == null || String(value).trim() === '') return '—'
  return String(value)
}

function TopTable({
  title,
  accent,
  rows,
  showTecnologia,
  volumeMode,
}: {
  title: string
  accent: string
  rows: UsageTopRow[]
  showTecnologia: boolean
  volumeMode: boolean
}) {
  const cols = volumeMode
    ? showTecnologia
      ? (['#', 'CID', 'TSS', 'Local', 'Tecnología', 'Provincia', 'Consumo (MB)', 'Caídas', 'Estabilidad', 'PRTG'] as const)
      : (['#', 'CID', 'TSS', 'Local', 'Provincia', 'Consumo (MB)', 'Caídas', 'Estabilidad', 'PRTG'] as const)
    : showTecnologia
      ? (['#', 'CID', 'TSS', 'Local', 'Tecnología', 'Provincia', 'Consumo máx', 'TX máx', 'Caídas', 'Estabilidad', 'PRTG'] as const)
      : (['#', 'CID', 'TSS', 'Local', 'Provincia', 'Consumo máx', 'TX máx', 'Caídas', 'Estabilidad', 'PRTG'] as const)
  const widths = volumeMode
    ? showTecnologia
      ? (['40px', '90px', '64px', '220px', '90px', '130px', '120px', '70px', '100px', '110px'] as const)
      : (['40px', '90px', '64px', '260px', '140px', '130px', '70px', '100px', '110px'] as const)
    : showTecnologia
      ? (['40px', '90px', '64px', '210px', '90px', '120px', '110px', '100px', '70px', '100px', '110px'] as const)
      : (['40px', '90px', '64px', '240px', '130px', '120px', '110px', '70px', '100px', '110px'] as const)

  return (
    <div style={{ marginTop: 22 }}>
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 10,
          marginBottom: 12,
          padding: '8px 14px',
          borderRadius: 10,
          background: `${accent}22`,
          border: `1px solid ${accent}66`,
          color: accent,
          fontWeight: 800,
          fontSize: 15,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
        }}
      >
        {title}
      </div>
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          tableLayout: 'fixed',
          fontSize: 13,
        }}
      >
        <colgroup>
          {widths.map((w, i) => (
            <col key={cols[i]} style={{ width: w }} />
          ))}
        </colgroup>
        <thead>
          <tr style={{ background: '#0F2744' }}>
            {cols.map((h) => (
              <th
                key={h}
                style={{
                  padding: '10px 8px',
                  textAlign: 'left',
                  color: '#94A3B8',
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  borderBottom: '1px solid rgba(34, 211, 238, 0.25)',
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={cols.length} style={{ padding: 16, color: '#64748B' }}>
                Sin datos con ámbito y muestras de tráfico en el mes.
              </td>
            </tr>
          ) : (
            rows.map((row, idx) => (
              <tr
                key={`${row.cid ?? idx}-${row.rank ?? idx}`}
                style={{ background: idx % 2 === 0 ? '#0B1B32' : '#0A1729' }}
              >
                <td style={td}>{cell(row.rank ?? idx + 1)}</td>
                <td style={{ ...td, fontFamily: 'ui-monospace, monospace', fontWeight: 700 }}>{cell(row.cid)}</td>
                <td style={{ ...td, fontFamily: 'ui-monospace, monospace', fontWeight: 700, color: '#FDE68A' }}>
                  {cell(row.tss)}
                </td>
                <td style={{ ...td, fontWeight: 600 }}>{cell(row.local_educativo)}</td>
                {showTecnologia ? <td style={td}>{cell(row.tecnologia)}</td> : null}
                <td style={td}>{cell(row.provincia)}</td>
                <td style={{ ...td, color: '#67E8F9', fontWeight: 700 }}>
                  {cell(row.consumo ?? row.consumo_max)}
                </td>
                {!volumeMode ? <td style={td}>{cell(row.tx_max)}</td> : null}
                <td style={{ ...td, fontWeight: 700, color: Number(row.caidas ?? 0) === 0 ? '#4ADE80' : '#FBBF24' }}>
                  {cell(row.caidas ?? 0)}
                </td>
                <td style={{ ...td, fontWeight: 700, color: '#A7F3D0' }}>{cell(row.estabilidad)}</td>
                <td style={td}>{cell(row.prtg_status)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}

const td: CSSProperties = {
  padding: '11px 8px',
  color: '#E2E8F0',
  borderBottom: '1px solid rgba(148, 163, 184, 0.12)',
  verticalAlign: 'top',
  wordBreak: 'break-word',
}

export function InternetUsageTopImageTemplate({
  periodLabel,
  rural,
  urbano,
  generatedAt = new Date(),
  heading = 'NOC · Uso de internet',
  subheading = 'Top 5 Rural · Top 5 Urbano · mayor consumo y menos caídas',
  showTecnologia = false,
  volumeMode = false,
}: Props) {
  const generatedLabel = formatDateTime24(generatedAt)

  return (
    <div
      data-usage-top-image
      style={{
        width: showTecnologia || volumeMode ? 1580 : 1480,
        boxSizing: 'border-box',
        background: 'linear-gradient(165deg, #06101F 0%, #0A1628 45%, #071422 100%)',
        color: '#F1F5F9',
        fontFamily: 'Inter, system-ui, sans-serif',
        padding: 32,
      }}
    >
      <div
        style={{
          borderRadius: 18,
          border: '1.5px solid rgba(34, 211, 238, 0.45)',
          boxShadow: '0 0 0 1px rgba(14, 165, 233, 0.12), 0 0 40px rgba(6, 182, 212, 0.12)',
          background: 'linear-gradient(180deg, #0B1B32 0%, #0A1729 100%)',
          overflow: 'hidden',
          padding: '28px 30px 32px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 20, alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div
              style={{
                width: 46,
                height: 46,
                borderRadius: 12,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'linear-gradient(135deg, #2563EB, #0891B2)',
              }}
            >
              <Gauge size={22} color="#fff" strokeWidth={2.25} />
            </div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#F8FAFC' }}>{heading}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#94A3B8', marginTop: 2 }}>{subheading}</div>
            </div>
          </div>
          <div style={{ textAlign: 'right', fontSize: 12, color: '#94A3B8', lineHeight: 1.5 }}>
            <div>{periodLabel}</div>
            <div>Generado: {generatedLabel}</div>
          </div>
        </div>

        <TopTable
          title="Top 5 Rural"
          accent="#34D399"
          rows={rural}
          showTecnologia={showTecnologia}
          volumeMode={volumeMode}
        />
        <TopTable
          title="Top 5 Urbano"
          accent="#38BDF8"
          rows={urbano}
          showTecnologia={showTecnologia}
          volumeMode={volumeMode}
        />
      </div>
    </div>
  )
}
