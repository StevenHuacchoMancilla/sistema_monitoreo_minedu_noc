import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft,
  Camera,
  CheckSquare,
  FileSpreadsheet,
  Network,
  Square,
  TriangleAlert,
} from 'lucide-react'
import { AppLayout } from '../../../layouts/AppLayout'
import { PageHeader } from '../../../components/ui/PageHeader'
import { MetricCard } from '../../../components/ui/MetricCard'
import { Button } from '../../../components/ui/Button'
import { Badge, FOLLOWUP_LABELS } from '../../../components/ui/Badge'
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
import { useMassOutageNodo } from '../../dashboard/hooks/useDashboard'
import { formatDuration } from '../../../lib/datetime'
import { useNow } from '../../../lib/useNow'
import type { ConcentrationZoneSchool } from '../../../types/api'
import { downloadMassOutagePng } from '../lib/downloadMassOutagePng'

const DOWN = new Set(['CAIDO', 'PARCIAL'])

const ESTADO_LABELS: Record<string, string> = {
  CAIDO: 'Caído',
  OPERATIVO: 'Operativo',
  PARCIAL: 'Enlace parcial',
  SIN_MONITOREO: 'Sin monitoreo',
}

function elapsed(value: string | null, now: number): string {
  if (!value) return '—'
  const start = new Date(value).getTime()
  if (Number.isNaN(start)) return '—'
  return formatDuration(Math.max(0, Math.floor((now - start) / 1000)))
}

