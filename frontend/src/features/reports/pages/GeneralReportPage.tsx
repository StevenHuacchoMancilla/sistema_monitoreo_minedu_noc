import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Download, FileSpreadsheet, RefreshCw } from 'lucide-react'
import { AppLayout } from '../../../layouts/AppLayout'
import { PageHeader } from '../../../components/ui/PageHeader'
import { FilterCard } from '../../../components/ui/FilterCard'
import { FormField, Input, SearchField, Select } from '../../../components/ui/FormControls'
import { Button } from '../../../components/ui/Button'
import { Badge } from '../../../components/ui/SoftBadge'
import { EmptyState, ErrorState, LoadingState } from '../../../components/ui/States'
import { DataTableContainer } from '../../../components/ui/DataTableFrame'
import { DateRangeFields } from '../../../components/ui/DateRangeFields'
import { PrtgLocationFilterFields } from '../../locations/components/PrtgLocationFilterFields'
import { endpoints } from '../../../api/endpoints'
import { API_URL, ApiError } from '../../../api/client'
import { todayLimaKey, shiftDateKey } from '../../../lib/datetime'
import { usePermissions } from '../../auth/hooks/usePermissions'
import { P } from '../../auth/permissions'
import type { GeneralReportPeriod, GeneralReportRow } from '../types/generalReport'

function toQuery(params: Record<string, string | number | undefined | null>): string {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== '') q.set(k, String(v))
  }
  const s = q.toString()
  return s ? `?${s}` : ''
}

async function downloadGeneralXlsx(params: Record<string, string | undefined>): Promise<void> {
  const response = await fetch(`${API_URL}/reports/general.xlsx${toQuery(params)}`, {
    method: 'GET',
    credentials: 'include',
    headers: {
      Accept: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'X-Requested-With': 'XMLHttpRequest',
    },
  })
  if (!response.ok) {
    let message = `API ${response.status}`
    try {
      const body = await response.json()
      if (body && typeof body.message === 'string') message = body.message
    } catch {
      /* ignore */
    }
    throw new ApiError(response.status, message)
  }
  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `reporte_general_${new Date().toISOString().slice(0, 10)}.xlsx`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export function GeneralReportPage() {
  const { can } = usePermissions()
  const canExport = can(P.reportsExport)

  const [period, setPeriod] = useState<GeneralReportPeriod>('today')
  const [day, setDay] = useState(todayLimaKey())
  const [from, setFrom] = useState(shiftDateKey(todayLimaKey(), -7))
  const [to, setTo] = useState(todayLimaKey())
  const [search, setSearch] = useState('')
  const [provincia, setProvincia] = useState('')
  const [distrito, setDistrito] = useState('')
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  const queryParams = useMemo(() => {
    const base: Record<string, string | undefined> = {
      period,
      search: search.trim() || undefined,
      provincia: provincia || undefined,
      distrito: distrito || undefined,
    }
    if (period === 'day') base.day = day
    if (period === 'range') {
      base.from = from
      base.to = to
    }
    return base
  }, [period, day, from, to, search, provincia, distrito])

  const report = useQuery({
    queryKey: ['reports', 'general', queryParams],
    queryFn: () => endpoints.generalReport(queryParams),
  })

  const onExport = async () => {
    setExportError(null)
    setExporting(true)
    try {
      await downloadGeneralXlsx(queryParams)
    } catch (e) {
      setExportError(e instanceof Error ? e.message : 'No se pudo exportar')
    } finally {
      setExporting(false)
    }
  }

  const columns = report.data?.columns ?? []
  const rows = report.data?.data ?? []

  return (
    <AppLayout bare onRefresh={() => void report.refetch()} syncing={report.isFetching}>
      <PageHeader
        icon={<FileSpreadsheet className="h-5 w-5" aria-hidden />}
        title="Reporte general"
        description="Todos los incidentes del período (activos y recuperados), con TIPO = letras CODIGO del Tracking."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={() => void report.refetch()} disabled={report.isFetching}>
              <RefreshCw className={`h-4 w-4 ${report.isFetching ? 'animate-spin' : ''}`} aria-hidden />
              Actualizar
            </Button>
            {canExport ? (
              <Button type="button" onClick={() => void onExport()} disabled={exporting || report.isLoading}>
                <Download className="h-4 w-4" aria-hidden />
                {exporting ? 'Exportando…' : 'Exportar XLSX'}
              </Button>
            ) : null}
          </div>
        }
      />

      <FilterCard
        title="Filtros del reporte"
        actions={
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setPeriod('today')
              setDay(todayLimaKey())
              setFrom(shiftDateKey(todayLimaKey(), -7))
              setTo(todayLimaKey())
              setSearch('')
              setProvincia('')
              setDistrito('')
            }}
          >
            Limpiar
          </Button>
        }
      >
        <FormField label="Período">
          <Select value={period} onChange={(e) => setPeriod(e.target.value as GeneralReportPeriod)}>
            <option value="today">Solo hoy</option>
            <option value="yesterday">Solo ayer</option>
            <option value="day">Un día específico</option>
            <option value="range">Rango de fechas</option>
            <option value="all">Todo el historial</option>
          </Select>
        </FormField>

        {period === 'day' ? (
          <FormField label="Día">
            <Input type="date" value={day} onChange={(e) => setDay(e.target.value)} />
          </FormField>
        ) : null}

        {period === 'range' ? (
          <DateRangeFields title="Rango" from={from} to={to} onFromChange={setFrom} onToChange={setTo} />
        ) : null}

        <SearchField
          label="Buscar"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="CID, colegio, código local…"
        />

        <PrtgLocationFilterFields
          province={provincia}
          district={distrito}
          onProvinceChange={(v) => {
            setProvincia(v)
            setDistrito('')
          }}
          onDistrictChange={setDistrito}
        />
      </FilterCard>

      {exportError ? <p className="mb-3 text-sm text-rose-600">{exportError}</p> : null}

      {report.isLoading ? <LoadingState /> : null}
      {report.isError ? (
        <ErrorState message={report.error instanceof Error ? report.error.message : 'No se pudo cargar'} />
      ) : null}

      {report.data ? (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Badge tone="info">{report.data.meta.period_label}</Badge>
            <Badge tone="neutral">
              {report.data.meta.returned.toLocaleString('es-PE')} / {report.data.meta.total.toLocaleString('es-PE')}{' '}
              incidente(s)
            </Badge>
            {report.data.meta.truncated ? (
              <Badge tone="warning">Resultado truncado (límite {report.data.meta.limit})</Badge>
            ) : null}
          </div>

          {rows.length === 0 ? (
            <EmptyState title="Sin incidentes" description="No hay caídas en el período seleccionado." />
          ) : (
            <GeneralReportTable columns={columns} rows={rows} />
          )}
        </>
      ) : null}
    </AppLayout>
  )
}

