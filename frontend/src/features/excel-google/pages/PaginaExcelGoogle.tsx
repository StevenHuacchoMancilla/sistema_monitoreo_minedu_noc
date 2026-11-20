import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { CircleAlert, CircleCheck, Copy, Sheet } from 'lucide-react'
import { endpoints } from '../../../api/endpoints'
import { ApiError } from '../../../api/clienteHttp'
import { DisenoApp } from '../../../layouts/DisenoApp'
import { EncabezadoPagina } from '../../../components/ui/EncabezadoPagina'
import { FormField, Input, Select } from '../../../components/ui/ControlesFormulario'
import { Boton } from '../../../components/ui/Boton'
import { TarjetaMetrica } from '../../../components/ui/TarjetaMetrica'
import { GrillaMetricas } from '../../../components/ui/GrillaMetricas'
import {
  DataTableContainer,
  tableClassName,
  thClassName,
  theadClassName,
  trClassName,
} from '../../../components/ui/MarcoTablaDatos'
import { ErrorState } from '../../../components/ui/Estados'
import type { ExcelGoogleFila, ExcelGooglePeriodo } from '../types'

const cell = 'px-2.5 py-2 align-middle whitespace-nowrap text-[13px] text-slate-700 dark:text-slate-300'
const caja =
  'w-full rounded-xl border border-slate-200 bg-slate-50 p-3 font-mono text-xs text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200'

function messageOf(error: unknown): string {
  if (error instanceof ApiError) return error.message
  if (error instanceof Error && error.message) return error.message
  return 'No se pudo comparar con el Excel.'
}

function fechaHoraLocal(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function inicioDeHoy(): string {
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  return fechaHoraLocal(date)
}

function RazonMinedu({ value }: { value: string | null | undefined }) {
  const text = (value ?? '').trim()
  if (!text) return <span className="text-slate-400">—</span>
  const key = text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
  const tone = key.includes('enlace')
    ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-200'
    : key.includes('requerimiento')
      ? 'bg-violet-100 text-violet-800 dark:bg-violet-950/60 dark:text-violet-200'
      : key.includes('queja')
        ? 'bg-orange-100 text-orange-800 dark:bg-orange-950/60 dark:text-orange-200'
        : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${tone}`}>{text}</span>
}

function EstadoTicket({ value }: { value: string | null | undefined }) {
  const text = (value ?? '').trim()
  if (!text) return <span className="text-slate-400">Sin estado</span>
  const abierto = text.toUpperCase() === 'ABIERTO'
  const cerrado = text.toUpperCase() === 'CERRADO'
  const tone = abierto
    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200'
    : cerrado
      ? 'bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-200'
      : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${tone}`}>{text}</span>
}