export function MassOutageNodoPage() {
  const [params] = useSearchParams()
  const nodo = params.get('nodo') ?? ''
  const zone = useMassOutageNodo(nodo)
  const now = useNow(60_000)
  const [tech, setTech] = useState('')
  const [selected, setSelected] = useState<Set<number>>(() => new Set())
  const [imgBusy, setImgBusy] = useState(false)
  const [imgError, setImgError] = useState<string | null>(null)
  const [imgLimit, setImgLimit] = useState<number | 'all'>('all')

  const summary = zone.data?.zone
  const rows = zone.data?.data ?? []

  const downRows = rows

  const technologies = useMemo(
    () =>
      Array.from(
        new Set(downRows.map((row) => row.tecnologia).filter((value): value is string => Boolean(value))),
      ).sort(),
    [downRows],
  )

  const visible = useMemo(() => {
    return downRows.filter((row) => {
      if (tech && (row.tecnologia ?? '') !== tech) return false
      return true
    })
  }, [downRows, tech])

  // Selección inicial una sola vez por nodo (no resetear en cada refetch).
  const selectionSeeded = useRef(false)
  useEffect(() => {
    selectionSeeded.current = false
  }, [nodo])
  useEffect(() => {
    if (selectionSeeded.current || downRows.length === 0) return
    selectionSeeded.current = true
    setSelected(new Set(downRows.map((r) => r.assignment_id)))
  }, [downRows])

  const selectedDown = useMemo(
    () => downRows.filter((r) => selected.has(r.assignment_id)),
    [downRows, selected],
  )

  const exportRows = useMemo(() => {
    if (imgLimit === 'all') return selectedDown
    return selectedDown.slice(0, imgLimit)
  }, [selectedDown, imgLimit])

  const toggle = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectVisibleDown = () => {
    setSelected(new Set(visible.filter((r) => DOWN.has(r.estado)).map((r) => r.assignment_id)))
  }

  const clearSelection = () => setSelected(new Set())

  const onImage = async () => {
    setImgError(null)
    setImgBusy(true)
    try {
      await downloadMassOutagePng({
        nodo,
        rows: exportRows.map((r) => ({
          tss: r.tss,
          cid: r.cid,
          local_educativo: r.local_educativo,
          provincia: r.provincia,
          distrito: r.distrito,
          tecnologia: r.tecnologia,
          down_started_at: r.down_started_at,
          duration_label: elapsed(r.down_started_at, now),
        })),
      })
    } catch (e) {
      setImgError(e instanceof Error ? e.message : 'No se pudo generar la imagen')
    } finally {
      setImgBusy(false)
    }
  }

  return (
    <AppLayout
      title={summary?.label ?? (nodo || 'Nodo/POP')}
      subtitle="Colegios del mismo Nodo/POP."
      onRefresh={() => void zone.refetch()}
    >
      <PageHeader
        icon={<Network className="h-5 w-5" />}
        title={summary?.label ?? (nodo || 'Nodo/POP')}
        description="Caídos primero (más reciente arriba). Marca filas para la foto o ve a Vista Excel para exportar."
        breadcrumb={
          <Link to="/mass-outages" className="inline-flex items-center gap-1 text-sm font-medium text-noc-info hover:underline">
            <ArrowLeft className="h-3.5 w-3.5" />
            Caídas masivas
          </Link>
        }
        actions={
          <Link
            to={`/mass-outages/report?nodo=${encodeURIComponent(nodo)}`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <FileSpreadsheet className="h-4 w-4" aria-hidden />
            Vista Excel
          </Link>
        }
      />

      {nodo === '' ? (
        <EmptyState title="Nodo sin identificar" description="Vuelve a Caídas masivas y abre un Nodo/POP." />
      ) : null}

      {zone.isLoading ? <LoadingState /> : null}
      {zone.isError ? (
        <ErrorState message={zone.error instanceof Error ? zone.error.message : 'No se pudo cargar el nodo.'} />
      ) : null}

      {summary ? (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <MetricCard icon={<TriangleAlert className="h-4 w-4" />} label="Caídos" value={summary.caidos} tone="danger" />
            <MetricCard icon={<TriangleAlert className="h-4 w-4" />} label="Operativos" value={summary.operativos} tone="success" />
            <MetricCard icon={<TriangleAlert className="h-4 w-4" />} label="En el nodo" value={summary.total} />
            <MetricCard
              icon={<TriangleAlert className="h-4 w-4" />}
              label="Sin monitoreo"
              value={summary.sin_monitoreo}
              description={summary.parciales > 0 ? `${summary.parciales} con enlace parcial` : undefined}
            />
          </div>

          <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Foto de caídos</p>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Desmarca los que ya reportaste. Luego elige cuántas filas van en la imagen.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Filas en foto
                  <select
                    className="ml-2 h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                    value={imgLimit === 'all' ? 'all' : String(imgLimit)}
                    onChange={(e) => {
                      const v = e.target.value
                      setImgLimit(v === 'all' ? 'all' : Number(v))
                    }}
                  >
                    <option value="all">Todas seleccionadas ({selectedDown.length})</option>
                    {[5, 10, 15, 20, 25, 30].map((n) => (
                      <option key={n} value={n} disabled={n > selectedDown.length && selectedDown.length > 0}>
                        Primeras {n}
                      </option>
                    ))}
                  </select>
                </label>
                <Button size="sm" variant="secondary" onClick={selectVisibleDown}>
                  Seleccionar visibles
                </Button>
                <Button size="sm" variant="secondary" onClick={clearSelection}>
                  Limpiar
                </Button>
                <Button size="sm" loading={imgBusy} onClick={() => void onImage()} disabled={exportRows.length === 0}>
                  <Camera className="mr-1.5 h-4 w-4" aria-hidden />
                  Imagen ({exportRows.length})
                </Button>
              </div>
            </div>
            {imgError ? <p className="mt-2 text-sm text-red-600 dark:text-red-400">{imgError}</p> : null}
          </div>

          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-red-500/15 px-2.5 py-1 text-xs font-semibold text-red-700 ring-1 ring-red-500/20 dark:text-red-300">
              Caídos listados: {downRows.length}
            </span>
            <Button size="sm" variant={tech === '' ? 'primary' : 'secondary'} onClick={() => setTech('')}>
              Toda tecnología
            </Button>
            {technologies.map((name) => (
              <Button key={name} size="sm" variant={tech === name ? 'primary' : 'secondary'} onClick={() => setTech(name)}>
                {name}
              </Button>
            ))}
          </div>

          {visible.length === 0 ? (
            <EmptyState title="Sin colegios con ese filtro" description="Prueba otra tecnología o muestra todos." />
          ) : (
            <DataTableContainer>
              <table className={`${tableClassName} min-w-[980px]`}>
                <thead className={theadClassName}>
                  <tr>
                    <th className={`${thClassName} w-10`}>Sel.</th>
                    <th className={thClassName}>Colegio</th>
                    <th className={thClassName}>CID</th>
                    <th className={thClassName}>TSS</th>
                    <th className={thClassName}>Ubicación</th>
                    <th className={thClassName}>Tecnología</th>
                    <th className={thClassName}>Estado</th>
                    <th className={thClassName}>Se cayó</th>
                    <th className={thClassName}>Lleva</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((row) => (
                    <NodoRow
                      key={row.assignment_id}
                      row={row}
                      now={now}
                      checked={selected.has(row.assignment_id)}
                      onToggle={() => toggle(row.assignment_id)}
                    />
                  ))}
                </tbody>
              </table>
            </DataTableContainer>
          )}
        </>
      ) : null}
    </AppLayout>
  )
}

