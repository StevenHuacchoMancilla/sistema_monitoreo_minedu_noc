import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, FileCheck2, FileSpreadsheet, ImageDown, RefreshCw } from 'lucide-react'
import { AppLayout } from '../../../layouts/AppLayout'
import { Button } from '../../../components/ui/Button'
import { EmptyState, ErrorState, LoadingState } from '../../../components/ui/States'
import { PageHeader } from '../../../components/ui/PageHeader'
import { FilterCard } from '../../../components/ui/FilterCard'
import { FormField, SearchField, Select } from '../../../components/ui/FormControls'
import { Badge } from '../../../components/ui/SoftBadge'
import { endpoints } from '../../../api/endpoints'
import { IncidentManageModal } from '../../incidents/components/IncidentManageModal'
import { PrtgLocationFilterFields } from '../../locations/components/PrtgLocationFilterFields'
import { ReportDataTable } from '../components/ReportDataTable'
import { ResumenPrtgBoard } from '../components/ResumenPrtgBoard'
import { downloadFinalReportPng } from '../lib/downloadFinalReportPng'

type ViewTab = 'lista' | 'resumen'

function ReportLegend() {
  const items = [
    { color: 'bg-red-500', label: '✖ PRTG caído / parcial', soft: 'bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800' },
    { color: 'bg-emerald-500', label: '✔ PRTG operativo', soft: 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800' },
    { color: 'bg-amber-400', label: 'Energia (auto LE05/LE06…)', soft: 'bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800' },
    { color: 'bg-violet-500', label: 'Requerimiento (RM / razón MINEDU)', soft: 'bg-violet-50 border-violet-200 dark:bg-violet-950/30 dark:border-violet-800' },
  ]
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <div
          key={item.label}
          className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium text-slate-700 dark:text-slate-200 ${item.soft}`}
        >
          <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${item.color}`} />
          {item.label}
        </div>
      ))}
    </div>
  )
}

function ClosingPreviewPanel() {
  const preview = useQuery({
    queryKey: ['reports', 'closing-preview'],
    queryFn: endpoints.closingPreview,
  })
  const [exportingPng, setExportingPng] = useState(false)
  const [pngError, setPngError] = useState<string | null>(null)

  if (preview.isLoading) return <LoadingState />
  if (preview.isError) return <ErrorState message="No se pudo cargar la vista previa" />
  if (!preview.data) return null

  const onDownloadPng = async () => {
    setPngError(null)
    setExportingPng(true)
    try {
      await downloadFinalReportPng(preview.data.rows)
    } catch (err) {
      setPngError(err instanceof Error ? err.message : 'No se pudo generar la imagen.')
    } finally {
      setExportingPng(false)
    }
  }

  return (
    <section className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-start sm:justify-between dark:border-slate-800">
        <div className="flex items-start gap-3">
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-950/40">
            <FileCheck2 className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Informe final</h2>
            <p className="text-sm font-medium text-slate-500">
              Exportación del día · mismos datos automáticos de la lista.
            </p>
            <div className="mt-2">
              <Badge tone={preview.data.rows.some((row) => row.color_key === 'red') ? 'danger' : 'warning'}>
                {preview.data.total.toLocaleString('es-PE')} registro(s) a exportar
              </Badge>
            </div>
            {pngError ? <p className="mt-2 text-sm text-red-600">{pngError}</p> : null}
          </div>
        </div>
        {preview.data.total > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void onDownloadPng()}
              disabled={exportingPng}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
            >
              <ImageDown className="h-4 w-4" aria-hidden />
              {exportingPng ? 'Generando…' : 'Descargar imagen'}
            </button>
            <a
              href={endpoints.closingXlsxUrl()}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
            >
              <Download className="h-4 w-4" aria-hidden />
              Descargar XLSX
            </a>
          </div>
        ) : null}
      </div>

      {preview.data.total === 0 ? (
        <div className="px-6 py-12 text-center">
          <FileCheck2 className="mx-auto h-10 w-10 text-slate-300" />
          <p className="mt-3 text-base font-semibold text-slate-900 dark:text-slate-100">No hay registros listos para exportar.</p>
        </div>
      ) : (
        <div className="max-h-[28rem] overflow-y-auto">
          <ReportDataTable rows={preview.data.rows} dense />
        </div>
      )}
    </section>
  )
}

