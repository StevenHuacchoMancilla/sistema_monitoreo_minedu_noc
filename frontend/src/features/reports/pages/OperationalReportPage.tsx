import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Clock3,
  Download,
  FileCheck2,
  FileSpreadsheet,
  ImageDown,
  MessageSquareText,
  RefreshCw,
  X,
} from 'lucide-react'
import { AppLayout } from '../../../layouts/AppLayout'
import { Button } from '../../../components/ui/Button'
import { EmptyState, ErrorState, LoadingState } from '../../../components/ui/States'
import { PageHeader } from '../../../components/ui/PageHeader'
import { FilterCard } from '../../../components/ui/FilterCard'
import { FormField, SearchField, Select } from '../../../components/ui/FormControls'
import { Badge } from '../../../components/ui/SoftBadge'
import { endpoints } from '../../../api/endpoints'
import { PrtgLocationFilterFields } from '../../locations/components/PrtgLocationFilterFields'
import { ReportDataTable } from '../components/ReportDataTable'
import { ResumenPrtgBoard } from '../components/ResumenPrtgBoard'
import { downloadFinalReportPng } from '../lib/downloadFinalReportPng'
import {
  LISTA_ESTADO_CARD,
  LISTA_ESTADO_OPTIONS,
  type ListaLleeEstado,
  type ReportRow,
} from '../types/operationalReport'

function parseTimeline(body: string): Array<{ at?: string; text: string }> {
  const lines = body
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean)
  return lines.map((line) => {
    const m = line.match(/^(\d{2}\/\d{2}\/\d{4}\s+\d{1,2}:\d{2})\s*[·\-–]\s*(.+)$/)
    if (m) return { at: m[1], text: m[2] }
    return { text: line }
  })
}

function limaToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function limaShift(days: number): string {
  const parts = limaToday().split('-').map(Number)
  const d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] + days))
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

type ViewTab = 'lista' | 'resumen'

