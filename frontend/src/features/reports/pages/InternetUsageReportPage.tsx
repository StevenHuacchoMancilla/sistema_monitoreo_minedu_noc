import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Download, Gauge } from 'lucide-react'
import { AppLayout } from '../../../layouts/AppLayout'
import { PageHeader } from '../../../components/ui/PageHeader'
import { SearchField } from '../../../components/ui/FormControls'
import { EmptyState, ErrorState, LoadingState } from '../../../components/ui/States'
import { DataTableContainer } from '../../../components/ui/DataTableFrame'
import { endpoints } from '../../../api/endpoints'

export function InternetUsageReportPage() {
  const [search, setSearch] = useState('')
  const [applied, setApplied] = useState('')
  const report = useQuery({
    queryKey: ['reports', 'usage', applied],
    queryFn: () => endpoints.usageReport(applied),
  })

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