function NodoRow({
  row,
  now,
  checked,
  onToggle,
}: {
  row: ConcentrationZoneSchool
  now: number
  checked: boolean
  onToggle: () => void
}) {
  const down = DOWN.has(row.estado)
  const ubic = [row.provincia, row.distrito].filter(Boolean).join(' · ') || '—'

  return (
    <tr className={trClassName}>
      <td className={`${tdClassName} !align-middle`}>
        {down ? (
          <button
            type="button"
            onClick={onToggle}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label={checked ? 'Quitar de selección' : 'Seleccionar'}
          >
            {checked ? (
              <CheckSquare className="h-4 w-4 text-blue-600 dark:text-blue-400" aria-hidden />
            ) : (
              <Square className="h-4 w-4" aria-hidden />
            )}
          </button>
        ) : (
          <span className="text-slate-300">—</span>
        )}
      </td>
      <td className="px-3 py-2.5 align-top">
        <Truncate title={row.local_educativo ?? undefined} className="font-medium text-slate-900 dark:text-slate-100">
          {row.local_educativo ?? 'Sin nombre'}
        </Truncate>
        <span className="mt-0.5 block text-[11px] text-slate-500 dark:text-slate-400">{row.codigo_local || '—'}</span>
      </td>
      <td className={`${tdClassName} whitespace-nowrap font-medium tabular-nums`}>{row.cid ?? '—'}</td>
      <td className={`${tdClassName} whitespace-nowrap font-semibold tabular-nums`}>{row.tss ?? '—'}</td>
      <td className={tdClassName}>
        <Truncate title={ubic}>{ubic}</Truncate>
      </td>
      <td className={`${tdClassName} whitespace-nowrap`}>
        {row.tecnologia ? (
          <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
            {row.tecnologia}
          </span>
        ) : (
          <span className="text-slate-400">—</span>
        )}
      </td>
      <td className={tdClassName}>
        <div className="flex flex-col items-start gap-1">
          <Badge value={row.estado} label={ESTADO_LABELS[row.estado] ?? row.estado} />
          {down && row.followup_status ? (
            <Badge value={row.followup_status} label={FOLLOWUP_LABELS[row.followup_status]} />
          ) : null}
        </div>
      </td>
      <td className={tdClassName}>
        {down ? <IsoDateTimeCell value={row.down_started_at} /> : <span className="text-slate-400">—</span>}
      </td>
      <td
        className={`${tdClassName} whitespace-nowrap tabular-nums font-medium ${down ? 'text-red-700 dark:text-red-300' : ''}`}
      >
        {down ? elapsed(row.down_started_at, now) : '—'}
      </td>
    </tr>
  )
}