function ReportLegend() {
  return (
    <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-9">
      {LISTA_ESTADO_OPTIONS.map((label) => {
        const style = LISTA_ESTADO_CARD[label]
        return (
          <div
            key={label}
            className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-[12px] font-semibold ${
              style?.text ?? 'text-slate-800 dark:text-slate-100'
            } ${style?.soft ?? ''}`}
          >
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${style?.dot ?? 'bg-slate-400'}`} />
            {label}
          </div>
        )
      })}
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
  const [day, setDay] = useState(limaToday)
  const [listaEstado, setListaEstado] = useState('')
  const [province, setProvince] = useState('')
  const [district, setDistrict] = useState('')
  const [zona, setZona] = useState('')
  const [search, setSearch] = useState('')
  const [showClosing, setShowClosing] = useState(false)
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(25)
  const [listaEstadoSavingId, setListaEstadoSavingId] = useState<number | null>(null)
  const [detalleSavingId, setDetalleSavingId] = useState<number | null>(null)
  const [detalleRow, setDetalleRow] = useState<ReportRow | null>(null)

  const reportKey = ['reports', 'operational', day, listaEstado, province, district, zona, search] as const

  const report = useQuery({
    queryKey: reportKey,
    queryFn: () =>
      endpoints.operationalReport({
        day,
        lista_estado: listaEstado || undefined,
        province: province || undefined,
        district: district || undefined,
        zona: zona || undefined,
        search: search || undefined,
        active_only: '1',
      }),
    refetchInterval: day === limaToday() ? 30_000 : false,
  })

  const pageRows = useMemo(() => {
    const rows = report.data?.rows ?? []
    const start = (page - 1) * perPage
    return rows.slice(start, start + perPage)
  }, [report.data, page, perPage])

  const lastPage = Math.max(1, Math.ceil((report.data?.total ?? 0) / perPage))
  const estados = report.data?.lista_estados ?? []
  const zonas = report.data?.zonas ?? []
  const availableDates = report.data?.available_dates?.length
    ? report.data.available_dates
    : [day]
  const isToday = report.data?.is_today ?? day === limaToday()

  const sortListaRows = <T extends { lista_estado?: string | null; caida?: string | null; cid?: string | null }>(
    rows: T[],
  ): T[] => {
    const rank = (value: string | null | undefined) => {
      const idx = LISTA_ESTADO_OPTIONS.indexOf(value as ListaLleeEstado)
      return idx >= 0 ? idx : LISTA_ESTADO_OPTIONS.length
    }
    return [...rows].sort((a, b) => {
      const byEstado = rank(a.lista_estado) - rank(b.lista_estado)
      if (byEstado !== 0) return byEstado
      const byCaida = String(a.caida ?? '').localeCompare(String(b.caida ?? ''))
      if (byCaida !== 0) return byCaida
      return String(a.cid ?? '').localeCompare(String(b.cid ?? ''))
    })
  }

  const patchRow = (incidentId: number, patch: Partial<(typeof pageRows)[number]>, resort = false) => {
    client.setQueryData(reportKey, (prev: typeof report.data) => {
      if (!prev) return prev
      const rows = prev.rows.map((row) => (row.incident_id === incidentId ? { ...row, ...patch } : row))
      return {
        ...prev,
        rows: resort ? sortListaRows(rows) : rows,
      }
    })
  }

  const saveListaEstado = async (incidentId: number, value: ListaLleeEstado | null) => {
    if (!isToday) return
    setListaEstadoSavingId(incidentId)
    try {
      const updated = await endpoints.updateListaEstado(incidentId, value)
      patchRow(
        incidentId,
        {
          lista_estado: updated.lista_estado,
          lista_estado_tone: updated.lista_estado_tone,
          lista_estado_group: updated.lista_estado_group,
        },
        true,
      )
    } finally {
      setListaEstadoSavingId(null)
    }
  }

  const saveDetalle = async (incidentId: number, value: string) => {
    if (!isToday) return
    setDetalleSavingId(incidentId)
    try {
      const updated = await endpoints.updateListaDetalle(incidentId, value || null)
      patchRow(incidentId, { detalle: updated.detalle })
    } finally {
      setDetalleSavingId(null)
    }
  }

  return (
    <AppLayout bare>
      <div className="min-w-0 space-y-6">
        <PageHeader
          icon={<FileSpreadsheet className="h-5 w-5" />}
          title="Lista para reporte"
          description="Lista de LLEE por día. ESTADO y DETALLE los completa el operador; Activo/Restablecido no salen al Excel. Días anteriores = historial."
          breadcrumb={
            <p className="text-xs font-medium text-slate-500">
              NOC Loreto <span className="text-slate-300">/</span> Lista para reporte
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
          <FormField label="Fecha de la lista" className="sm:col-span-2 xl:col-span-2">
            <div className="space-y-2">
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setDay(limaToday())
                    setPage(1)
                  }}
                  className={`rounded-lg px-2.5 py-1.5 text-[12px] font-semibold transition ${
                    day === limaToday()
                      ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                      : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300'
                  }`}
                >
                  Hoy
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDay(limaShift(-1))
                    setPage(1)
                  }}
                  className={`rounded-lg px-2.5 py-1.5 text-[12px] font-semibold transition ${
                    day === limaShift(-1)
                      ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                      : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300'
                  }`}
                >
                  Ayer
                </button>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Select
                  value={availableDates.includes(day) ? day : ''}
                  onChange={(e) => {
                    if (!e.target.value) return
                    setDay(e.target.value)
                    setPage(1)
                  }}
                  aria-label="Historial de días guardados"
                >
                  <option value="">Historial guardado…</option>
                  {availableDates.map((d) => (
                    <option key={d} value={d}>
                      {d === limaToday() ? `${d} · Hoy (trabajo)` : d}
                    </option>
                  ))}
                </Select>
                <input
                  type="date"
                  className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 shadow-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  value={day}
                  max={limaToday()}
                  onChange={(e) => {
                    if (!e.target.value) return
                    setDay(e.target.value)
                    setPage(1)
                  }}
                  aria-label="Elegir fecha"
                />
              </div>
              <p className="text-[11px] text-slate-500">
                Cada día guarda su propia lista. Hoy es editable; días anteriores son historial.
              </p>
            </div>
          </FormField>
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
                description="No hay filas para este día. Si es hoy, gestiona caídas y aparecerán aquí."
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
                        {report.data.total.toLocaleString('es-PE')} registros · día {day}
                        {isToday ? ' · editable' : ' · historial (solo lectura)'}
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
                  showAction
                  onVerDetalle={setDetalleRow}
                  editable={isToday}
                  onListaEstadoChange={isToday ? (id, value) => void saveListaEstado(id, value) : undefined}
                  listaEstadoSavingId={listaEstadoSavingId}
                  rowTone="lista"
                />

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

      </div>

      {detalleRow ? (
        <ListaDetallePanel
          row={detalleRow}
          editable={isToday}
          saving={detalleSavingId === detalleRow.incident_id}
          onClose={() => setDetalleRow(null)}
          onSave={async (text) => {
            await saveDetalle(detalleRow.incident_id, text)
            setDetalleRow((prev) => (prev ? { ...prev, detalle: text || null } : prev))
          }}
        />
      ) : null}
    </AppLayout>
  )
}

