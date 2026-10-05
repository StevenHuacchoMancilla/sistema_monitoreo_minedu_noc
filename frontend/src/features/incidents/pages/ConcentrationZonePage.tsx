import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowLeft, TriangleAlert } from 'lucide-react'
import { AppLayout } from '../../../layouts/AppLayout'
import { PageHeader } from '../../../components/ui/PageHeader'
import { MetricCard } from '../../../components/ui/MetricCard'
import { Button } from '../../../components/ui/Button'
import { Badge, FOLLOWUP_LABELS } from '../../../components/ui/Badge'
import { EmptyState, ErrorState, LoadingState } from '../../../components/ui/States'
import {
  DataTableContainer,
  IsoDateTimeCell,
  tableClassName,
  tdClassName,
  thClassName,
  theadClassName,
  trClassName,
} from '../../../components/ui/DataTableFrame'
import { useConcentrationZone, useManualSync } from '../../dashboard/hooks/useDashboard'
import { formatDuration } from '../../../lib/datetime'
import { useNow } from '../../../lib/useNow'
import type { ConcentrationZoneSchool } from '../../../types/api'

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

export function ConcentrationZonePage() {
  const [params] = useSearchParams()
  const provincia = params.get('provincia') ?? ''
  const distrito = params.get('distrito') ?? ''
  const zone = useConcentrationZone(provincia, distrito)
  const { prtg } = useManualSync()
  const now = useNow()
  const [scope, setScope] = useState<'todos' | 'caidos'>('todos')
  const [tech, setTech] = useState('')

  const summary = zone.data?.zone
  const rows = zone.data?.data ?? []
  const technologies = useMemo(
    () => Array.from(new Set(rows.map((row) => row.tecnologia).filter((value): value is string => Boolean(value)))).sort(),
    [rows],
  )
  const visible = useMemo(
    () =>
      rows.filter((row) => {
        if (scope === 'caidos' && !DOWN.has(row.estado)) return false
        if (tech && (row.tecnologia ?? '') !== tech) return false
        return true
      }),
    [rows, scope, tech],
  )
  const downCount = rows.filter((row) => row.estado === 'CAIDO').length

  return (
    <AppLayout
      title={summary?.label ?? 'Zona PRTG'}
      subtitle="Colegios de esta rama, según provincia y distrito de PRTG."
      syncing={prtg.isPending}
      onRefresh={() => void zone.refetch()}
      onSyncPrtg={() => prtg.mutate()}
    >
      <PageHeader
        icon={<TriangleAlert className="h-5 w-5" />}
        title={summary?.label ?? 'Zona PRTG'}
        description="Todos los colegios de esta zona en la rama que se monitorea. La hora es el inicio de esta caída en PRTG, no el historial anterior."
        breadcrumb={
          <Link to="/concentrations" className="inline-flex items-center gap-1 text-sm font-medium text-noc-info hover:underline">
            <ArrowLeft className="h-3.5 w-3.5" />
            Concentraciones
          </Link>
        }
      />

      {provincia === '' || distrito === '' ? (
        <EmptyState title="Zona sin identificar" description="Vuelve a concentraciones y abre una zona." />
      ) : null}

      {zone.isLoading ? <LoadingState /> : null}
      {zone.isError ? (
        <ErrorState message={zone.error instanceof Error ? zone.error.message : 'No se pudo cargar la zona.'} />
      ) : null}

      {summary ? (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <MetricCard icon={<TriangleAlert className="h-4 w-4" />} label="Caídos" value={summary.caidos} tone="danger" />
            <MetricCard icon={<TriangleAlert className="h-4 w-4" />} label="Operativos" value={summary.operativos} tone="success" />
            <MetricCard icon={<TriangleAlert className="h-4 w-4" />} label="En la zona" value={summary.total} />
            <MetricCard
              icon={<TriangleAlert className="h-4 w-4" />}
              label="Sin monitoreo"
              value={summary.sin_monitoreo}
              description={summary.parciales > 0 ? `${summary.parciales} con enlace parcial` : undefined}
            />
          </div>

          {summary.tecnologias.length > 0 ? (
            <p className="mb-4 text-sm text-slate-600 dark:text-slate-300">
              Caídos por tecnología:{' '}
              {summary.tecnologias
                .filter((item) => item.caidos > 0)
                .map((item) => `${item.tecnologia} ${item.caidos}`)
                .join(' · ') || 'ninguno'}
            </p>
          ) : null}

          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Button size="sm" variant={scope === 'todos' ? 'primary' : 'secondary'} onClick={() => setScope('todos')}>
              Todos ({rows.length})
            </Button>
            <Button size="sm" variant={scope === 'caidos' ? 'primary' : 'secondary'} onClick={() => setScope('caidos')}>
              Solo caídos ({downCount})
            </Button>
            <Button size="sm" variant={tech === '' ? 'primary' : 'secondary'} onClick={() => setTech('')}>
              Toda tecnología
            </Button>
            {technologies.map((name) => (
              <Button
                key={name}
                size="sm"
                variant={tech === name ? 'primary' : 'secondary'}
                onClick={() => setTech(name)}
              >
                {name}
              </Button>
            ))}
          </div>

          {visible.length === 0 ? (
            <EmptyState title="Sin colegios con ese filtro" description="Prueba otra tecnología o muestra todos." />
          ) : (
            <DataTableContainer>
              <table className={`${tableClassName} min-w-[760px]`}>
                <thead className={theadClassName}>
                  <tr>
                    <th className={thClassName}>Colegio</th>
                    <th className={thClassName}>CID</th>
                    <th className={thClassName}>Tecnología</th>
                    <th className={thClassName}>Estado</th>
                    <th className={thClassName}>Se cayó</th>
                    <th className={thClassName}>Lleva</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((row) => (
                    <ZoneRow key={row.assignment_id} row={row} now={now} />
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

function ZoneRow({ row, now }: { row: ConcentrationZoneSchool; now: number }) {
  const down = DOWN.has(row.estado)
  return (
    <tr className={trClassName}>
      <td className="px-3 py-2.5 align-top">
        <span className="block text-[13px] font-medium leading-snug text-slate-900 dark:text-slate-100">
          {row.local_educativo ?? 'Sin nombre'}
        </span>
        <span className="mt-0.5 block text-[11px] text-slate-500">
          {[row.codigo_local, row.nodo_pop].filter(Boolean).join(' · ') || '—'}
        </span>
      </td>
      <td className={`${tdClassName} whitespace-nowrap font-medium tabular-nums`}>{row.cid ?? '—'}</td>
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
      <td className={`${tdClassName} whitespace-nowrap tabular-nums font-medium ${down ? 'text-red-700 dark:text-red-300' : ''}`}>
        {down ? elapsed(row.down_started_at, now) : '—'}
      </td>
    </tr>
  )
}