function Tabla({ rows, modo }: { rows: ExcelGoogleFila[]; modo: 'faltan' | 'ya' | 'recuperado' }) {
  const conExcel = modo !== 'faltan'
  const recuperado = modo === 'recuperado'

  return (
    <DataTableContainer>
      <table className={tableClassName}>
        <thead className={theadClassName}>
          <tr>
            {conExcel ? <th className={thClassName}>Fila</th> : null}
            <th className={thClassName}>CID</th>
            <th className={thClassName}>TSS</th>
            {conExcel ? <th className={thClassName}>Estado ticket</th> : null}
            {conExcel ? <th className={thClassName}>Razón (MINEDU)</th> : null}
            <th className={thClassName}>Local</th>
            <th className={thClassName}>Provincia</th>
            <th className={thClassName}>Distrito</th>
            <th className={thClassName}>{recuperado ? 'Caída' : 'Caído desde'}</th>
            {recuperado ? <th className={thClassName}>Restablecimiento</th> : null}
            {conExcel ? <th className={thClassName}>Ticket</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${modo}-${row.cid}`} className={trClassName}>
              {conExcel ? <td className={cell}>{row.fila}</td> : null}
              <td className={`${cell} font-mono`}>{row.cid}</td>
              <td className={cell}>{row.tss ?? '—'}</td>
              {conExcel ? (
                <td className={cell}>
                  <EstadoTicket value={row.estado_ticket} />
                </td>
              ) : null}
              {conExcel ? (
                <td className={cell}>
                  <RazonMinedu value={row.razon_minedu} />
                </td>
              ) : null}
              <td className={cell}>{row.local_educativo || '—'}</td>
              <td className={cell}>{row.provincia || '—'}</td>
              <td className={cell}>{row.distrito || '—'}</td>
              <td className={cell}>
                {row.caido_desde || '—'}
                {!recuperado && row.nota ? <span className="mt-0.5 block text-[11px] font-medium text-amber-700 dark:text-amber-300">{row.nota}</span> : null}
              </td>
              {recuperado ? (
                <td className={cell}>
                  {row.restablecido_en || '—'}
                  {!row.caido_desde && !row.restablecido_en && row.nota ? (
                    <span className="mt-0.5 block text-[11px] font-medium text-amber-700 dark:text-amber-300">{row.nota}</span>
                  ) : null}
                </td>
              ) : null}
              {conExcel ? <td className={`${cell} font-mono`}>{row.ticket || '—'}</td> : null}
            </tr>
          ))}
        </tbody>
      </table>
    </DataTableContainer>
  )
}

function CajaCopia({
  titulo,
  valor,
  filas,
}: {
  titulo: string
  valor: string
  filas: number
}) {
  const [copiado, setCopiado] = useState(false)

  return (
    <div className="min-w-0 flex-1 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{titulo}</h3>
        <Boton
          type="button"
          variant="secondary"
          size="sm"
          disabled={valor === ''}
          onClick={() => {
            void navigator.clipboard.writeText(valor).then(() => setCopiado(true))
          }}
        >
          <Copy className="h-3.5 w-3.5" aria-hidden />
          {copiado ? 'Copiado' : 'Copiar'}
        </Boton>
      </div>
      <textarea
        readOnly
        value={valor}
        rows={Math.min(14, Math.max(4, filas))}
        className={caja}
        onFocus={(event) => event.currentTarget.select()}
      />
    </div>
  )
}

export function PaginaExcelGoogle() {
  const [fila, setFila] = useState('')
  const [periodo, setPeriodo] = useState<ExcelGooglePeriodo>('hoy')
  const [desdeHora, setDesdeHora] = useState(inicioDeHoy)
  const [hastaHora, setHastaHora] = useState(() => fechaHoraLocal(new Date()))
  const comparar = useMutation({
    mutationFn: endpoints.excelGoogleComparar,
  })
  const data = comparar.data

  const submit = () => {
    const desde = Number(fila)
    if (!Number.isInteger(desde) || desde < 1) return
    if (periodo === 'desde' && desdeHora === '') return
    if (periodo === 'rango' && (desdeHora === '' || hastaHora === '')) return
    comparar.mutate({
      desde,
      periodo,
      desde_hora: periodo === 'hoy' ? undefined : desdeHora,
      hasta_hora: periodo === 'rango' ? hastaHora : undefined,
    })
  }

  const horario =
    data == null
      ? ''
      : data.periodo_hasta
        ? `${data.periodo_desde} a ${data.periodo_hasta}`
        : `desde ${data.periodo_desde}`

  return (
    <DisenoApp title="Excel de Google">
      <EncabezadoPagina
        icon={<Sheet />}
        title="Excel de Google"
        description="Hoy compara todas las caídas rojas que siguen activas, no solo las que empezaron hoy, contra los tickets ABIERTOS desde la fila indicada. Un cerrado no cuenta. Si sigue caído y no tiene ticket abierto, sale en Faltan poner. Las intermitencias no entran."
      />

      <form
        className="mb-5 flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
      >
        <FormField label="Desde la fila" htmlFor="excel-fila" className="w-36">
          <Input
            id="excel-fila"
            inputMode="numeric"
            placeholder="4380"
            value={fila}
            onChange={(event) => setFila(event.target.value.replace(/\D/g, ''))}
          />
        </FormField>
        <FormField label="Horario de la caída" htmlFor="excel-periodo" className="w-52">
          <Select
            id="excel-periodo"
            value={periodo}
            onChange={(event) => setPeriodo(event.target.value as ExcelGooglePeriodo)}
          >
            <option value="hoy">Hoy: todas las que siguen caídas</option>
            <option value="desde">Desde una hora en adelante</option>
            <option value="rango">Rango de fecha y hora</option>
          </Select>
        </FormField>
        {periodo !== 'hoy' ? (
          <FormField label={periodo === 'rango' ? 'Desde' : 'Desde esta hora'} htmlFor="excel-desde" className="w-52">
            <Input id="excel-desde" type="datetime-local" value={desdeHora} onChange={(event) => setDesdeHora(event.target.value)} />
          </FormField>
        ) : null}
        {periodo === 'rango' ? (
          <FormField label="Hasta" htmlFor="excel-hasta" className="w-52">
            <Input id="excel-hasta" type="datetime-local" value={hastaHora} onChange={(event) => setHastaHora(event.target.value)} />
          </FormField>
        ) : null}
        <Boton type="submit" variant="primary" loading={comparar.isPending} disabled={fila === ''}>
          Comparar
        </Boton>
      </form>

      {comparar.isError ? <ErrorState message={messageOf(comparar.error)} /> : null}

      {data ? (
        <div className="space-y-6">
          <GrillaMetricas>
            <TarjetaMetrica icon={<CircleAlert />} label="Caídas comparadas" value={data.caidas_prtg} description={data.periodo === 'hoy' ? 'Caídas rojas que siguen activas. Las intermitencias no entran.' : horario} tone="danger" />
            <TarjetaMetrica icon={<CircleCheck />} label="Ya están en el Excel" value={data.ya_en_excel.length} description="Caídas con ticket abierto desde esa fila" tone="success" />
            <TarjetaMetrica icon={<Copy />} label="Faltan poner" value={data.faltan.length} description="Caídas sin ticket abierto en ese tramo" tone="warning" />
          </GrillaMetricas>

          <p className="text-[13px] text-slate-500 dark:text-slate-400">
            Ya están ({data.ya_en_excel.length}) + Faltan ({data.faltan.length}) = {data.ya_en_excel.length + data.faltan.length} caídas comparadas.
            El número de Caídas totales del menú también cuenta las intermitencias; aquí no.
          </p>

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Faltan poner en el Excel</h2>
            {data.faltan.length === 0 ? (
              <p className="text-sm text-slate-500">Ninguna caída de ese horario falta desde la fila {data.desde_fila}.</p>
            ) : (
              <>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <CajaCopia titulo="CID" valor={data.texto_cid} filas={data.faltan.length} />
                  <CajaCopia titulo="TSS" valor={data.texto_tss} filas={data.faltan.length} />
                </div>
                <Tabla rows={data.faltan} modo="faltan" />
              </>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Ya están en el Excel</h2>
            {data.ya_en_excel.length === 0 ? (
              <p className="text-sm text-slate-500">Ninguna caída de ese horario aparece desde la fila {data.desde_fila}.</p>
            ) : (
              <Tabla rows={data.ya_en_excel} modo="ya" />
            )}
          </section>

          {data.abiertos_sin_caida.length > 0 ? (
            <section className="space-y-3">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Abiertos en el Excel que ahora no están caídos</h2>
              <p className="text-sm text-slate-500">No entran en la suma. Están abiertos en el Excel y el PRTG ya no los tiene caídos: conviene cerrarlos. La caída y el restablecimiento salen del último registro del sistema.</p>
              <Tabla rows={data.abiertos_sin_caida} modo="recuperado" />
            </section>
          ) : null}
        </div>
      ) : null}
    </DisenoApp>
  )
}