function ListaDetallePanel({
  row,
  editable,
  saving,
  onClose,
  onSave,
}: {
  row: ReportRow
  editable: boolean
  saving: boolean
  onClose: () => void
  onSave: (text: string) => Promise<void>
}) {
  const [draft, setDraft] = useState(row.detalle ?? '')
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    setDraft(row.detalle ?? '')
    setDirty(false)
  }, [row.incident_id, row.detalle])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const entries = parseTimeline(draft)

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end">
      <button type="button" className="absolute inset-0 bg-slate-950/55 backdrop-blur-[2px]" aria-label="Cerrar" onClick={onClose} />
      <aside className="relative flex h-full w-full max-w-md flex-col border-l border-slate-200 bg-slate-50 shadow-2xl dark:border-slate-700 dark:bg-slate-950 sm:max-w-lg">
        <header className="border-b border-slate-200 bg-white px-5 py-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <span className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-sky-100 px-2.5 py-1 text-[11px] font-bold text-sky-800 dark:bg-sky-500/20 dark:text-sky-200">
                <MessageSquareText className="h-3.5 w-3.5" aria-hidden />
                {editable ? 'Detalle (editable)' : 'Detalle (solo lectura)'}
              </span>
              <h2 className="truncate text-sm font-bold text-slate-900 dark:text-slate-50">
                CID {row.cid ?? '—'} · {row.local_educativo ?? '—'}
              </h2>
              <p className="mt-1 text-[12px] text-slate-500">
                {row.lista_estado ?? 'Sin estado'} · {row.provincia ?? '—'} / {row.distrito ?? '—'}
              </p>
            </div>
            <button
              type="button"
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800 dark:hover:text-slate-100"
              onClick={onClose}
              aria-label="Cerrar panel"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5">
          {editable ? (
            <div>
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Comentario del operador
              </label>
              <textarea
                className="min-h-[8rem] w-full resize-y rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-[13px] leading-relaxed text-slate-800 shadow-sm outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                value={draft}
                disabled={saving}
                placeholder={'Ej.\n08/11/2026 19:39 · Pendiente de revisar…'}
                onChange={(e) => {
                  setDraft(e.target.value)
                  setDirty(true)
                }}
              />
              <p className="mt-1.5 text-[11px] text-slate-500">
                Puedes escribir varias líneas con fecha y hora. Se guarda en la lista del día.
              </p>
            </div>
          ) : null}

          {entries.length > 0 ? (
            <ol className="relative space-y-0 border-l-2 border-sky-200 pl-5 dark:border-sky-900">
              {entries.map((entry, i) => (
                <li key={`${entry.at ?? ''}-${i}`} className="relative pb-4 last:pb-0">
                  <span className="absolute -left-[1.4rem] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-sky-500 dark:border-slate-950" />
                  {entry.at ? (
                    <p className="mb-1 inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      <Clock3 className="h-3 w-3" aria-hidden />
                      {entry.at}
                    </p>
                  ) : null}
                  <div className="rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-[13px] leading-relaxed text-slate-800 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                    {entry.text}
                  </div>
                </li>
              ))}
            </ol>
          ) : !editable ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white/70 px-6 py-10 text-center dark:border-slate-700 dark:bg-slate-900/50">
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Sin detalle</p>
              <p className="mt-1 text-[13px] text-slate-500">No hay comentarios guardados para este día.</p>
            </div>
          ) : null}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-slate-200 bg-white px-5 py-3 dark:border-slate-800 dark:bg-slate-900">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cerrar
          </Button>
          {editable ? (
            <Button
              type="button"
              disabled={saving || !dirty}
              loading={saving}
              onClick={() => void onSave(draft.trim()).then(() => setDirty(false))}
            >
              Guardar detalle
            </Button>
          ) : null}
        </footer>
      </aside>
    </div>,
    document.body,
  )
}