export function OperationalReportPage() {
  const client = useQueryClient()
  const [tab, setTab] = useState<ViewTab>('lista')
  const [listaEstado, setListaEstado] = useState('')
  const [province, setProvince] = useState('')
  const [district, setDistrict] = useState('')
  const [zona, setZona] = useState('')
  const [search, setSearch] = useState('')
  const [manageId, setManageId] = useState<number | null>(null)
  const [showClosing, setShowClosing] = useState(false)
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(25)

  const report = useQuery({
    queryKey: ['reports', 'operational', listaEstado, province, district, zona, search],
    queryFn: () =>
      endpoints.operationalReport({
        lista_estado: listaEstado || undefined,
        province: province || undefined,
        district: district || undefined,
        zona: zona || undefined,
        search: search || undefined,
        active_only: '1',
      }),
    refetchInterval: 30_000,
  })

  const pageRows = useMemo(() => {
    const rows = report.data?.rows ?? []
    const start = (page - 1) * perPage
    return rows.slice(start, start + perPage)
  }, [report.data, page, perPage])

  const lastPage = Math.max(1, Math.ceil((report.data?.total ?? 0) / perPage))
  const estados = report.data?.lista_estados ?? []
  const zonas = report.data?.zonas ?? []

  return (
    <AppLayout bare>
      <div className="min-w-0 space-y-6">
        <PageHeader
          icon={<FileSpreadsheet className="h-5 w-5" />}
          title="Vista de reporte"
          description="Lista de LLEE automática hasta ZONA. El ESTADO sale de la causa raíz, la razón MINEDU y el PRTG (ej. LE05 → Energia)."
          breadcrumb={
            <p className="text-xs font-medium text-slate-500">
              NOC Loreto <span className="text-slate-300">/</span> Vista de reporte
            </p>
          }
          actions={
            <>
              <Button type="button" onClick={() => void report.refetch()}>
                <RefreshCw className="h-4 w-4" />
                Refrescar
              </Button>
              <Button type="button" variant="primary" onClick={() => setShowClosing((v) => !v)}>
                {showClosing ? 'Ocultar informe final' : 'Vista previa del informe'}
              </Button>
            </>
          }
        />

        <div className="inline-flex rounded-xl border border-slate-200 bg-slate-100 p-1 dark:border-slate-700 dark:bg-slate-950">
          {(
            [
              { key: 'lista' as const, label: 'Lista de LLEE' },
              { key: 'resumen' as const, label: 'Resumen PRTG' },
            ] as const
          ).map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setTab(item.key)}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                tab === item.key
                  ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <ReportLegend />

        <FilterCard>
          <FormField label="Estado (lista)">
            <Select
              value={listaEstado}
              onChange={(e) => {
                setListaEstado(e.target.value)
                setPage(1)
              }}
            >
              <option value="">Todos</option>
              {estados.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
              {estados.length === 0 ? (
                <>
                  <option value="Averias">Averias</option>
                  <option value="Descartes en curso">Descartes en curso</option>
                  <option value="Sin respuesta">Sin respuesta</option>
                  <option value="Equipos apagados">Equipos apagados</option>
                  <option value="Energia">Energia</option>
                  <option value="Restablecido">Restablecido</option>
                  <option value="Requerimiento">Requerimiento</option>
                  <option value="Enlace parcial">Enlace parcial</option>
                </>
              ) : null}
            </Select>
          </FormField>
          <PrtgLocationFilterFields
            province={province}
            district={district}
            onProvinceChange={(value) => {
              setProvince(value)
              setPage(1)
            }}
            onDistrictChange={(value) => {
              setDistrict(value)
              setPage(1)
            }}
          />
          <FormField label="Zona">
            <Select
              value={zona}
              onChange={(e) => {
                setZona(e.target.value)
                setPage(1)
              }}
            >
              <option value="">TODAS</option>
              {zonas.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
              {zonas.length === 0 ? (
                <>
                  <option value="IQUITOS">IQUITOS</option>
                  <option value="YURIMAGUAS">YURIMAGUAS</option>
                  <option value="PUCALLPA">PUCALLPA</option>
                </>
              ) : null}
            </Select>
          </FormField>
          <SearchField
            className="min-w-0 sm:col-span-2 xl:col-span-1"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
            placeholder="CID, local, código…"
          />
        </FilterCard>

        {showClosing ? <ClosingPreviewPanel /> : null}

        {report.isLoading ? <LoadingState /> : null}
        {report.isError ? <ErrorState message="Error cargando vista de reporte" /> : null}

        {tab === 'resumen' && report.data?.resumen_prtg ? (
          <ResumenPrtgBoard
            data={report.data.resumen_prtg}
            zonas={zonas}
            selectedZona={zona}
            onZonaChange={(value) => {
              setZona(value)
              setPage(1)
            }}
            onSelectEstado={(estado) => {
              setListaEstado(estado)
              setTab('lista')
              setPage(1)
            }}
          />
        ) : null}

        {tab === 'lista' ? (
          <>
            {report.data && report.data.rows.length === 0 ? (
              <EmptyState
                title="Sin filas en la lista"
                description="Gestioná una caída (razón MINEDU + causa raíz) y aparecerá aquí con ESTADO automático."
              />
            ) : null}

            {report.data && report.data.rows.length > 0 ? (
              <section className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
                  <div className="flex items-start gap-3">
                    <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/40">
                      <FileSpreadsheet className="h-5 w-5" aria-hidden />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Lista de LLEE</h2>
                      <p className="text-sm font-medium text-slate-500">
                        {report.data.total.toLocaleString('es-PE')} registros · datos desde gestión de cada caída
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Select
                      className="h-9 w-[5.5rem]"
                      value={String(perPage)}
                      onChange={(e) => {
                        setPerPage(Number(e.target.value))
                        setPage(1)
                      }}
                    >
                      <option value="25">25</option>
                      <option value="50">50</option>
                      <option value="100">100</option>
                    </Select>
                    <Button type="button" size="sm" onClick={() => void report.refetch()}>
                      <RefreshCw className="h-3.5 w-3.5" />
                      Refrescar
                    </Button>
                  </div>
                </div>

                <ReportDataTable rows={pageRows} showAction onManage={setManageId} rowTone="lista" />

                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-3 dark:border-slate-800">
                  <p className="text-sm text-slate-500">
                    Página {page} / {lastPage}
                  </p>
                  <div className="flex gap-2">
                    <Button type="button" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                      Anterior
                    </Button>
                    <Button type="button" size="sm" disabled={page >= lastPage} onClick={() => setPage((p) => p + 1)}>
                      Siguiente
                    </Button>
                  </div>
                </div>
              </section>
            ) : null}
          </>
        ) : null}

        {manageId != null ? (
          <IncidentManageModal
            incidentId={manageId}
            onClose={() => {
              setManageId(null)
              void client.invalidateQueries({ queryKey: ['reports'] })
              void client.invalidateQueries({ queryKey: ['dashboard'] })
            }}
          />
        ) : null}
      </div>
    </AppLayout>
  )
}