function GeneralReportTable({
  columns,
  rows,
}: {
  columns: Array<{ key: string; label: string }>
  rows: GeneralReportRow[]
}) {
  const th = 'whitespace-nowrap px-2.5 py-2 text-[10px] font-semibold uppercase tracking-wide text-white'
  const td = 'px-2.5 py-2 align-top text-xs text-slate-800 dark:text-slate-200'

  return (
    <DataTableContainer>
      <table className="w-full min-w-[1600px] border-collapse text-left">
        <thead className="sticky top-0 z-20 border-b border-blue-950/40 bg-blue-900">
          <tr>
            {columns.map((col) => (
              <th key={col.key} className={th}>
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.incident_id}
              className={`border-b border-slate-100 dark:border-slate-800 ${
                row.activa ? 'bg-white dark:bg-slate-900' : 'bg-emerald-50/70 dark:bg-emerald-950/25'
              }`}
            >
              {columns.map((col) => {
                const raw = row[col.key as keyof GeneralReportRow]
                const value = raw == null || raw === '' ? '—' : String(raw)
                const wrap = col.key === 'causa' || col.key === 'detalle' || col.key === 'local_educativo'
                return (
                  <td
                    key={`${row.incident_id}-${col.key}`}
                    className={[
                      td,
                      col.key === 'tipo' || col.key === 'cid' ? 'font-mono font-semibold tabular-nums' : '',
                      wrap ? 'max-w-[240px] whitespace-pre-wrap' : 'whitespace-nowrap',
                    ].join(' ')}
                  >
                    {value}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </DataTableContainer>
  )
}
