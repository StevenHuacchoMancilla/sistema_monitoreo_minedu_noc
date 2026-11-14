import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ImageDown, RefreshCw, TriangleAlert } from 'lucide-react'
import { DisenoApp } from '../../../layouts/DisenoApp'
import { EncabezadoPagina } from '../../../components/ui/EncabezadoPagina'
import { SectionCard } from '../../../components/ui/Tarjeta'
import { Boton } from '../../../components/ui/Boton'
import { Insignia } from '../../../components/ui/InsigniaSuave'
import {
  DataTableContainer,
  IsoDateTimeCell,
  tdDateClassName,
  Truncate,
  tableClassName,
  tdClassName,
  thClassName,
  theadClassName,
  trClassName,
} from '../../../components/ui/MarcoTablaDatos'
import { EmptyState, ErrorState, LoadingState } from '../../../components/ui/Estados'
import { formatDuration } from '../../../lib/fechaHora'
import { usePermisos } from '../../auth/hooks/usePermisos'
import { P } from '../../auth/permisos'
import { useCaidasRecientes } from '../hooks/useCaidasRecientes'
import { descargarCaidasPng } from '../lib/descargarCaidasPng'

const WINDOW_OPTIONS = [
  { value: 30, label: '30 min' },
  { value: 60, label: '1 h' },
  { value: 180, label: '3 h' },
  { value: 720, label: '12 h' },
] as const

export function PaginaFeedCaidas() {
  const { can } = usePermisos()
  const canHistory = can(P.historyView)
  const [minutes, setMinutes] = useState(60)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const query = useCaidasRecientes(minutes, 20_000, true)

  const rows = query.data?.data ?? []
  const recent = useMemo(() => rows.filter((row) => row.is_recent), [rows])

  const exportImage = async () => {
    const payload = recent.length > 0 ? recent : rows
    if (payload.length === 0) {
      setExportError('No hay caídas para exportar.')
      return
    }
    setExporting(true)
    setExportError(null)
    try {
      await descargarCaidasPng({ rows: payload, windowMinutes: minutes })
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'No se pudo exportar la imagen.')
    } finally {
      setExporting(false)
    }
  }

  return (
    <DisenoApp
      bare
      syncing={query.isFetching}
      onRefresh={() => {
        void query.refetch()
      }}
    >
      <EncabezadoPagina
        icon={<TriangleAlert className="h-5 w-5 text-red-500" aria-hidden />}
        title="Caídas"
        description="Quién cayó en la ventana. Caídas totales muestra el listado operativo completo. El aviso flotante muestra caídas y restablecimientos a la vez. Exportar imagen prioriza los Reciente."
        badges={
          <>
            <Insignia tone="danger">{rows.length} en ventana</Insignia>
            {recent.length > 0 ? <Insignia tone="warning">{recent.length} recientes</Insignia> : null}
          </>
        }
        actions={
          <>
            <div className="flex flex-wrap gap-1" role="group" aria-label="Ventana de tiempo">
              {WINDOW_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  aria-pressed={minutes === opt.value}
                  onClick={() => setMinutes(opt.value)}
                  className={`rounded-full px-3 py-1 text-[12px] font-semibold transition-colors ${
                    minutes === opt.value
                      ? 'bg-red-600 text-white shadow-sm dark:bg-red-500 dark:text-red-950'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <Boton
              size="sm"
              loading={exporting}
              disabled={rows.length === 0}
              title="Exporta los Reciente. Si no hay, exporta toda la ventana."
              onClick={() => void exportImage()}
            >
              <ImageDown className="h-3.5 w-3.5" aria-hidden />
              Exportar imagen
            </Boton>
            <Boton size="sm" variant="ghost" onClick={() => void query.refetch()} loading={query.isFetching}>
              <RefreshCw className="h-3.5 w-3.5" aria-hidden />
              Refrescar
            </Boton>
          </>
        }
      />

      {exportError ? (
        <p className="mb-3 text-sm text-red-600 dark:text-red-300">{exportError}</p>
      ) : null}

      <SectionCard
        title="Colegios caídos"
        action={
          <span className="text-xs font-semibold text-slate-500 tabular-nums dark:text-slate-400">
            {rows.length.toLocaleString('es-PE')} registros
          </span>
        }
      >
        {query.isLoading ? <LoadingState label="Cargando caídas…" /> : null}
        {query.isError ? (
          <ErrorState message={query.error instanceof Error ? query.error.message : 'Error'} />
        ) : null}
        {!query.isLoading && !query.isError && rows.length === 0 ? (
          <EmptyState
            title="Sin caídas en esta ventana"
            description="Cuando un colegio caiga en PRTG (rojo), aparecerá aquí y también como aviso flotante."
          />
        ) : null}

        {rows.length > 0 ? (
          <DataTableContainer>
            <table className={`${tableClassName} table-fixed`} style={{ minWidth: 980 }}>
              <colgroup>
                <col className="w-[5rem]" />
                <col className="w-[4.5rem]" />
                <col className="w-[16rem]" />
                <col className="w-[8rem]" />
                <col className="w-[5.5rem]" />
                <col className="w-[8rem]" />
                <col className="w-[5rem]" />
              </colgroup>
              <thead className={theadClassName}>
                <tr>
                  <th className={thClassName}>CID</th>
                  <th className={thClassName}>TSS</th>
                  <th className={thClassName}>Local</th>
                  <th className={thClassName}>Caída</th>
                  <th className={thClassName}>Duración</th>
                  <th className={thClassName}>Seguimiento</th>
                  <th className={`${thClassName} text-right`}>Acción</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.incident_id} className={trClassName}>
                    <td className={`${tdClassName} font-medium tabular-nums`}>{row.cid ?? '—'}</td>
                    <td className={`${tdClassName} tabular-nums`}>{row.tss ?? '—'}</td>
                    <td className={tdClassName}>
                      <Truncate title={row.local_educativo ?? undefined} className="font-medium">
                        {row.local_educativo ?? '—'}
                      </Truncate>
                      <span className="block truncate text-[11px] text-slate-500">
                        {[row.codigo_local, row.tecnologia, row.distrito].filter(Boolean).join(' · ') || '—'}
                      </span>
                    </td>
                    <td className={tdDateClassName}>
                      <IsoDateTimeCell value={row.started_at} dateClassName="text-red-700 dark:text-red-400" />
                      {row.is_recent ? (
                        <Insignia tone="warning" className="mt-0.5" title="Caído hace menos de 30 minutos">
                          Reciente
                        </Insignia>
                      ) : null}
                    </td>
                    <td className={`${tdClassName} tabular-nums`}>
                      {row.duration ?? formatDuration(row.duration_seconds)}
                    </td>
                    <td className={tdClassName}>
                      <span className="text-slate-500">{row.followup_label ?? '—'}</span>
                    </td>
                    <td className={`${tdClassName} text-right`}>
                      {canHistory ? (
                        <Link
                          to={row.href}
                          className="text-[12px] font-semibold text-red-700 hover:underline dark:text-red-300"
                        >
                          Ver
                        </Link>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DataTableContainer>
        ) : null}
      </SectionCard>
    </DisenoApp>
  )
}
