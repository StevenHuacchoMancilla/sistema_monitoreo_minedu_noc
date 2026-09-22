import { Clock } from 'lucide-react'
import { DataTableFrame } from '../../../components/ui/DataTableFrame'
import {
  CLASSIFICATION_BADGE_CLASS,
  CLASSIFICATION_ROW_CLASS,
  formatOutageDisplay,
  techTypeBadgeClass,
  type ReportRow,
} from '../types/operationalReport'

type Props = {
  rows: ReportRow[]
  showClassification?: boolean
  showAction?: boolean
  onManage?: (incidentId: number) => void
  dense?: boolean
  rowTone?: 'classification' | 'closing' | 'none'
}

function CellTruncate({ value, className = '' }: { value?: string | null; className?: string }) {
  const text = value?.trim() ? value : '—'
  return (
    <span className={`block truncate ${className}`} title={text === '—' ? undefined : text}>
      {text}
    </span>
  )
}

export function ReportDataTable({
  rows,
  showClassification = false,
  showAction = false,
  onManage,
  dense = false,
  rowTone = 'classification',
}: Props) {
  const th = dense
    ? 'whitespace-nowrap px-2.5 py-2 text-[10px] font-semibold uppercase tracking-wide'
    : 'whitespace-nowrap px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide'
  const td = dense ? 'px-2.5 py-2 align-top text-xs' : 'px-3 py-2.5 align-top text-[13px]'

  return (
    <DataTableFrame>
      <table className="w-full min-w-[1600px] border-collapse text-left">
        <thead className="sticky top-0 z-20 border-b border-slate-200 bg-slate-800 text-white">
          <tr>
            <th className={`${th} sticky left-0 z-30 bg-slate-800 w-[70px]`}>N°</th>
            <th className={`${th} sticky left-[70px] z-30 bg-slate-800 w-[100px] shadow-[4px_0_8px_-6px_rgba(0,0,0,0.35)]`}>
              CID
            </th>
            <th className={`${th} min-w-[220px]`}>Local educativo</th>
            <th className={`${th} min-w-[300px]`}>Presentación nombre PRTG</th>
            <th className={`${th} min-w-[140px]`}>Caída</th>
            <th className={`${th} min-w-[90px]`}>Tipo</th>
            <th className={`${th} min-w-[280px]`}>Detalle</th>
            <th className={`${th} min-w-[100px]`}>PEXT/PINT</th>
            <th className={`${th} min-w-[180px]`}>Provincia</th>
            <th className={`${th} min-w-[160px]`}>Distrito</th>
            <th className={`${th} min-w-[130px]`}>Código de local</th>
            {showClassification || showAction ? (
              <th className={`${th} sticky right-0 z-30 bg-slate-800 min-w-[120px] shadow-[-8px_0_8px_-8px_rgba(0,0,0,0.35)]`}>
                {showAction ? 'Acción' : 'Clasificación'}
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const outage = formatOutageDisplay(row)
            const toneClass =
              rowTone === 'closing'
                ? 'bg-red-50/70'
                : rowTone === 'classification'
                  ? (CLASSIFICATION_ROW_CLASS[row.color_key] ?? CLASSIFICATION_ROW_CLASS.slate)
                  : 'bg-white'
            const stickyBg =
              rowTone === 'closing'
                ? 'bg-red-50'
                : row.color_key === 'yellow'
                  ? 'bg-amber-50'
                  : row.color_key === 'red'
                    ? 'bg-red-50'
                    : row.color_key === 'orange'
                      ? 'bg-orange-50'
                      : row.color_key === 'blue'
                        ? 'bg-blue-50'
                        : 'bg-white'

            return (
              <tr key={row.incident_id} className={`border-b border-slate-100 ${toneClass}`}>
                <td className={`${td} sticky left-0 z-10 ${stickyBg} font-medium tabular-nums text-slate-500`}>
                  {row.n ?? '—'}
                </td>
                <td
                  className={`${td} sticky left-[70px] z-10 ${stickyBg} font-mono text-[12px] font-semibold tabular-nums text-slate-900 shadow-[4px_0_8px_-6px_rgba(15,23,42,0.12)]`}
                >
                  {row.cid ?? '—'}
                </td>
                <td className={`${td} max-w-[240px] font-medium text-slate-900`}>
                  <CellTruncate value={row.local_educativo} />
                </td>
                <td className={`${td} max-w-[320px] font-mono text-[11px] text-slate-600`}>
                  <CellTruncate value={row.presentacion_nombre_prtg} />
                </td>
                <td className={`${td} whitespace-nowrap text-slate-800`} title="Inicio de caída reportado por PRTG">
                  <span className="inline-flex items-start gap-1.5">
                    <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
                    <span className="leading-tight">
                      <span className="block font-semibold">{outage.date}</span>
                      {outage.time ? <span className="block text-[11px] text-slate-500">{outage.time}</span> : null}
                    </span>
                  </span>
                </td>
                <td className={td}>
                  {row.tipo ? (
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${techTypeBadgeClass(row.tipo)}`}>
                      {row.tipo}
                    </span>
                  ) : (
                    '—'
                  )}
                </td>
                <td className={`${td} max-w-[300px] text-slate-700`}>
                  <span className="line-clamp-2" title={row.detalle ?? undefined}>
                    {row.detalle?.trim() ? row.detalle : '—'}
                  </span>
                </td>
                <td className={`${td} font-semibold text-slate-800`}>{row.pext_pint ?? '—'}</td>
                <td className={`${td} whitespace-nowrap text-slate-700`}>{row.provincia ?? '—'}</td>
                <td className={`${td} whitespace-nowrap text-slate-700`}>{row.distrito ?? '—'}</td>
                <td className={`${td} whitespace-nowrap font-mono text-[12px] text-slate-600`}>
                  {row.codigo_local ?? '—'}
                </td>
                {showClassification || showAction ? (
                  <td className={`${td} sticky right-0 z-10 ${stickyBg} shadow-[-8px_0_8px_-8px_rgba(15,23,42,0.14)]`}>
                    <div className="flex flex-col gap-1">
                      {showClassification ? (
                        <span
                          className={`inline-flex w-fit rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            CLASSIFICATION_BADGE_CLASS[row.color_key] ?? CLASSIFICATION_BADGE_CLASS.slate
                          }`}
                        >
                          {row.management_classification_label ?? '—'}
                        </span>
                      ) : null}
                      {showAction && onManage ? (
                        <button
                          type="button"
                          className="text-left text-xs font-semibold text-blue-600 hover:underline"
                          onClick={() => onManage(row.incident_id)}
                        >
                          Gestionar →
                        </button>
                      ) : null}
                    </div>
                  </td>
                ) : null}
              </tr>
            )
          })}
        </tbody>
      </table>
    </DataTableFrame>
  )
}
