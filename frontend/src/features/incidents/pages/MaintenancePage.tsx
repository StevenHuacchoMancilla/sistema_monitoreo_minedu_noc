import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, ImageDown, RefreshCw, Search, Wrench } from 'lucide-react'
import { AppLayout } from '../../../layouts/AppLayout'
import { PageHeader } from '../../../components/ui/PageHeader'
import { FilterCard } from '../../../components/ui/FilterCard'
import { Button } from '../../../components/ui/Button'
import { FormField, Input, Select } from '../../../components/ui/FormControls'
import { EmptyState, ErrorState, LoadingState } from '../../../components/ui/States'
import { DataTableContainer } from '../../../components/ui/DataTableFrame'
import { endpoints } from '../../../api/endpoints'
import { usePermissions } from '../../auth/hooks/usePermissions'
import { P } from '../../auth/permissions'
import { inputClassName } from '../../../lib/uiTokens'
import { IncidentManageModal } from '../components/IncidentManageModal'
import { downloadMaintenanceTicketPng } from '../lib/downloadMaintenanceTicketPng'
import type { MaintenanceTicket } from '../types/maintenance'
import { limaDateTime } from '../types/maintenance'

type Tab = 'ABIERTO' | 'CERRADO'

function schoolLabel(row: MaintenanceTicket): string {
  const name = (row.local_educativo || row.school_name || '').trim()
  if (!name || /^\d+$/.test(name)) {
    return row.local_educativo && !/^\d+$/.test(row.local_educativo.trim())
      ? row.local_educativo.trim()
      : name || '—'
  }
  return name
}

