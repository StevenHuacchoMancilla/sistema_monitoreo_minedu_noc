import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Download, Gauge, ImageDown } from 'lucide-react'
import { AppLayout } from '../../../layouts/AppLayout'
import { PageHeader } from '../../../components/ui/PageHeader'
import { SearchField } from '../../../components/ui/FormControls'
import { EmptyState, ErrorState, LoadingState } from '../../../components/ui/States'
import { DataTableContainer } from '../../../components/ui/DataTableFrame'
import { endpoints } from '../../../api/endpoints'
import { downloadInternetUsageTopPng } from '../lib/downloadInternetUsageTopPng'
import type { UsageTopRow } from '../components/InternetUsageTopImageTemplate'

function TopTable({
  title,
  accentClass,
  rows,
  showTecnologia = false,
  volumeMode = false,
}: {
  title: string
  accentClass: string
  rows: UsageTopRow[]
  showTecnologia?: boolean
  volumeMode?: boolean
}) {
  const headers = volumeMode
    ? showTecnologia
      ? ['#', 'CID', 'TSS', 'Local', 'Tecnología', 'Provincia', 'Consumo (MB)', 'Caídas', 'Estabilidad', 'PRTG']
      : ['#', 'CID', 'TSS', 'Local', 'Provincia', 'Consumo (MB)', 'Caídas', 'Estabilidad', 'PRTG']
    : showTecnologia
      ? ['#', 'CID', 'TSS', 'Local', 'Tecnología', 'Provincia', 'Consumo máx', 'TX máx', 'Caídas', 'Estabilidad', 'PRTG']
      : ['#', 'CID', 'TSS', 'Local', 'Provincia', 'Consumo máx', 'TX máx', 'Caídas', 'Estabilidad', 'PRTG']

  return (
    <div className="min-w-0 flex-1">
      <div className={`mb-2 inline-flex rounded-md px-2.5 py-1 text-xs font-bold tracking-wide uppercase ${accentClass}`}>
        {title}
      </div>
      <DataTableContainer>
        <table className="w-full min-w-[720px] border-collapse text-left text-sm">
          <thead className="bg-slate-800 text-xs tracking-wide text-white uppercase">
            <tr>
              {headers.map((h) => (
                <th key={h} className="px-3 py-2 font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={headers.length} className="px-3 py-4 text-slate-500">
                  Sin colegios con ámbito y consumo del periodo.
                </td>
              </tr>
            ) : (
              rows.map((row, idx) => (
                <tr key={String(row.assignment_id ?? row.cid ?? idx)} className="border-b border-slate-100 odd:bg-white even:bg-slate-50">
                  <td className="px-3 py-2 tabular-nums font-semibold">{row.rank ?? idx + 1}</td>
                  <td className="px-3 py-2 font-mono font-semibold">{row.cid ?? '—'}</td>
                  <td className="px-3 py-2 font-mono font-bold text-amber-800">{row.tss ?? '—'}</td>
                  <td className="px-3 py-2 font-medium">{row.local_educativo ?? '—'}</td>
                  {showTecnologia ? (
                    <td className="px-3 py-2 font-semibold text-slate-700">{row.tecnologia ?? '—'}</td>
                  ) : null}
                  <td className="px-3 py-2">{row.provincia ?? '—'}</td>
                  <td className="px-3 py-2 font-semibold text-cyan-800">
                    {row.consumo ?? row.consumo_max ?? '—'}
                  </td>
                  {!volumeMode ? <td className="px-3 py-2">{row.tx_max ?? '—'}</td> : null}
                  <td
                    className={`px-3 py-2 tabular-nums font-semibold ${
                      Number(row.caidas ?? 0) === 0 ? 'text-emerald-700' : 'text-amber-700'
                    }`}
                  >
                    {row.caidas ?? 0}
                  </td>
                  <td className="px-3 py-2 font-semibold text-emerald-800">{row.estabilidad ?? '—'}</td>
                  <td className="px-3 py-2">{row.prtg_status ?? '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </DataTableContainer>
    </div>
  )
}

export function InternetUsageReportPage() {
  const [search, setSearch] = useState('')
  const [applied, setApplied] = useState('')
  const [exporting, setExporting] = useState<'general' | 'caballococha' | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)
  const [exportErrorCaballo, setExportErrorCaballo] = useState<string | null>(null)
  const report = useQuery({
    queryKey: ['reports', 'usage', applied],
    queryFn: () => endpoints.usageReport(applied),
  })

  const top = report.data?.top
  const rural = (top?.rural ?? []) as UsageTopRow[]
  const urbano = (top?.urbano ?? []) as UsageTopRow[]
  const hasTop = rural.length > 0 || urbano.length > 0

  const topCaballo = report.data?.top_caballococha
  const ruralCaballo = (topCaballo?.rural ?? []) as UsageTopRow[]
  const urbanoCaballo = (topCaballo?.urbano ?? []) as UsageTopRow[]
  const hasCaballo = ruralCaballo.length > 0 || urbanoCaballo.length > 0

  async function handleExportImage() {
    if (!top || !hasTop) return
    setExportError(null)
    setExporting('general')
    try {
      await downloadInternetUsageTopPng({
        periodLabel: top.period_label,
        rural,
        urbano,
      })
    } catch (error) {
      setExportError(error instanceof Error ? error.message : 'No se pudo exportar la imagen.')
    } finally {
      setExporting(null)
    }
  }

  async function handleExportCaballo() {
    if (!topCaballo || !hasCaballo) return
    setExportErrorCaballo(null)
    setExporting('caballococha')
    try {
      await downloadInternetUsageTopPng({
        periodLabel: topCaballo.period_label,
        rural: ruralCaballo,
        urbano: urbanoCaballo,
        heading: 'NOC · Caballococha',
        subheading: 'Top 5 Rural · Top 5 Urbano · consumo volumen PRTG en MB (01/11 al día actual)',
        showTecnologia: true,
        volumeMode: true,
        filenamePrefix: 'uso_internet_caballococha_top',
      })
    } catch (error) {
      setExportErrorCaballo(error instanceof Error ? error.message : 'No se pudo exportar la imagen.')
    } finally {
      setExporting(null)
    }
  }

  return (
    <AppLayout bare>
      <PageHeader
        title="Uso de internet"
        description="Lectura actual y, del mes en curso, el mínimo, el máximo y el promedio de transmisión y recepción. Las muestras se guardan con cada sincronización de PRTG."
        icon={<Gauge className="h-5 w-5" aria-hidden />}
        actions={
          <a
            href={endpoints.usageXlsxUrl(applied)}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
          >
            <Download className="h-4 w-4" aria-hidden />
            Descargar XLSX
          </a>
        }
      />

      <form
        className="mb-4 max-w-md"
        onSubmit={(event) => {
          event.preventDefault()
          setApplied(search.trim())
        }}
      >
        <SearchField
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="CID o TSS"
        />
      </form>

      {report.isLoading ? <LoadingState /> : null}
      {report.isError ? <ErrorState message="No se pudo cargar el uso de internet" /> : null}

      {report.data && hasTop ? (
        <section className="mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">Top 5 Rural · Top 5 Urbano</h2>
              <p className="mt-0.5 text-sm text-slate-600">
                Mayor consumo del mes (TX/RX máx PRTG) y menos caídas. Estabilidad = % del mes operativo según
                downtime de incidencias y estado Ping.
              </p>
              {top?.period_label ? (
                <p className="mt-1 text-xs font-medium text-slate-500">{top.period_label}</p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => void handleExportImage()}
              disabled={exporting !== null}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60"
            >
              <ImageDown className="h-4 w-4" aria-hidden />
              {exporting === 'general' ? 'Exportando…' : 'Exportar imagen'}
            </button>
          </div>
          {exportError ? <p className="mb-3 text-sm text-red-600">{exportError}</p> : null}
          <div className="flex flex-col gap-4 xl:flex-row">
            <TopTable title="Top 5 Rural" accentClass="bg-emerald-100 text-emerald-800" rows={rural} />
            <TopTable title="Top 5 Urbano" accentClass="bg-sky-100 text-sky-800" rows={urbano} />
          </div>
        </section>
      ) : null}

      {report.data && hasCaballo ? (
        <section className="mb-6 rounded-xl border border-amber-200 bg-amber-50/40 p-4 shadow-sm">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">Caballococha</h2>
              <p className="mt-0.5 text-sm text-slate-600">
                Solo NODO ACCESO A = Caballococha (~18, GPON/P2P). Ranking por consumo de volumen PRTG en MB del
                01/11 al día actual (Sumas del histórico) y menos caídas, con TSS.
              </p>
              {topCaballo?.period_label ? (
                <p className="mt-1 text-xs font-medium text-slate-500">{topCaballo.period_label}</p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => void handleExportCaballo()}
              disabled={exporting !== null}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60"
            >
              <ImageDown className="h-4 w-4" aria-hidden />
              {exporting === 'caballococha' ? 'Exportando…' : 'Exportar imagen'}
            </button>
          </div>
          {exportErrorCaballo ? <p className="mb-3 text-sm text-red-600">{exportErrorCaballo}</p> : null}
          <div className="flex flex-col gap-4 xl:flex-row">
            <TopTable
              title="Top 5 Rural · Caballococha"
              accentClass="bg-emerald-100 text-emerald-800"
              rows={ruralCaballo}
              showTecnologia
              volumeMode
            />
            <TopTable
              title="Top 5 Urbano · Caballococha"
              accentClass="bg-sky-100 text-sky-800"
              rows={urbanoCaballo}
              showTecnologia
              volumeMode
            />
          </div>
        </section>
      ) : null}

      {report.data && report.data.rows.length === 0 ? (
        <EmptyState
          title="Sin sensores de tráfico"
          description="Cuando PRTG sincronice transmisión y recepción, cada colegio aparece aquí."
        />
      ) : null}

      {report.data && report.data.rows.length > 0 ? (
        <DataTableContainer>
          <table className="w-full min-w-[960px] border-collapse text-left text-sm">
            <thead className="bg-slate-800 text-xs tracking-wide text-white uppercase">
              <tr>
                {['CID', 'Local', 'Código', 'Provincia', 'TX actual', 'TX mín', 'TX máx', 'TX prom', 'RX actual', 'RX mín', 'RX máx', 'RX prom', 'Muestras'].map((h) => (
                  <th key={h} className="px-3 py-2 font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {report.data.rows.map((row) => (
                <tr key={String(row.assignment_id)} className="border-b border-slate-100 odd:bg-white even:bg-slate-50">
                  <td className="px-3 py-2 font-mono font-semibold">{row.cid ?? '—'}</td>
                  <td className="px-3 py-2 font-medium">{row.local_educativo ?? '—'}</td>
                  <td className="px-3 py-2 font-mono">{row.codigo_local ?? '—'}</td>
                  <td className="px-3 py-2">{row.provincia ?? '—'}</td>
                  <td className="px-3 py-2">{row.tx_actual ?? row.transmision ?? '—'}</td>
                  <td className="px-3 py-2">{row.tx_min ?? '—'}</td>
                  <td className="px-3 py-2">{row.tx_max ?? '—'}</td>
                  <td className="px-3 py-2">{row.tx_avg ?? '—'}</td>
                  <td className="px-3 py-2">{row.rx_actual ?? row.recepcion ?? '—'}</td>
                  <td className="px-3 py-2">{row.rx_min ?? '—'}</td>
                  <td className="px-3 py-2">{row.rx_max ?? '—'}</td>
                  <td className="px-3 py-2">{row.rx_avg ?? '—'}</td>
                  <td className="px-3 py-2 tabular-nums">{row.samples ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </DataTableContainer>
      ) : null}
    </AppLayout>
  )
}
