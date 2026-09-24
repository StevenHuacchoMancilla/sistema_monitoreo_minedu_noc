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
import { downloadFinalReportPng } from '../lib/downloadFinalReportPng'

function ReportLegend() {
  const items = [
    { color: 'bg-amber-400', label: 'Amarillo — Nueva caída', soft: 'bg-amber-50 border-amber-200' },
    { color: 'bg-red-500', label: 'Rojo — Contacto confirmado', soft: 'bg-red-50 border-red-200' },
    { color: 'bg-orange-500', label: 'Naranja — Sin respuesta', soft: 'bg-orange-50 border-orange-200' },
    { color: 'bg-blue-500', label: 'Azul — Queja / reclamo', soft: 'bg-blue-50 border-blue-200' },
  ]
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <div
          key={item.label}
          className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium text-slate-700 ${item.soft}`}
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
    <section className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-red-50 text-red-600">
            <FileCheck2 className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Informe final</h2>
            <p className="text-sm font-medium text-slate-500">
              Solo incidencias activas con contacto confirmado.
            </p>
            <div className="mt-2">
              <Badge tone="danger">{preview.data.total.toLocaleString('es-PE')} registro(s) a exportar</Badge>
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
          <p className="mt-3 text-base font-semibold text-slate-900">No hay registros listos para exportar.</p>
          <p className="mt-1 text-sm text-slate-500">
            Las incidencias con contacto confirmado aparecerán aquí.
          </p>
        </div>
      ) : (
        <div className="max-h-[28rem] overflow-y-auto">
          <ReportDataTable rows={preview.data.rows} rowTone="closing" dense />
        </div>
      )}
    </section>
  )
}

export function OperationalReportPage() {
  const client = useQueryClient()
  const [classification, setClassification] = useState('')
  const [province, setProvince] = useState('')
  const [district, setDistrict] = useState('')
  const [scope, setScope] = useState('')
  const [technology, setTechnology] = useState('')
  const [search, setSearch] = useState('')
  const [manageId, setManageId] = useState<number | null>(null)
  const [showClosing, setShowClosing] = useState(false)
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(25)

  const report = useQuery({
    queryKey: ['reports', 'operational', classification, province, district, scope, technology, search],
    queryFn: () =>
      endpoints.operationalReport({
        classification: classification || undefined,
        province: province || undefined,
        district: district || undefined,
        scope: scope || undefined,
        technology: technology || undefined,
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

  return (
    <AppLayout bare>
      <div className="min-w-0 space-y-6">
        <PageHeader
          icon={<FileSpreadsheet className="h-5 w-5" />}
          title="Vista de reporte"
          description="Vista consolidada de incidencias y gestión de contacto."
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

        <ReportLegend />

        <FilterCard>
          <FormField label="Clasificación">
            <Select
              value={classification}
              onChange={(e) => {
                setClassification(e.target.value)
                setPage(1)
              }}
            >
              <option value="">Todos</option>
              <option value="NEW_OUTAGE">Nuevas</option>
              <option value="CONTACT_CONFIRMED">Contacto confirmado</option>
              <option value="NO_RESPONSE">Sin respuesta</option>
              <option value="COMPLAINT">Quejas</option>
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
          <FormField label="PEXT/PINT">
            <Select
              value={scope}
              onChange={(e) => {
                setScope(e.target.value)
                setPage(1)
              }}
            >
              <option value="">Todos</option>
              <option value="PEXT">PEXT</option>
              <option value="PINT">PINT</option>
            </Select>
          </FormField>
          <FormField label="Tipo">
            <Select
              value={technology}
              onChange={(e) => {
                setTechnology(e.target.value)
                setPage(1)
              }}
            >
              <option value="">Todos</option>
              <option value="P2P">P2P</option>
              <option value="GPON">GPON</option>
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
        {report.data && report.data.rows.length === 0 ? (
          <EmptyState title="Sin filas" description="No hay incidencias activas con los filtros actuales." />
        ) : null}

        {report.data && report.data.rows.length > 0 ? (
          <section className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
              <div className="flex items-start gap-3">
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                  <FileSpreadsheet className="h-5 w-5" aria-hidden />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Reporte operativo</h2>
                  <p className="text-sm font-medium text-slate-500">
                    {report.data.total.toLocaleString('es-PE')} registros activos
                  </p>
                  <p className="text-xs text-slate-400">
                    Vista consolidada · CAÍDA desde PRTG · TIPO desde asignación de red
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

            <ReportDataTable
              rows={pageRows}
              showClassification
              showAction
              onManage={setManageId}
              rowTone="classification"
            />

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-3">
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