export function MaintenancePage() {
  const { can } = usePermissions()
  const canManage = can(P.incidentsManage)
  const client = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const [tab, setTab] = useState<Tab>(() =>
    searchParams.get('tab') === 'finalizados' ? 'CERRADO' : 'ABIERTO',
  )
  const [q, setQ] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(25)
  const [manageId, setManageId] = useState<number | null>(null)
  const [pngBusy, setPngBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const next = tab === 'CERRADO' ? 'finalizados' : 'abiertos'
    if (searchParams.get('tab') !== next) {
      setSearchParams(tab === 'CERRADO' ? { tab: 'finalizados' } : {}, { replace: true })
    }
  }, [tab, searchParams, setSearchParams])

  const list = useQuery({
    queryKey: ['maintenance', tab, search, page, perPage],
    queryFn: () =>
      endpoints.listMaintenance({
        status: tab,
        q: search || undefined,
        page,
        per_page: perPage,
      }),
  })

  const rows = useMemo(
    () => (list.data?.data ?? []) as unknown as MaintenanceTicket[],
    [list.data],
  )
  const meta = list.data?.meta

  const closeTicket = useMutation({
    mutationFn: (incidentId: number) => endpoints.closeIncidentTicket(incidentId, 'Cierre de mantenimiento'),
    onSuccess: async () => {
      setError(null)
      await client.invalidateQueries({ queryKey: ['maintenance'] })
      await client.invalidateQueries({ queryKey: ['dashboard'] })
    },
    onError: (err: unknown) => setError(err instanceof Error ? err.message : 'No se pudo cerrar el ticket.'),
  })

  const applySearch = () => {
    setSearch(q.trim())
    setPage(1)
  }

  return (
    <AppLayout bare>
      <div className="min-w-0 space-y-5">
        <PageHeader
          icon={<Wrench className="h-5 w-5" />}
          title="Mantenimientos"
          description={
            tab === 'ABIERTO'
              ? 'Preventivos y mantenimientos abiertos. Completa el detalle de evento y cierra al terminar.'
              : 'Histórico cerrado. NOC cierre indica quién cerró cada uno. Puedes regenerar la imagen del ticket.'
          }
          breadcrumb={
            <p className="text-xs font-medium text-slate-500">
              NOC Loreto <span className="text-slate-300">/</span> Mantenimientos
            </p>
          }
          actions={
            <Button type="button" onClick={() => void list.refetch()}>
              <RefreshCw className="h-4 w-4" />
              Refrescar
            </Button>
          }
        />

        <div className="inline-flex rounded-xl border border-slate-200 bg-slate-100 p-1 dark:border-slate-700 dark:bg-slate-900">
          <button
            type="button"
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
              tab === 'ABIERTO'
                ? 'bg-teal-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-white/70 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100'
            }`}
            onClick={() => {
              setTab('ABIERTO')
              setPage(1)
            }}
          >
            Abiertos{meta ? ` · ${meta.open_count}` : ''}
          </button>
          <button
            type="button"
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
              tab === 'CERRADO'
                ? 'bg-slate-800 text-white shadow-sm dark:bg-slate-100 dark:text-slate-900'
                : 'text-slate-600 hover:bg-white/70 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100'
            }`}
            onClick={() => {
              setTab('CERRADO')
              setPage(1)
            }}
          >
            Finalizados{meta ? ` · ${meta.closed_count}` : ''}
          </button>
        </div>

        <FilterCard
          actions={
            <Button type="button" onClick={applySearch}>
              <Search className="h-4 w-4" />
              Buscar
            </Button>
          }
        >
          <FormField label="Buscar" className="sm:col-span-2 lg:col-span-3 xl:col-span-4">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
              <Input
                className="pl-9"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') applySearch()
                }}
                placeholder="Colegio, CID, TSS o código TGS…"
              />
            </div>
          </FormField>
          <FormField label="Por página" className="xl:col-span-1">
            <Select
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
          </FormField>
          <FormField label="Estado" className="xl:col-span-1">
            <Input
              className={`${inputClassName} cursor-default bg-slate-50 dark:bg-slate-950`}
              readOnly
              value={tab === 'ABIERTO' ? 'Abiertos' : 'Finalizados'}
            />
          </FormField>
        </FilterCard>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {list.isLoading ? <LoadingState /> : null}
        {list.isError ? <ErrorState message={list.error instanceof Error ? list.error.message : 'Error'} /> : null}

        {!list.isLoading && !list.isError && rows.length === 0 ? (
          <EmptyState
            title="Sin mantenimientos"
            description={
              tab === 'ABIERTO'
                ? 'Los preventivos y mantenimientos abiertos aparecerán aquí.'
                : 'Aún no hay mantenimientos finalizados.'
            }
          />
        ) : null}

        {rows.length > 0 ? (
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
              <div>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {tab === 'ABIERTO' ? 'Lista abierta' : 'Lista finalizada'}
                </h2>
                <p className="text-[12px] text-slate-500">
                  {meta?.total ?? rows.length} ticket{(meta?.total ?? rows.length) === 1 ? '' : 's'}
                  {search ? ` · filtro “${search}”` : ''}
                </p>
              </div>
            </div>
            <DataTableContainer>
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-900 text-[11px] uppercase tracking-wide text-white">
                  <tr>
                    <th className="whitespace-nowrap px-3 py-3">Ticket</th>
                    <th className="whitespace-nowrap px-3 py-3">Tipo</th>
                    <th className="min-w-[12rem] px-3 py-3">Colegio</th>
                    <th className="whitespace-nowrap px-3 py-3">CID / TSS</th>
                    <th className="whitespace-nowrap px-3 py-3">Técnico</th>
                    <th className="whitespace-nowrap px-3 py-3">{tab === 'ABIERTO' ? 'Apertura' : 'Cierre'}</th>
                    <th className="whitespace-nowrap px-3 py-3">{tab === 'ABIERTO' ? 'NOC apertura' : 'NOC cierre'}</th>
                    <th className="whitespace-nowrap px-3 py-3 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const school = schoolLabel(row)
                    return (
                      <tr key={row.id} className="border-t border-slate-100 align-top dark:border-slate-800">
                        <td className="px-3 py-3 font-mono text-[12px] font-semibold text-slate-900 dark:text-slate-100">
                          <span className="block max-w-[14rem] break-all">{row.ticket_code}</span>
                        </td>
                        <td className="px-3 py-3">
                          <span className="inline-flex rounded-full bg-teal-50 px-2.5 py-1 text-[11px] font-semibold text-teal-800 dark:bg-teal-950 dark:text-teal-200">
                            {row.kind_label}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-slate-700 dark:text-slate-300">
                          <div className="max-w-[16rem] font-medium" title={school}>
                            {school}
                          </div>
                          <div className="mt-0.5 text-[11px] text-slate-500">
                            {[row.province, row.district].filter(Boolean).join(' / ') || '—'}
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 font-mono text-[12px]">
                          {row.cid || '—'}
                          <span className="text-slate-400"> / </span>
                          {row.tss || '—'}
                        </td>
                        <td className="px-3 py-3 text-[12px] text-slate-700 dark:text-slate-300">
                          <div>{row.technician_name || '—'}</div>
                          {row.technician_phone ? (
                            <div className="mt-0.5 text-[11px] text-slate-500">{row.technician_phone}</div>
                          ) : null}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-[12px] text-slate-600 dark:text-slate-400">
                          {limaDateTime(tab === 'ABIERTO' ? row.opened_at : row.closed_at)}
                        </td>
                        <td className="px-3 py-3 text-[12px] font-medium text-slate-700 dark:text-slate-200">
                          {tab === 'ABIERTO' ? row.opened_by_name || '—' : row.closed_by_name || '—'}
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex flex-wrap items-center justify-end gap-2">
                            {row.incident_id ? (
                              <Button type="button" size="sm" variant="secondary" onClick={() => setManageId(row.incident_id)}>
                                {tab === 'ABIERTO' && canManage ? 'Editar' : 'Ver'}
                              </Button>
                            ) : null}
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              loading={pngBusy === row.ticket_code}
                              onClick={() => {
                                setPngBusy(row.ticket_code)
                                void downloadMaintenanceTicketPng(row)
                                  .catch((err: unknown) =>
                                    setError(err instanceof Error ? err.message : 'No se pudo generar la imagen.'),
                                  )
                                  .finally(() => setPngBusy(null))
                              }}
                            >
                              <ImageDown className="h-3.5 w-3.5" />
                              Imagen
                            </Button>
                            {tab === 'ABIERTO' && canManage && row.incident_id ? (
                              <Button
                                type="button"
                                size="sm"
                                loading={closeTicket.isPending && closeTicket.variables === row.incident_id}
                                onClick={() => {
                                  if (!window.confirm(`¿Cerrar mantenimiento ${row.ticket_code}?`)) return
                                  closeTicket.mutate(row.incident_id!)
                                }}
                              >
                                <Download className="h-3.5 w-3.5" />
                                Cerrar
                              </Button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </DataTableContainer>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 dark:border-slate-800">
              <p className="text-sm text-slate-500">
                Página {meta?.page ?? page} / {meta?.last_page ?? 1} · {meta?.total ?? rows.length} tickets
              </p>
              <div className="flex gap-2">
                <Button type="button" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  Anterior
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={page >= (meta?.last_page ?? 1)}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Siguiente
                </Button>
              </div>
            </div>
          </section>
        ) : null}
      </div>

      {manageId != null ? (
        <IncidentManageModal
          incidentId={manageId}
          initialTab={canManage ? 'management' : 'summary'}
          readOnly={!canManage}
          onClose={() => {
            setManageId(null)
            void client.invalidateQueries({ queryKey: ['maintenance'] })
          }}
        />
      ) : null}
    </AppLayout>
  )
}
