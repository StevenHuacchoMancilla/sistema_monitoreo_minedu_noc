import { Clock, MessageSquareText } from 'lucide-react'
import { DataTableContainer } from '../../../components/ui/DataTableFrame'
import {
  CLASSIFICATION_ROW_CLASS,
  LISTA_ESTADO_BADGE,
  LISTA_ESTADO_OPTIONS,
  formatOutageDisplay,
  type ListaLleeEstado,
  type ReportRow,
} from '../types/operationalReport'

type Props = {
  rows: ReportRow[]
  showAction?: boolean
  /** Abre panel Ver detalle (lectura / edición). */
  onVerDetalle?: (row: ReportRow) => void
  /** Si viene, la columna ESTADO es lista desplegable editable. */
  onListaEstadoChange?: (incidentId: number, value: ListaLleeEstado | null) => void
  listaEstadoSavingId?: number | null
  editable?: boolean
  dense?: boolean
  rowTone?: 'lista' | 'closing' | 'none'
}

const ROW_DARK_CLASS: Record<string, string> = {
  yellow: 'dark:bg-yellow-950/45 dark:border-yellow-500',
  red: 'dark:bg-red-950/50 dark:border-red-500',
  orange: 'dark:bg-orange-950/45 dark:border-orange-500',
  amber: 'dark:bg-amber-950/45 dark:border-amber-500',
  blue: 'dark:bg-blue-950/35 dark:border-blue-600',
  violet: 'dark:bg-violet-950/40 dark:border-violet-500',
  cyan: 'dark:bg-cyan-950/40 dark:border-cyan-500',
  green: 'dark:bg-emerald-950/40 dark:border-emerald-500',
  slate: 'dark:bg-slate-800/80 dark:border-slate-600',
  stone: 'dark:bg-stone-900/70 dark:border-stone-500',
  white: 'dark:bg-slate-900 dark:border-slate-600',
}

function CellTruncate({ value, className = '' }: { value?: string | null; className?: string }) {
  const text = value?.trim() ? value : '—'
  return (
    <span className={`block truncate ${className}`} title={text === '—' ? undefined : text}>
      {text}
    </span>
  )
}

/** Columnas LISTA DE LLEE: TSS → ZONA (sin PEXT/PINT). */
function previewDetalle(value?: string | null, max = 72): string {
  const clean = (value ?? '').replace(/\s+/g, ' ').trim()
  if (!clean) return '—'
  if (clean.length <= max) return clean
  return `${clean.slice(0, max).trim()}…`
}

