import { AppLayout } from '../../layouts/AppLayout'
import { SectionCard } from './Card'
import { useManualSync } from '../../features/dashboard/hooks/useDashboard'

export function PlaceholderPage({ title, note }: { title: string; note: string }) {
  const { prtg, cloudnet } = useManualSync()
  return (
    <AppLayout
      title={title}
      syncing={prtg.isPending || cloudnet.isPending}
      onSyncPrtg={() => prtg.mutate()}
      onSyncCloudnet={() => cloudnet.mutate()}
    >
      <SectionCard title={title}>
        <p className="text-sm text-noc-muted">{note}</p>
      </SectionCard>
    </AppLayout>
  )
}
