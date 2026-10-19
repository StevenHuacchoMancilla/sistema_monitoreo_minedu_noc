import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Download, FileSpreadsheet, Trash2 } from 'lucide-react'
import { AppLayout } from '../../../layouts/AppLayout'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Button } from '../../../components/ui/Button'
import { EmptyState, ErrorState, LoadingState } from '../../../components/ui/States'
import {
  DataTableContainer,
  IsoDateTimeCell,
  Truncate,
  tableClassName,
  tdClassName,
  thClassName,
  theadClassName,
  trClassName,
} from '../../../components/ui/DataTableFrame'
import { useMassOutageNodo, useMassOutages } from '../../dashboard/hooks/useDashboard'
import { formatDuration } from '../../../lib/datetime'
import { useNow } from '../../../lib/useNow'
import type { ConcentrationZoneSchool } from '../../../types/api'
import { downloadMassOutageCsv } from '../lib/massOutageExcel'
import { FormField, Select } from '../../../components/ui/FormControls'

const DOWN = new Set(['CAIDO', 'PARCIAL'])

/**
 * Vista Excel de caídas masivas: eliges Nodo/POP, quitas filas ya reportadas y exportas CSV (Excel).
 */
export function MassOutagesReportPage() {
  const [params, setParams] = useSearchParams()
  const nodoParam = params.get('nodo') ?? ''
  const mass = useMassOutages()
  const nodos = useMemo(() => (mass.data?.data ?? []).map((n) => n.nodo_pop || n.label).filter(Boolean), [mass.data])
  const [nodo, setNodo] = useState(nodoParam)
  const zone = useMassOutageNodo(nodo)
  const now = useNow(60_000)
  const [rows, setRows] = useState<ConcentrationZoneSchool[]>([])
  const seeded = useRef<string | null>(null)
  const [downloadError, setDownloadError] = useState<string | null>(null)

  useEffect(() => {
    if (nodoParam && nodoParam !== nodo) setNodo(nodoParam)
  }, [nodoParam, nodo])

  useEffect(() => {
    const data = zone.data?.data
    if (!data || !nodo) return
    if (seeded.current === nodo) return
    seeded.current = nodo
    setRows(data.filter((r) => DOWN.has(r.estado)))
  }, [zone.data, nodo])

  const onChangeNodo = (value: string) => {
    seeded.current = null
    setNodo(value)
    setParams(value ? { nodo: value } : {})
  }

  const removeRow = (assignmentId: number) => {
    setRows((prev) => prev.filter((r) => r.assignment_id !== assignmentId))
  }

  const resetRows = () => {
    seeded.current = null
    const data = zone.data?.data ?? []
    setRows(data.filter((r) => DOWN.has(r.estado)))
    seeded.current = nodo
  }

  const onDownload = () => {
    setDownloadError(null)
    try {
      downloadMassOutageCsv(
        nodo,
        rows.map((r) => ({
          ...r,
          duration_label: r.down_started_at
            ? formatDuration(Math.max(0, Math.floor((now - Date.parse(r.down_started_at)) / 1000)))
            : null,
        })),
      )
    } catch (e) {
      setDownloadError(e instanceof Error ? e.message : 'No se pudo exportar')
    }
  }

  return (
    <AppLayout bare onRefresh={() => void zone.refetch()}>
      <PageHeader
        icon={<FileSpreadsheet className="h-5 w-5" aria-hidden />}
        title="Caídas masivas · Vista Excel"
        description="Quita las filas que ya reportaste y descarga CSV (abre en Excel). Orden: caída más reciente primero."
        breadcrumb={
          <Link to="/mass-outages" className="inline-flex items-center gap-1 text-sm font-medium text-noc-info hover:underline">
            <ArrowLeft className="h-3.5 w-3.5" />
            Caídas masivas
          </Link>
        }
        actions={
          <>
            <Button variant="secondary" onClick={resetRows} disabled={!nodo || zone.isLoading}>
              Restaurar caídos
            </Button>
            <Button onClick={onDownload} disabled={rows.length === 0}>
              <Download className="mr-1.5 h-4 w-4" aria-hidden />
              Exportar CSV ({rows.length})
            </Button>
          </>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-[minmax(0,280px)_1fr]">
        <FormField label="Nodo/POP">
          <Select value={nodo} onChange={(e) => onChangeNodo(e.target.value)}>
            <option value="">— Elegir —</option>
            {nodos.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </Select>
        </FormField>
        <p className="self-end text-sm text-slate-500 dark:text-slate-400">
          {nodo
            ? `${rows.length} fila(s) en la exportación. Usa el basurero para eliminar del listado (no borra el ticket).`
            : 'Elige un Nodo/POP con caída masiva.'}
        </p>
      </div>

      {downloadError ? <p className="mb-3 text-sm text-red-600 dark:text-red-400">{downloadError}</p> : null}

      {!nodo ? <EmptyState title="Sin Nodo/POP" description="Selecciona uno para armar el Excel." /> : null}
      {nodo && zone.isLoading ? <LoadingState /> : null}
      {nodo && zone.isError ? (
        <ErrorState message={zone.error instanceof Error ? zone.error.message : 'Error'} />
      ) : null}

      {nodo && !zone.isLoading && rows.length === 0 ? (
        <EmptyState title="Sin filas" description="No quedan caídos en el listado (o el nodo no tiene caídas)." />
      ) : null}

      {rows.length > 0 ? (
        <DataTableContainer>
          <table className={`${tableClassName} min-w-[960px]`}>
            <thead className={theadClassName}>
              <tr>
                <th className={thClassName}>TSS</th>
                <th className={thClassName}>CID</th>
                <th className={thClassName}>Local</th>
                <th className={thClassName}>Ubicación</th>
                <th className={thClassName}>Tec.</th>
                <th className={thClassName}>Caída</th>
                <th className={thClassName}>Lleva</th>
                <th className={`${thClassName} text-right`}>Quitar</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const ubic = [row.provincia, row.distrito].filter(Boolean).join(' · ') || '—'
                const secs = row.down_started_at
                  ? Math.max(0, Math.floor((now - Date.parse(row.down_started_at)) / 1000))
                  : null
                return (
                  <tr key={row.assignment_id} className={trClassName}>
                    <td className={`${tdClassName} font-semibold tabular-nums`}>{row.tss ?? '—'}</td>
                    <td className={`${tdClassName} font-medium tabular-nums`}>{row.cid ?? '—'}</td>
                    <td className={tdClassName}>
                      <Truncate title={row.local_educativo ?? undefined}>{row.local_educativo ?? '—'}</Truncate>
                    </td>
                    <td className={tdClassName}>
                      <Truncate title={ubic}>{ubic}</Truncate>
                    </td>
                    <td className={`${tdClassName} whitespace-nowrap`}>{row.tecnologia ?? '—'}</td>
                    <td className={tdClassName}>
                      <IsoDateTimeCell value={row.down_started_at} />
                    </td>
                    <td className={`${tdClassName} tabular-nums font-medium text-red-700 dark:text-red-300`}>
                      {secs != null ? formatDuration(secs) : '—'}
                    </td>
                    <td className={`${tdClassName} text-right`}>
                      <button
                        type="button"
                        onClick={() => removeRow(row.assignment_id)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
                        title="Quitar de la exportación"
                        aria-label="Quitar fila"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </DataTableContainer>
      ) : null}
    </AppLayout>
  )
}
