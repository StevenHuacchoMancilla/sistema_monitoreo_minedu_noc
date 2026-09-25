import { Clock } from 'lucide-react'
import { DataTableContainer } from '../../../components/ui/DataTableFrame'
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

const ROW_DARK_CLASS: Record<string, string> = {
  yellow: 'dark:bg-yellow-950/45 dark:border-yellow-500',
  red: 'dark:bg-red-950/50 dark:border-red-500',
  orange: 'dark:bg-orange-950/45 dark:border-orange-500',
  blue: 'dark:bg-blue-950/35 dark:border-blue-600',
  slate: 'dark:bg-slate-800/80 dark:border-slate-600',
}

const STICKY_DARK: Record<string, string> = {
  yellow: 'dark:bg-yellow-950/60',
  red: 'dark:bg-red-950/60',
  orange: 'dark:bg-orange-950/60',
  blue: 'dark:bg-blue-950/50',
  slate: 'dark:bg-slate-900',
}

function CellTruncate({ value, className = '' }: { value?: string | null; className?: string }) {
  const text = value?.trim() ? value : '—'
  return (
    <span className={`block truncate ${className}`} title={text === '—' ? undefined : text}>
      {text}
    </span>
  )
}

function stickyCellBg(row: ReportRow, rowTone: Props['rowTone']): string {
  if (rowTone === 'closing') {
    return 'bg-red-50 dark:bg-red-950/50'
  }
  const key = row.color_key ?? 'slate'
  const light =
    key === 'yellow'
      ? 'bg-yellow-100'
      : key === 'red'
        ? 'bg-red-100'
        : key === 'orange'
          ? 'bg-orange-100'
          : key === 'blue'
            ? 'bg-blue-50'
            : 'bg-white dark:bg-slate-900'
  return `${light} ${STICKY_DARK[key] ?? STICKY_DARK.slate}`
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
    <DataTableContainer>
      <table className="w-full min-w-[1600px] border-collapse text-left text-slate-800 dark:text-slate-200">
        <thead className="sticky top-0 z-20 border-b border-slate-700 bg-slate-800 text-white dark:border-slate-700 dark:bg-slate-950">
          <tr>
            <th className={`${th} sticky left-0 z-30 w-[70px] bg-slate-800 dark:bg-slate-950`}>N°</th>
            <th
              className={`${th} sticky left-[70px] z-30 w-[100px] bg-slate-800 shadow-[4px_0_8px_-6px_rgba(0,0,0,0.35)] dark:bg-slate-950`}
            >
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
              <th
                className={`${th} sticky right-0 z-30 min-w-[120px] bg-slate-800 shadow-[-8px_0_8px_-8px_rgba(0,0,0,0.35)] dark:bg-slate-950`}
              >
                {showAction ? 'Acción' : 'Clasificación'}
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const outage = formatOutageDisplay(row)
            const colorKey = row.color_key ?? 'slate'
            const toneClass =
              rowTone === 'closing'
                ? 'bg-red-50/70 dark:bg-red-950/30'
                : rowTone === 'classification'
                  ? `${CLASSIFICATION_ROW_CLASS[colorKey] ?? CLASSIFICATION_ROW_CLASS.slate} ${ROW_DARK_CLASS[colorKey] ?? ROW_DARK_CLASS.slate}`
                  : 'bg-white dark:bg-slate-900'
            const stickyBg = stickyCellBg(row, rowTone)

            return (
              <tr key={row.incident_id} className={`border-b border-slate-100 dark:border-slate-800 ${toneClass}`}>
                <td className={`${td} sticky left-0 z-10 ${stickyBg} font-medium tabular-nums text-slate-500 dark:text-slate-400`}>
                  {row.n ?? '—'}
                </td>
                <td
                  className={`${td} sticky left-[70px] z-10 ${stickyBg} font-mono text-[12px] font-semibold tabular-nums text-slate-900 shadow-[4px_0_8px_-6px_rgba(15,23,42,0.12)] dark:text-slate-100 dark:shadow-[4px_0_8px_-6px_rgba(0,0,0,0.35)]`}
                >
                  {row.cid ?? '—'}
                </td>
                <td className={`${td} min-w-0 overflow-hidden font-medium text-slate-900 dark:text-slate-100`}>
                  <CellTruncate value={row.local_educativo} />
                </td>
                <td className={`${td} min-w-0 overflow-hidden font-mono text-[11px] text-slate-600 dark:text-slate-400`}>
                  <CellTruncate value={row.presentacion_nombre_prtg} />
                </td>
                <td className={`${td} whitespace-nowrap text-slate-800 dark:text-slate-200`} title="Inicio de caída reportado por PRTG">
                  <span className="inline-flex items-start gap-1.5">
                    <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
                    <span className="leading-tight">
                      <span className="block font-semibold">{outage.date}</span>
                      {outage.time ? (
                        <span className="block text-[11px] text-slate-500 dark:text-slate-400">{outage.time}</span>
                      ) : null}
                    </span>
                  </span>
                </td>
                <td className={td}>
                  {row.tipo ? (
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${techTypeBadgeClass(row.tipo)}`}
                    >
                      {row.tipo}
                    </span>
                  ) : (
                    '—'
                  )}
                </td>
                <td className={`${td} min-w-0 overflow-hidden text-slate-700 dark:text-slate-300`}>
                  <span className="line-clamp-2" title={row.detalle ?? undefined}>
                    {row.detalle?.trim() ? row.detalle : '—'}
                  </span>
                </td>
                <td className={`${td} font-semibold text-slate-800 dark:text-slate-200`}>{row.pext_pint ?? '—'}</td>
                <td className={`${td} whitespace-nowrap text-slate-700 dark:text-slate-300`}>{row.provincia ?? '—'}</td>
                <td className={`${td} whitespace-nowrap text-slate-700 dark:text-slate-300`}>{row.distrito ?? '—'}</td>
                <td className={`${td} whitespace-nowrap font-mono text-[12px] text-slate-600 dark:text-slate-400`}>
                  {row.codigo_local ?? '—'}
                </td>
                {showClassification || showAction ? (
                  <td
                    className={`${td} sticky right-0 z-10 ${stickyBg} shadow-[-8px_0_8px_-8px_rgba(15,23,42,0.14)] dark:shadow-[-8px_0_8px_-8px_rgba(0,0,0,0.35)]`}
                  >
                    <div className="flex flex-col gap-1">
                      {showClassification ? (
                        <span
                          className={`inline-flex w-fit rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            CLASSIFICATION_BADGE_CLASS[colorKey] ?? CLASSIFICATION_BADGE_CLASS.slate
                          }`}
                        >
                          {row.management_classification_label ?? '—'}
                        </span>
                      ) : null}
                      {showAction && onManage ? (
                        <button
                          type="button"
                          className="text-left text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400"
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
    </DataTableContainer>
  )
}
