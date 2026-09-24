import { Activity, CalendarDays, MapPin } from 'lucide-react'
import type { CSSProperties, ReactNode } from 'react'
import { formatDateTime24, formatDate } from '../../../lib/datetime'
import { formatOutageDisplay, type ReportRow } from '../types/operationalReport'

/** Mismo orden que ClosingReportService / officialColumns(). */
export const FINAL_REPORT_IMAGE_COLUMNS = [
  'N°',
  'CID',
  'LOCAL EDUCATIVO',
  'PRESENTACION NOMBRE PRTG',
  'CAÍDA',
  'TIPO',
  'DETALLE',
  'PEXT/PINT',
  'PROVINCIA',
  'DISTRITO',
  'CODIGO DE LOCAL',
] as const

/** Anchos fijos (suma ≈ 2360 dentro del marco). */
const COL_WIDTHS = [
  '48px',
  '84px',
  '210px',
  '320px',
  '108px',
  '62px',
  '280px',
  '72px',
  '130px',
  '120px',
  '100px',
] as const

type Props = {
  rows: ReportRow[]
  generatedAt?: Date
}

function cell(value: string | number | null | undefined): string {
  if (value == null || String(value).trim() === '') return '—'
  return String(value)
}

export function FinalReportImageTemplate({ rows, generatedAt = new Date() }: Props) {
  const dateShort = generatedAt
    .toLocaleDateString('es-PE', {
      timeZone: 'America/Lima',
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
    })
    .replace(/\//g, '.')
  const generatedLabel = formatDateTime24(generatedAt)

  return (
    <div
      data-final-report-image
      style={{
        width: 2480,
        boxSizing: 'border-box',
        background: 'linear-gradient(165deg, #06101F 0%, #0A1628 45%, #071422 100%)',
        color: '#F1F5F9',
        fontFamily: 'Inter, system-ui, sans-serif',
        padding: 36,
      }}
    >
      <div
        style={{
          borderRadius: 18,
          border: '1.5px solid rgba(34, 211, 238, 0.45)',
          boxShadow: '0 0 0 1px rgba(14, 165, 233, 0.12), 0 0 40px rgba(6, 182, 212, 0.12)',
          background: 'linear-gradient(180deg, #0B1B32 0%, #0A1729 100%)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 24,
            padding: '28px 32px 20px',
            borderBottom: '1px solid rgba(34, 211, 238, 0.18)',
            background: 'linear-gradient(90deg, #0B1B32 0%, #0F2744 55%, #0B1B32 100%)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 12,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'linear-gradient(135deg, #2563EB, #0891B2)',
                boxShadow: '0 0 20px rgba(34, 211, 238, 0.35)',
              }}
            >
              <Activity size={24} color="#fff" strokeWidth={2.25} />
            </div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', color: '#F8FAFC' }}>NOC</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#94A3B8', marginTop: 2 }}>
                Monitoreo LLEE · MINEDU
              </div>
            </div>
          </div>

          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 18px',
              borderRadius: 999,
              border: '2px solid rgba(34, 211, 238, 0.75)',
              background: 'rgba(8, 47, 73, 0.55)',
              boxShadow: '0 0 18px rgba(34, 211, 238, 0.25)',
            }}
          >
            <CalendarDays size={18} color="#22D3EE" />
            <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: '0.04em', color: '#F8FAFC' }}>
              {dateShort}
            </span>
          </div>
        </div>

        <div style={{ textAlign: 'center', padding: '22px 32px 18px' }}>
          <div
            style={{
              fontSize: 26,
              fontWeight: 800,
              letterSpacing: '0.08em',
              color: '#F8FAFC',
              textTransform: 'uppercase',
            }}
          >
            Informe final de incidencias
          </div>
          <div style={{ marginTop: 6, fontSize: 14, fontWeight: 600, color: '#67E8F9' }}>
            Locales con contacto confirmado · PRTG
          </div>
          <div
            style={{
              marginTop: 14,
              display: 'flex',
              justifyContent: 'center',
              gap: 28,
              fontSize: 13,
              color: '#CBD5E1',
              fontWeight: 500,
            }}
          >
            <span>
              Fecha de generación: <strong style={{ color: '#F1F5F9' }}>{generatedLabel}</strong>
            </span>
            <span>
              Total registros:{' '}
              <strong style={{ color: '#22D3EE' }}>{rows.length.toLocaleString('es-PE')}</strong>
            </span>
          </div>
        </div>

        <div style={{ padding: '0 20px 24px' }}>
          <table
            style={{
              width: '100%',
              borderCollapse: 'separate',
              borderSpacing: 0,
              tableLayout: 'fixed',
            }}
          >
            <colgroup>
              {COL_WIDTHS.map((w, i) => (
                <col key={FINAL_REPORT_IMAGE_COLUMNS[i]} style={{ width: w }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                {FINAL_REPORT_IMAGE_COLUMNS.map((label, i) => (
                  <th
                    key={label}
                    style={{
                      padding: '11px 8px',
                      fontSize: 10,
                      fontWeight: 800,
                      letterSpacing: '0.05em',
                      textTransform: 'uppercase',
                      color: '#F8FAFC',
                      textAlign: 'left',
                      verticalAlign: 'middle',
                      overflow: 'hidden',
                      background:
                        i === 0
                          ? 'linear-gradient(135deg, #1D4ED8, #1E40AF)'
                          : 'linear-gradient(135deg, #1E3A8A, #1E40AF)',
                      borderTop: '1px solid rgba(34, 211, 238, 0.35)',
                      borderBottom: '1px solid rgba(34, 211, 238, 0.35)',
                      borderRight:
                        i < FINAL_REPORT_IMAGE_COLUMNS.length - 1
                          ? '1px solid rgba(14, 165, 233, 0.25)'
                          : 'none',
                    }}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => {
                const outage = formatOutageDisplay(row)
                const caidaText = outage.time ? `${outage.date} ${outage.time}` : outage.date
                const zebra = idx % 2 === 0 ? 'rgba(15, 39, 66, 0.55)' : 'rgba(11, 27, 50, 0.85)'
                const prtgName = cell(row.presentacion_nombre_prtg)
                const detalle = cell(row.detalle)

                return (
                  <tr key={row.incident_id}>
                    <Td bg={zebra} center>
                      <span
                        style={{
                          display: 'inline-flex',
                          minWidth: 28,
                          height: 28,
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderRadius: 999,
                          border: '1.5px solid rgba(34, 211, 238, 0.7)',
                          background: 'rgba(8, 47, 73, 0.7)',
                          color: '#E0F2FE',
                          fontSize: 11,
                          fontWeight: 800,
                        }}
                      >
                        {cell(row.n)}
                      </span>
                    </Td>
                    <Td bg={zebra} mono>
                      {cell(row.cid)}
                    </Td>
                    <Td bg={zebra} strong>
                      {cell(row.local_educativo)}
                    </Td>
                    <Td bg={zebra} mono small>
                      <span
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: 6,
                          maxWidth: '100%',
                          overflow: 'hidden',
                        }}
                      >
                        <MapPin size={12} color="#F87171" style={{ marginTop: 2, flexShrink: 0 }} />
                        <span
                          title={prtgName === '—' ? undefined : prtgName}
                          style={{
                            overflow: 'hidden',
                            wordBreak: 'break-all',
                            overflowWrap: 'anywhere',
                            lineHeight: 1.4,
                          }}
                        >
                          {prtgName}
                        </span>
                      </span>
                    </Td>
                    <Td bg={zebra}>{caidaText}</Td>
                    <Td bg={zebra} center>
                      {row.tipo ? (
                        <span
                          style={{
                            display: 'inline-flex',
                            padding: '2px 8px',
                            borderRadius: 999,
                            fontSize: 10,
                            fontWeight: 700,
                            background:
                              row.tipo.toUpperCase() === 'GPON'
                                ? 'rgba(6, 182, 212, 0.2)'
                                : 'rgba(99, 102, 241, 0.22)',
                            color: row.tipo.toUpperCase() === 'GPON' ? '#67E8F9' : '#A5B4FC',
                            border: '1px solid rgba(148, 163, 184, 0.25)',
                          }}
                        >
                          {row.tipo}
                        </span>
                      ) : (
                        '—'
                      )}
                    </Td>
                    <Td bg={zebra}>
                      <span
                        title={detalle === '—' ? undefined : detalle}
                        style={{
                          display: 'block',
                          lineHeight: 1.45,
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                          overflowWrap: 'anywhere',
                        }}
                      >
                        {detalle}
                      </span>
                    </Td>
                    <Td bg={zebra} strong center>
                      {cell(row.pext_pint)}
                    </Td>
                    <Td bg={zebra}>{cell(row.provincia)}</Td>
                    <Td bg={zebra}>{cell(row.distrito)}</Td>
                    <Td bg={zebra} mono>
                      {cell(row.codigo_local)}
                    </Td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '14px 28px 18px',
            borderTop: '1px solid rgba(34, 211, 238, 0.15)',
            fontSize: 11,
            color: '#64748B',
            fontWeight: 500,
          }}
        >
          <span>NOC · Informe final · Contacto confirmado</span>
          <span>Generado {formatDate(generatedAt)} · Solo lectura operativa</span>
        </div>
      </div>
    </div>
  )
}

function Td({
  children,
  bg,
  mono,
  strong,
  small,
  center,
}: {
  children: ReactNode
  bg: string
  mono?: boolean
  strong?: boolean
  small?: boolean
  center?: boolean
}) {
  const style: CSSProperties = {
    padding: '11px 8px',
    background: bg,
    borderBottom: '1px solid rgba(34, 211, 238, 0.12)',
    verticalAlign: 'top',
    fontSize: small ? 10.5 : 12,
    lineHeight: 1.4,
    color: '#E2E8F0',
    fontWeight: strong ? 650 : 500,
    fontFamily: mono ? 'ui-monospace, SFMono-Regular, Menlo, monospace' : undefined,
    textAlign: center ? 'center' : 'left',
    overflow: 'hidden',
    wordBreak: 'break-word',
    overflowWrap: 'anywhere',
  }

  return <td style={style}>{children}</td>
}
