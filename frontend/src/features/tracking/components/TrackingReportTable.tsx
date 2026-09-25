import { Link } from 'react-router-dom'
import { DataTableContainer } from '../../../components/ui/DataTableFrame'
import type { TrackingReportColumn, TrackingReportRow } from '../types/trackingReport'

const COLUMN_WIDTH: Record<string, string> = {
  n_incidente: 'min-w-[88px]',
  ticket: 'min-w-[90px]',
  tss: 'min-w-[70px]',
  cid: 'min-w-[90px]',
  descripcion: 'min-w-[200px]',
  apertura: 'min-w-[120px]',
  nombre_apertura: 'min-w-[110px]',
  codigo: 'min-w-[90px]',
  causa: 'min-w-[180px]',
  seguimiento: 'min-w-[320px]',
  cierre: 'min-w-[120px]',
  nombre_cierre: 'min-w-[110px]',
}

function cellValue(row: TrackingReportRow, key: string): string {
  const raw = row[key as keyof TrackingReportRow]
  if (raw == null || raw === '') return '—'
  return String(raw)
}

export function TrackingReportTable({
  columns,
  rows,
}: {
  columns: TrackingReportColumn[]
  rows: TrackingReportRow[]
}) {
  const th =
    'whitespace-nowrap px-2.5 py-2 text-[10px] font-semibold uppercase tracking-wide text-white'
  const td = 'px-2.5 py-2 align-top text-xs text-slate-800 dark:text-slate-200'

  return (
    <DataTableContainer>
      <table className="w-full min-w-[1400px] border-collapse text-left">
        <thead className="sticky top-0 z-20 border-b border-violet-900/40 bg-violet-900">
          <tr>
            {columns.map((col, idx) => (
              <th
                key={`${col.key}-${idx}`}
                className={`${th} ${COLUMN_WIDTH[col.key] ?? 'min-w-[100px]'} ${
                  idx === 0 ? 'sticky left-0 z-30 bg-violet-900' : ''
                }`}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const closed = row.is_closed
            const rowBg = closed
              ? 'bg-emerald-50/80 dark:bg-emerald-950/30'
              : 'bg-white dark:bg-slate-900'
            const stickyBg = closed
              ? 'bg-emerald-50 dark:bg-emerald-950/40'
              : 'bg-white dark:bg-slate-900'

            return (
              <tr
                key={row.id}
                className={`border-b border-slate-100 dark:border-slate-800 ${rowBg} hover:bg-violet-50/40 dark:hover:bg-violet-950/30`}
              >
                {columns.map((col, idx) => {
                  const value = cellValue(row, col.key)
                  const isSeguimiento = col.key === 'seguimiento'
                  const isCausa = col.key === 'causa'
                  const isFirst = idx === 0

                  return (
                    <td
                      key={`${row.id}-${col.key}-${idx}`}
                      className={[
                        td,
                        COLUMN_WIDTH[col.key] ?? '',
                        isFirst ? `sticky left-0 z-10 ${stickyBg} font-semibold tabular-nums` : '',
                        col.key === 'cid' || col.key === 'tss' || col.key === 'codigo'
                          ? 'font-mono tabular-nums'
                          : '',
                        isSeguimiento || isCausa
                          ? 'max-w-[360px] whitespace-pre-wrap leading-relaxed'
                          : '',
                      ].join(' ')}
                    >
                      {isFirst ? (
                        <Link
                          to={`/tracking/${row.id}`}
                          className="text-violet-800 hover:underline dark:text-violet-300"
                          title="Abrir detalle"
                        >
                          {value}
                        </Link>
                      ) : (
                        value
                      )}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </DataTableContainer>
  )
}
