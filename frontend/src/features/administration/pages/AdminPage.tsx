import { useState } from 'react'
import { Activity, Users } from 'lucide-react'
import { AppLayout } from '../../../layouts/AppLayout'
import { SectionCard } from '../../../components/ui/Card'
import { useDashboardSummary, useManualSync } from '../../dashboard/hooks/useDashboard'
import { LoadingState, ErrorState } from '../../../components/ui/States'
import { useAuth } from '../../auth/context/AuthContext'
import { UsersAdminPanel } from '../components/UsersAdminPanel'

export function AdminPage() {
  const { user } = useAuth()
  const summary = useDashboardSummary()
  const { prtg, cloudnet } = useManualSync()
  const data = summary.data
  const isAdmin = Boolean(user?.is_admin)
  const [tab, setTab] = useState<'users' | 'diag'>(isAdmin ? 'users' : 'diag')

  return (
    <AppLayout
      bare
      syncing={prtg.isPending || cloudnet.isPending}
      onRefresh={() => void summary.refetch()}
      onSyncPrtg={() => prtg.mutate()}
      onSyncCloudnet={() => cloudnet.mutate()}
    >
      <div className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">Administración</h1>
        <p className="mt-1 text-sm font-medium text-slate-500">
          Usuarios del NOC y diagnóstico de sincronización.
        </p>
      </div>

      <div className="mb-5 flex gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1 w-fit">
        {isAdmin ? (
          <TabButton active={tab === 'users'} onClick={() => setTab('users')} icon={<Users className="h-3.5 w-3.5" />}>
            Usuarios
          </TabButton>
        ) : null}
        <TabButton active={tab === 'diag'} onClick={() => setTab('diag')} icon={<Activity className="h-3.5 w-3.5" />}>
          Diagnóstico
        </TabButton>
      </div>

      {tab === 'users' && isAdmin ? <UsersAdminPanel /> : null}

      {tab === 'diag' ? (
        <>
          {summary.isLoading ? <LoadingState /> : null}
          {summary.isError ? (
            <ErrorState message={summary.error instanceof Error ? summary.error.message : 'Error'} />
          ) : null}
          {data ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <SectionCard title="Última sync PRTG">
                <pre className="overflow-x-auto text-xs text-noc-muted">{JSON.stringify(data.sync.prtg, null, 2)}</pre>
              </SectionCard>
              <SectionCard title="Última sync Cloudnet">
                <pre className="overflow-x-auto text-xs text-noc-muted">{JSON.stringify(data.sync.cloudnet, null, 2)}</pre>
              </SectionCard>
              <SectionCard title="Pendientes operativos">
                <ul className="space-y-1 text-sm">
                  <li>Contactos pendientes match: {data.kpis.contactos_pendientes_match ?? 0}</li>
                  <li>Sites Cloudnet sin asociación: {data.kpis.sites_sin_asociacion}</li>
                  <li>Sin datos PRTG: {data.kpis.sin_datos_prtg}</li>
                  <li>Sin CID: {data.kpis.sin_cid}</li>
                </ul>
              </SectionCard>
              <SectionCard title="Salud">
                <pre className="overflow-x-auto text-xs text-noc-muted">{JSON.stringify(data.health, null, 2)}</pre>
              </SectionCard>
            </div>
          ) : null}
        </>
      ) : null}
    </AppLayout>
  )
}

function TabButton({
  active,
  onClick,
  children,
  icon,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
  icon: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition',
        active ? 'bg-white text-violet-700 shadow-sm' : 'text-slate-600 hover:text-slate-900',
      ].join(' ')}
    >
      {icon}
      {children}
    </button>
  )
}
