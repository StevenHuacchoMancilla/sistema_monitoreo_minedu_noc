import { useQuery } from '@tanstack/react-query'
import { Download, FileSpreadsheet } from 'lucide-react'
import { AppLayout } from '../../../layouts/AppLayout'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Badge } from '../../../components/ui/SoftBadge'
import { ErrorState, LoadingState } from '../../../components/ui/States'
import { DataTableContainer } from '../../../components/ui/DataTableFrame'
import { endpoints } from '../../../api/endpoints'

const TONE: Record<string, string> = {
  CAIDA_ENLACE: 'bg-sky-50',
  CAIDA_ENERGIA: 'bg-amber-50',
  REQUERIMIENTO: 'bg-slate-50',
}

const COLUMNS: Array<{ key: string; label: string }> = [
  { key: 'codigo_local', label: 'Código local' },
  { key: 'local_educativo', label: 'Institución educativa' },
  { key: 'departamento', label: 'Departamento' },
  { key: 'provincia', label: 'Provincia' },
  { key: 'distrito', label: 'Distrito' },
  { key: 'contacto', label: 'Contacto' },
  { key: 'minedu_label', label: 'Tipo' },
  { key: 'reportado_at', label: 'Reporte' },
  { key: 'ticket_at', label: 'Ticket' },
  { key: 'solucion_at', label: 'Solución' },
  { key: 'horas_totales', label: 'Total 24 h' },
  { key: 'horas_efectivas', label: 'Efectiva 8–16' },
  { key: 'detalle', label: 'Solución aplicada' },
  { key: 'actividades', label: 'Actividades' },
]

export function MineduReportPage() {
  const report = useQuery({
    queryKey: ['reports', 'minedu'],
    queryFn: endpoints.mineduReport,
  })

  return (
    <AppLayout bare>
      <PageHeader
        title="Anexo 30 · atención de incidentes"
        description="Total es el reloj de 24 horas. Efectiva solo cuenta de 8:00 a 16:00 y resta la parada de reloj que cae en ese horario."
        icon={<FileSpreadsheet className="h-5 w-5" aria-hidden />}
        actions={
          <a
            href={endpoints.mineduXlsxUrl()}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
          >
            <Download className="h-4 w-4" aria-hidden />
            Descargar XLSX
          </a>
        }
      />

      {report.isLoading ? <LoadingState /> : null}
      {report.isError ? <ErrorState message="No se pudo cargar el Anexo 30" /> : null}

      {report.data ? (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-3">
            {report.data.groups.map((group) => (
              <div key={group.key} className={`rounded-xl border border-slate-200 px-4 py-3 ${TONE[group.key] ?? 'bg-white'}`}>
                <p className="text-xs font-semibold tracking-wide uppercase">{group.label}</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">{group.total}</p>
              </div>
            ))}
          </div>
          {report.data.rows.length === 0 ? (
            <p className="mb-3 text-sm text-slate-500">
              Todavía no hay caídas con razón MINEDU este mes. La vista previa ya tiene las columnas del Excel.
            </p>
          ) : null}
          <DataTableContainer>
            <table className="w-full min-w-[1400px] border-collapse text-left text-sm">
              <thead className="bg-blue-700 text-[11px] tracking-wide text-white uppercase">
                <tr>
                  <th className="px-3 py-2 font-semibold">N°</th>
                  {COLUMNS.map((column) => (
                    <th key={column.key} className="px-3 py-2 font-semibold">{column.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {report.data.rows.length === 0 ? (
                  <tr>
                    <td className="px-3 py-8 text-center text-slate-500" colSpan={COLUMNS.length + 1}>
                      Sin registros. Asigna Caída de enlace, Caída de energía o Requerimiento en la gestión.
                    </td>
                  </tr>
                ) : report.data.rows.map((row, index) => (
                  <tr key={String(row.incident_id)} className={`border-b border-slate-200 ${TONE[String(row.minedu_reason)] ?? 'bg-white'}`}>
                    <td className="px-3 py-2 tabular-nums">{index + 1}</td>
                    {COLUMNS.map((column) => (
                      <td key={column.key} className="max-w-xs px-3 py-2 align-top whitespace-pre-wrap">{row[column.key] ?? '—'}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </DataTableContainer>
          <p className="mt-3 text-xs text-slate-500">
            <Badge tone="neutral">{report.data.total} registro(s) del mes</Badge>
          </p>
        </>
      ) : null}
    </AppLayout>
  )
}