export function ReportDataTable({
  rows,
  showAction = false,
  onVerDetalle,
  onListaEstadoChange,
  listaEstadoSavingId = null,
  editable = false,
  dense = false,
  rowTone = 'lista',
}: Props) {
  const th = dense
    ? 'whitespace-nowrap px-2.5 py-2 text-[10px] font-semibold uppercase tracking-wide'
    : 'whitespace-nowrap px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide'
  const td = dense ? 'px-2.5 py-2 align-top text-xs' : 'px-3 py-2.5 align-top text-[13px]'

  return (
    <DataTableContainer>
      <table className="w-full min-w-[1480px] border-collapse text-left text-slate-800 dark:text-slate-200">
        <thead className="sticky top-0 z-20 border-b border-slate-700 bg-slate-800 text-white dark:border-slate-700 dark:bg-slate-950">
          <tr>
            <th className={`${th} w-16`}>TSS</th>
            <th className={`${th} w-28`}>CID</th>
            <th className={`${th} min-w-[200px]`}>Local educativo</th>
            <th className={`${th} min-w-[240px]`}>Presentación PRTG</th>
            <th className={`${th} w-24`}>Estado PRTG</th>
            <th className={`${th} min-w-[140px]`}>Estado</th>
            <th className={`${th} w-20`}>Código</th>
            <th className={`${th} min-w-[180px]`}>Causa raíz</th>
            <th className={`${th} min-w-[120px]`}>Caída</th>
            <th className={`${th} min-w-[260px]`}>Detalle</th>
            <th className={`${th} min-w-[130px]`}>Provincia</th>
            <th className={`${th} min-w-[130px]`}>Distrito</th>
            <th className={`${th} w-28`}>Zona</th>
            {showAction ? <th className={`${th} min-w-[120px]`}>Acciones</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const outage = formatOutageDisplay(row)
            const toneKey = row.lista_estado_tone || row.color_key || 'slate'
            const toneClass =
              rowTone === 'none'
                ? 'bg-white dark:bg-slate-900'
                : `${CLASSIFICATION_ROW_CLASS[toneKey] ?? CLASSIFICATION_ROW_CLASS.slate} ${ROW_DARK_CLASS[toneKey] ?? ROW_DARK_CLASS.slate}`
            const prtgUp = row.estado_prtg === '✔'

            return (
              <tr key={row.incident_id} className={`border-b border-slate-100 dark:border-slate-800 ${toneClass}`}>
                <td className={`${td} font-medium tabular-nums text-slate-500 dark:text-slate-400`}>
                  {row.n ?? '—'}
                </td>
                <td className={`${td} font-mono text-[12px] font-semibold tabular-nums text-slate-900 dark:text-slate-100`}>
                  {row.cid ?? '—'}
                </td>
                <td className={`${td} min-w-0 overflow-hidden font-medium text-slate-900 dark:text-slate-100`}>
                  <CellTruncate value={row.local_educativo} />
                </td>
                <td className={`${td} min-w-0 overflow-hidden font-mono text-[11px] text-slate-600 dark:text-slate-400`}>
                  <CellTruncate value={row.presentacion_nombre_prtg} />
                </td>
                <td className={td}>
                  <span
                    className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold ${
                      prtgUp
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300'
                        : 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300'
                    }`}
                    title={prtgUp ? 'PRTG operativo' : 'PRTG caído / parcial'}
                  >
                    {row.estado_prtg ?? '—'}
                  </span>
                </td>
                <td className={td}>
                  {onListaEstadoChange ? (
                    <select
                      className={`h-8 max-w-[11.5rem] rounded-md border border-slate-300 bg-white px-1.5 text-[11px] font-semibold shadow-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-950 ${
                        row.lista_estado
                          ? LISTA_ESTADO_BADGE[row.lista_estado] ?? ''
                          : 'text-slate-500'
                      }`}
                      value={row.lista_estado ?? ''}
                      disabled={listaEstadoSavingId === row.incident_id}
                      aria-label={`Estado lista LLEE CID ${row.cid ?? row.incident_id}`}
                      onChange={(e) => {
                        const next = e.target.value
                        onListaEstadoChange(
                          row.incident_id,
                          next === '' ? null : (next as ListaLleeEstado),
                        )
                      }}
                    >
                      <option value="">— Elegir —</option>
                      {LISTA_ESTADO_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  ) : row.lista_estado ? (
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        LISTA_ESTADO_BADGE[row.lista_estado] ?? LISTA_ESTADO_BADGE.Activo
                      }`}
                    >
                      {row.lista_estado}
                    </span>
                  ) : (
                    '—'
                  )}
                </td>
                <td className={`${td} font-mono text-[12px] font-semibold text-slate-800 dark:text-slate-200`}>
                  {row.root_cause_code ?? '—'}
                </td>
                <td className={`${td} min-w-0 text-slate-700 dark:text-slate-300`}>
                  <CellTruncate value={row.root_cause} />
                </td>
                <td className={`${td} whitespace-nowrap text-slate-800 dark:text-slate-200`} title="Inicio de caída">
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
                <td
                  className={`${td} max-w-[220px] text-slate-700 dark:text-slate-300`}
                  title={row.detalle?.trim() ? row.detalle : undefined}
                >
                  <span className="line-clamp-2 whitespace-pre-wrap break-words text-[12px] leading-snug">
                    {previewDetalle(row.detalle)}
                  </span>
                </td>
                <td className={`${td} whitespace-nowrap text-slate-700 dark:text-slate-300`}>{row.provincia ?? '—'}</td>
                <td className={`${td} whitespace-nowrap text-slate-700 dark:text-slate-300`}>{row.distrito ?? '—'}</td>
                <td className={`${td} whitespace-nowrap font-semibold text-slate-700 dark:text-slate-300`}>
                  {row.zona ?? '—'}
                </td>
                {showAction ? (
                  <td className={td}>
                    {onVerDetalle ? (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-[11px] font-semibold text-sky-800 transition hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-950/50 dark:text-sky-200 dark:hover:bg-sky-950"
                        onClick={() => onVerDetalle(row)}
                      >
                        <MessageSquareText className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        {editable ? 'Ver / editar detalle' : 'Ver detalle'}
                      </button>
                    ) : null}
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
